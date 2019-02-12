'use strict'

const path = require('path')
const chalk = require('chalk')
const { exec } = require('child_process')
const { each, eachLimit, timesLimit, filter, map } = require('async')
const dockercompose = require('docker-compose')

const NetworkCreator = require('./networkcreator')
const Swarm = require('./swarm')
const Api = require('./api')
const utils = require('./utils/helpers')
const { wait, getNames, parseComposeAndGetAddresses } = require('./utils/helpers')
const { prettyPrintDeploymentInfo } = require('./helpers')

const DIST_DIR = '../dist'
const DEFAULT_MACHINES = 5
const getOName = new RegExp('.*\/(orchestrator_\\d+):')

class TestHarness {
  constructor () {
    this.swarm = new Swarm()
    this.distDir = path.resolve(__dirname, DIST_DIR)
  }

  restartService (serviceName, cb) {
    if (this._config.local) {
      return dockercompose.restartOne(serviceName, {
        cwd: path.join(this.distDir, this._config.name),
        log: true
      }).then(r => {
        if (cb) {
          cb(null, r)
        }
        return r
      })
    } else {
      return this.swarm.restartService(serviceName, cb)
    }
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


  onReady (config, cb) {
    if (config.local) {

    } else {
      const parsedCompose = parseComposeAndGetAddresses(config.name)
      eachLimit(parsedCompose.addresses, 5, (address, cb) => {
        utils.fundRemoteAccount(config.name, address, '1', `livepeer_geth`, cb)
      }, (err) => {
        if (err) throw err
        console.log('funding secured!!')
        this.swarm.getPubIP(`${config.name}-manager`, (err, pubIP) => {
          if (err) throw err
          setTimeout(() => {
            cb(null, {
              parsedCompose,
              baseUrl: pubIP,
              config: config
            })
          }, 10000)
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
    this.swarm = new Swarm(config.name)

    this._config = config

    // prettyPrintDeploymentInfo(config)
    // return
    this.networkCreator = new NetworkCreator(config)
    this.networkCreator.generateComposeFile(`${DIST_DIR}/${config.name}`, (err) => {
      if (err) return handleError(err)
      // return

      if (config.local) {
        this.runLocal(config)
          .then(r => cb(null, r))
          .catch(cb)
      } else {
        this.runSwarm(config)
          .then(r => cb(null, r))
          .catch(cb)
      }
    })
  }

  async runLocal(config) {
    // copy binaries
    // build lpnode:latest
    // run geth:pm
    // 420 funding secured
    // run the lpnodes
    // profit.
    await this.networkCreator.loadBinaries(`../containers/lpnode/binaries`)
    await this.networkCreator.buildLpImage()
    let logs = await dockercompose.upOne(`geth`, {
      cwd: path.resolve(__dirname, `${DIST_DIR}/${config.name}`),
      log: true
    })
    console.warn('docker-compose warning: ', logs.err)
    console.log('geth is up...', logs.out)
    await wait(5000)
    const parsedCompose = parseComposeAndGetAddresses(config.name)

    await Promise.all(parsedCompose.addresses.map(address => {
      return utils.fundAccount(address, '1', `${config.name}_geth_1`)
    }))
    console.log('funding secured!!')
    logs = await dockercompose.upAll({
      cwd: path.resolve(__dirname, `${DIST_DIR}/${config.name}`),
      log: true
    })
    console.warn('docker-compose warning: >>>', logs.err, "<<<")
    if ((logs.err+'').includes('Encountered errors while bringing up the project')) {
      process.exit(11)
    }
    console.log('all lpnodes are up: ', logs.out)
    // console.log('waiting 10s')
    this.api = new Api(parsedCompose)
    await wait(10000)
    const experiment = {
      parsedCompose,
      baseUrl: '',
      config
    }
    await this.setupEnd(config, experiment)
    return experiment
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
    return await this.setupEnd(config, experiment)
  }

  async setupEnd(config, experiment) {
    this.api = new Api(experiment.parsedCompose, experiment.baseUrl)
    let setupSuccess = false

    if (config.standardSetup) {
      setupSuccess =  await this.standardSetup(config)
    }
    if (config.startMetricsServer) {
      await this.restartService('metrics')
      console.log('restarted metrics service')
    }

    await prettyPrintDeploymentInfo(experiment.parsedCompose)
    if (config.standardSetup && !setupSuccess) {
      console.log(chalk.red('Configuration was not successful, please check logs!'))
    }
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
      let setupSuccess = true
      const bnames = Array.from({length: config.nodes.broadcasters.instances}, (_, i) => `broadcaster_${i}`)
      const orchConf = {
        blockRewardCut: '10',
        feeShare: '5',
        pricePerSegment: '1',
        amount: '500'
      }
      
      let tr = 0
      while (true) {
        if (tr++ > 12) {
          console.log(chalk.red(`Tried to request token ${tr} times, giving up.`))
          return false
        }
        try {
          console.log('requesting tokens')
          await this.api.requestTokens(['all'])
        } catch(e) {
          console.log(e)
          await wait(2000)
          continue
        }
        break
      }
      console.log('Depositing....')
      await this.api.fundAndApproveSigners(['all'], '5000000000', '500000000000000000')
      // check if deposit was successful
      tr = 0
      while (true) {
        let succeed = 0
        for (let i = 0; i < bnames.length; i++) {
          const senderInfo = await this.api.getSenderInfo(bnames[i])
          if (senderInfo.Deposit) {
            succeed++
          }
        }
        if (succeed == bnames.length) {
          break
        }
        if (tr++ > 12) {
          console.log(chalk.red('Deposit was unsuccessful!'))
          setupSuccess = false
          break
        }
      }
      console.log('Initialize round...')
      await this.api.initializeRound(['orchestrator_0'])
      console.log('activating orchestrators...')
      // await wait(2000)
      // await this.api.activateOrchestrator(['orchestrators'], orchConf)
      // bond
      const onames = Array.from({length: config.nodes.orchestrators.instances}, (_, i) => `orchestrator_${i}`)
      // await Promise.all(onames.map(n => this.restartService(n)))
      // console.log(`restarted ${onames.length} orchestrators`)
      // await Promise.all(bnames.map(n => this.restartService(n)))
      // console.log(`restarted ${bnames.length} broadcasters`)
      await this.api.waitTillAlive('orchestrator_0')
      let orchsList = await this.api.getOrchestratorsList('orchestrator_0')
      tr = 0
      while (orchsList.length < onames.length-0) {
        await wait(2000, true)
        const activatedOrchs = orchsList.map(r => {
            const match = getOName.exec(r.ServiceURI)
            if (match) {
                return match[1]
            }
        })
        const toActivate = onames.filter(name => !activatedOrchs.includes(name))
        
        try {
          await this.api.activateOrchestrator(toActivate, orchConf)
        } catch(e) {
          console.log(e)
          continue
        }
        
       /*
       let bad = false
       for (let name of toActivate) {
         try {
            await this.api.activateOrchestrator([name], orchConf)
            let orchsList = await this.api.getOrchestratorsList(name)
            // console.log(orchsList)
         } catch(e) {
           console.log(e)
           bad = true
           break
         }
       }
       if (bad) {
         continue
       }
       */
        // const reactivated = []
        // for (let i = 0; i < onames.length-0; i++) {
        //   if (!activatedOrchs.includes(onames[i])) {
        //     try {
        //     await this.api.activateOrchestrator([onames[i]], orchConf)
        //     reactivated.push(onames[i])
        //     } catch(e) {
        //       console.log(e)
        //     }
        //   }
        // }
        // if (reactivated.length == 0) {
        //   continue
        // }
        // await Promise.all(onames.map(n => this.restartService(n)))
        // await Promise.all(reactivated.map(n => this.restartService(n)))
        await Promise.all(toActivate.map(n => this.restartService(n)))
        // await this.api.waitTillAlive('orchestrator_0')
        await this.api.waitTillAlive(toActivate[0])
        // orchsList = await this.api.getOrchestratorsList('orchestrator_0')
        orchsList = await this.api.getOrchestratorsList(toActivate[0])
        tr++
        if (tr++ > 12) {
          console.log(chalk.red('After 10 tries archestrators still not activated, giving up!'))
          return false
        }
      }
      await Promise.all(bnames.map(n => this.restartService(n)))
      await this.api.waitTillAlive('broadcaster_0')
      const o2b = this.assignBroadcasters2Orchs(config)
      for (let i = 0; i < 10; i++) {
        try {
          await Promise.all(Object.keys(o2b).map(oname => this.api.bond(o2b[oname], '5000', oname)))
        } catch(e) {
          console.log(e)
          continue
        }
        break
      }
      await Promise.all(bnames.map(n => this.restartService(n)))
      await this.api.waitTillAlive('broadcaster_0')
      return setupSuccess
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
    let err = null
    for (let i = 0; i < 10; i++) {
      try {
        await this._loadLocalDockerImageToSwarm(managerName)
        return
      } catch(e) {
        console.log(e)
        err = e
      }
    }
    throw err
  }

  async _loadLocalDockerImageToSwarm(managerName) {
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
    const parsedCompose = parseComposeAndGetAddresses(config.name)
    // console.log('=========== GOT RESULTS ', parsedCompose)
    await this.fundAccountsList(config, parsedCompose.addresses)
    console.log('funding secured!!')
    const pubIP = await this.swarm.getPubIP(`${config.name}-manager`)
    await wait(10000)
    return {
      parsedCompose,
      config,
      baseUrl: pubIP
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
