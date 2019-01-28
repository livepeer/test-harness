'use strict'

const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const { each, eachLimit, timesLimit, filter, map } = require('async')
const dockercompose = require('docker-compose')
const YAML = require('yaml')

const NetworkCreator = require('./networkcreator')
const Swarm = require('./swarm')
const Api = require('./api')
const utils = require('./utils/helpers')
const { wait, getNames } = require('./utils/helpers')
const { prettyPrintDeploymentInfo } = require('./helpers')

const DIST_DIR = '../dist'
const DEFAULT_MACHINES = 5

class TestHarness {
  constructor () {
    this.swarm = new Swarm()
    this.distDir = path.resolve(__dirname, DIST_DIR)
  }

  restartService (serviceName, cb) {
    dockercompose.restartOne(serviceName, {
      cwd: path.join(this.distDir, this._config.name),
      log: true
    }).then(cb)
  }

  AlreadyExists (name, cb) {
    exec(`docker-machine ls -q --filter "name=${name}-([a-z]+)"`, (err, output) => {
      if (err) throw err
      if (output && output.length > 0) {
        console.log(`${name} machines already exists`)
        cb(null, true)
      } else {
        cb(null)
      }
    })
  }

  getDockerComposePath(config) {
    return path.join(this.distDir, DIST_DIR, config.name, 'docker-compose.yml')
  }

  parseComposeAndGetAddresses (config, cb) {
    return new Promise((resolve, reject) => {
      let parsedCompose = null
      try {
        let file = fs.readFileSync(this.getDockerComposePath(config), 'utf-8')
        parsedCompose = YAML.parse(file)
      } catch (e) {
        reject(e)
        throw e
      }
      // console.log('==== PARSED compose yaml:', parsedCompose)

      map(parsedCompose.services, (service, next) => {
        // console.log('service.environment = ', service.environment)
        if (service.environment && service.environment.JSON_KEY) {
          let addressObj = JSON.parse(service.environment.JSON_KEY)
          console.log('address to fund: ', addressObj.address)
          next(null, addressObj.address)
        } else {
          next()
        }
      }, (err, addressesToFund) => {
        if (err) throw err
        // clear out the undefined
        filter(addressesToFund, (address, cb) => {
          cb(null, !!address) // bang bang
        }, (err, addresses) => {
          if (err) throw err
          console.log('addresses results: ', addresses)
          const results = {
            parsedCompose,
            addresses 
          }
          resolve(results)
          if (cb) {
            cb(null, results)
          }
        })
      })
    })
  }

  onReady(config, cb) {
    if (config.local) {

    } else {
      this.parseComposeAndGetAddresses(config, (err, results) => {
        if (err) throw err
        let parsedCompose = results.parsedCompose
        eachLimit(results.addresses, 5, (address, cb) => {
          utils.fundRemoteAccount(config.name, address, '1', `livepeer_geth`, cb)
        }, (err) => {
          if (err) throw err
          console.log('funding secured!!')
          this.swarm.getPubIP(`${config.name}-manager`, (err, pubIP) => {
            if (err) throw err
            setTimeout(() => {
              cb(null, {
                parsedCompose,
                baseUrl: pubIP.trim(),
                config: config
              })
            }, 10000)
          })
        })
      })
    }
  }

  run (config, cb) {
    // 1. [ ] validate the configurations
    // 2. [x] provision GCP machines
    // 3. scp docker-compose.yml, livepeer binary and git test-harness
    // 4. create throwaway docker registry
    // 5. initiate swarm, add workers
    // 6. build lpnode with lp binary, push it to registry
    // 7. deploy geth-with-protocol, fund accounts.
    // 8. deploy lpnodes
    // 9. setup transcoders/orchestrators
    // 10. setup broadcasters.
    // 11. initializeRound.
    // 12. start streams.
    // 13. pipe logs to bucket or download them.
    // 14. teardown the cluster.
    // 15. callback.
    config.name = config.name || 'testharness'
    this.swarm._managerName = `${config.name}-manager`

    this._config = config

    // this.prettyPrintDeploymentInfo(config)
    // return
    this.networkCreator = new NetworkCreator(config)
    this.networkCreator.generateComposeFile(`${DIST_DIR}/${config.name}`, (err) => {
      if (err) return handleError(err)
      // return

      if (config.local) {
        this.runLocal(config, cb)
      } else {
        this.runSwarm(config)
          .then(r => cb(null, r))
          .catch(cb)
      }
    })
  }

  runLocal(config, cb) {
    // copy binaries
    // build lpnode:latest
    // run geth:pm
    // 420 funding secured
    // run the lpnodes
    // profit.
    this.networkCreator.loadBinaries(`../containers/lpnode/binaries`, (err) => {
      if (err) throw err
      this.networkCreator.buildLpImage((err) => {
        if (err) throw err
        dockercompose.upOne(`geth`, {
          cwd: path.resolve(__dirname, `${DIST_DIR}/${config.name}`),
          log: true
        }).then((logs) => {
          console.warn('docker-compose warning: ', logs.err)
          console.log('geth is up...', logs.out)
          setTimeout(() => {
            // fund accounts here.
            // ----------------[eth funding]--------------------------------------------
            let parsedCompose = null
            try {
              let file = fs.readFileSync(this.getDockerComposePath(config), 'utf-8')
              parsedCompose = YAML.parse(file)
            } catch (e) {
              throw e
            }

            map(parsedCompose.services, (service, next) => {
              // console.log('service.environment = ', service.environment)
              if (service.environment && service.environment.JSON_KEY) {
                let addressObj = JSON.parse(service.environment.JSON_KEY)
                console.log('address to fund: ', addressObj.address)
                next(null, addressObj.address)
              } else {
                next()
              }
            }, (err, addressesToFund) => {
              if (err) throw err
              // clear out the undefined
              filter(addressesToFund, (address, cb) => {
                cb(null, !!address) // bang bang
              }, (err, results) => {
                if (err) throw err
                console.log('results: ', results)

                each(results, (address, cb) => {
                  utils.fundAccount(address, '1', `${config.name}_geth_1`, cb)
                }, (err) => {
                  if (err) throw err
                  console.log('funding secured!!')
                  dockercompose.upAll({
                    cwd: path.resolve(__dirname, `${DIST_DIR}/${config.name}`),
                    log: true
                  }).then((logs) => {
                    console.warn('docker-compose warning: ', logs.err)
                    console.log('all lpnodes are up: ', logs.out)
                    this.api = new Api(parsedCompose)
                    setTimeout(() => {
                      cb(null, {parsedCompose})
                    }, 10000)
                  }).catch((e) => { if (e) throw e })
                })
              })
            })
            // -------------------------------------------------------------------------
          }, 5000)
        }).catch((e) => { if (e) throw e })
      })
    })
  } 

  async runSwarm(config) {
    // copy binaries to the manager instance.
    // I have a slow connection . so i'm not uploading the binary for testing.
    // TODO UNCOMMENT THIS BEFORE MERGE
    // this.networkCreator.loadBinaries(`${DIST_DIR}/${config.name}`, (err) => {
    //   if (err) throw err
    // })
    config.machines = config.machines || {
      num: DEFAULT_MACHINES,
      zone: 'us-east1-b',
      machineType: 'n1-standard-2'
    }

    config.machines.tags = `${config.name}-cluster`

    console.log('machines config', config.machines)

    if (config.localBuild) {
      await this.networkCreator.buildLocalLpImage()
    }

    const notCreatedNow = await this.swarm.createSwarm(config)
    // result = {internalIp, token, networkId}
    if (!notCreatedNow) {
      await this.swarm.createRegistry()
    }
    // if (err) throw err
    // if (err) console.log('create registry error : ', err)
    let experiment
    if (config.localBuild) {
      experiment = await this.finishSetup(config)
    } else {
      experiment = await this.setupManager(config)
    }
    this.api = new Api(experiment.parsedCompose, experiment.baseUrl)
    if (config.standardSetup) {
      await this.standardSetup(config)
    }
    await this.swarm.restartService('metrics')
    console.log('restarted metrics service')

    const workers = getNames(`${config.name}-worker-`, config.machines.num-1, 1)
    await prettyPrintDeploymentInfo(workers, config.name, experiment.parsedCompose)
    return experiment
  }

  assignBroadcasters2Orchs (config) {
    const numOrchs = config.nodes.orchestrators.instances
    const numBroad = config.nodes.broadcasters.instances
    const res = {}
    const bnames = Array.from({length: numBroad}, (_, i) => `broadcaster_${i}`)
    for (let i = 0, oi = 0; i < bnames.length; i++) {
      const oname = `orchestrator_${oi}`
      if (!res[oname]) {
        res[oname] = []
      }
      res[oname].push(bnames[i])
      oi = ++oi % numOrchs
    }
    console.log(res)
    return res
  }

  async standardSetup (config) {
      console.log('requesting tokens')
      await this.api.requestTokens(['all'])
      console.log('Depositing....')
      await this.api.fundAndApproveSigners(['all'], '5000000000', '500000000000000000')
      console.log('Initialize round...')
      await this.api.initializeRound(['orchestrator_0'])
      console.log('activating orchestrators...')
      await this.api.activateOrchestrator(['orchestrators'], {
        blockRewardCut: '10',
        feeShare: '5',
        pricePerSegment: '1',
        amount: '500'
        // ServiceURI will be set by the test-harness.
      })
      // bond
      const o2b = this.assignBroadcasters2Orchs(config)
      await Promise.all(Object.keys(o2b).map(oname => this.api.bond(o2b[oname], '5000', oname)))
      const onames = Array.from({length: config.nodes.orchestrators.instances}, (_, i) => `orchestrator_${i}`)
      await Promise.all(onames.map(n => this.swarm.restartService(n)))
      console.log(`restarted ${onames.length} orchestrators`)
      const bnames = Array.from({length: config.nodes.broadcasters.instances}, (_, i) => `broadcaster_${i}`)
      await Promise.all(bnames.map(n => this.swarm.restartService(n)))
      console.log(`restarted ${bnames.length} broadcasters`)
  }

  setupManager(config) {
    return new Promise((resolve, reject) => {
      this.swarm.setupManager(config, (err, output) => {
        if (err) {
          reject(err)
          throw err
        }
        //
        // deploy the stack.
        utils.remotelyExec(
          `${config.name}-manager`,
          config.machines.zone,
          `cd /tmp/config && sudo docker stack deploy -c docker-compose.yml livepeer`,
          (err, outputBuf) => {
            if (err) {
              reject(err)
              throw err
            }
            console.log('stack deployed ', (outputBuf) ? outputBuf.toString() : outputBuf)
            this.fundAccounts(config).then(resolve, reject)
          }
        )
      })
    })
  }

  async finishSetup(config) {
    const configName = config.name
    console.log('== finish setup ' + configName)
    const managerName = `${configName}-manager`
    // await this.networkCreator.buildLocalLpImage()
    await this.saveLocalDockerImage()
    const loadToWorkers = [this.loadLocalDockerImageToSwarm(managerName)]
    for (let i = 0; i < config.machines.num - 1; i++) {
      const workerName = `${configName}-worker-${ i+1 }`
      loadToWorkers.push(this.loadLocalDockerImageToSwarm(workerName))
    }
    await Promise.all(loadToWorkers)
    console.log('docker image pushed')
    await this.swarm.deployComposeFile(this.getDockerComposePath(config), 'livepeer', managerName)
    const results = await this.fundAccounts(config)
    return results
  }

  async saveLocalDockerImage() {
    return new Promise((resolve, reject) => {
      // exec(`docker save -o /tmp/lpnodeimage.tar lpnode:latest`, (err, stdout) =>
      const cmd = 'docker save  lpnode:latest | gzip -9 > /tmp/lpnodeimage.tar.gz'
      exec(cmd, (err, stdout) => {
        if (err) return reject(err)
        console.log('lpnode image saved')
        resolve()
      })
    })
  }

  async loadLocalDockerImageToSwarm(managerName) {
    console.log('Loading lpnode docker image into swarm ' + managerName)
    return new Promise((resolve, reject) => {
      this.swarm.setEnv(managerName, (err, env) => {
        if (err) return reject(err)
        exec(`docker load -i /tmp/lpnodeimage.tar.gz`, {env}, (err, stdout) => {
          if (err) return reject(err)
          console.log('lpnode image loaded into swarm ' + managerName)
          resolve()
        })
      })
    })
  }

  async fundAccounts(config) {
    await wait(10000)
    // fund accounts here.
    const results = await this.parseComposeAndGetAddresses(config)
    console.log('=========== GOT RESULTS ', results)
     
    let parsedCompose = results.parsedCompose
    await this.fundAccountsList(config, results.addresses)
    console.log('funding secured!!')
    const pubIP = await this.swarm.getPubIP(`${config.name}-manager`)
    await wait(10000)
    return {
      parsedCompose,
      config,
      baseUrl: pubIP.trim()
    }
  }

  fundAccountsList(config, addresses) {
    return new Promise((resolve, reject) => {
      eachLimit(addresses, 10, (address, cb) => {
        utils.fundRemoteAccount(config, address, '1', `livepeer_geth`, cb)
      }, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }
}

function handleError (err) {
  // TODO handle errors gracefully
  throw err
}

module.exports = TestHarness
