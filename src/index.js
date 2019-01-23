'use strict'

const fs = require('fs')
const path = require('path')
const { exec } = require('child_process')
const { each, eachLimit, timesLimit, filter, map } = require('async')
const dockercompose = require('docker-compose')
const YAML = require('yaml')

const NetworkCreator = require('./networkcreator')
const Streamer = require('./streamer')
const Swarm = require('./swarm')
const Api = require('./api')
const utils = require('./utils/helpers')

const DIST_DIR = '../dist'
const DEFAULT_MACHINES = 5

class TestHarness {
  constructor () {
    this.swarm = new Swarm()
  }

  restartService (serviceName, cb) {
    dockercompose.restartOne(serviceName, {
      cwd: path.resolve(__dirname, `${DIST_DIR}/${this._config.name}`),
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

  parseComposeAndGetAddresses (config, cb) {
    let parsedCompose = null
    try {
      let file = fs.readFileSync(path.resolve(__dirname, `${DIST_DIR}/${config.name}/docker-compose.yml`), 'utf-8')
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
        cb(null, {
          parsedCompose,
          addresses: results
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

    this.networkCreator = new NetworkCreator(config)
    this.networkCreator.generateComposeFile(`${DIST_DIR}/${config.name}`, (err) => {
      if (err) return handleError(err)

      if (config.local) {
        // copy binaries
        // build lpnode:latest
        // run geth:pm
        // 420 funding secured
        // run the lpnodes
        // profit.
        this.networkCreator.loadBinaries(`../containers/lpnode/binaries`, (err) => {
          if (err) throw err
          this.networkCreator.buildLocalLpImage((err) => {
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
                  let file = fs.readFileSync(path.resolve(__dirname, `${DIST_DIR}/${config.name}/docker-compose.yml`), 'utf-8')
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
      } else {
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

        console.log('machines config', config.manchines)
        this.swarm.createSwarm(config, (err, result) => {
          // if (err) {
          //   // machine exists
          //   return this.onReady(config, cb)
          // }
          // result = {internalIp, token, networkId}
          this.swarm.createRegistry((err, stdout) => {
            // if (err) throw err
            if (err) console.log('create registry error : ', err)
            this.swarm.setupManager(config.name, (err, output) => {
              if (err) throw err
              //
              // deploy the stack.
              this.finishSetup(config.name).catch(err => { throw err })
              return
              utils.remotelyExec(
                `${config.name}-manager`,
                `cd /tmp/config && sudo docker stack deploy -c docker-compose.yml livepeer`,
                (err, outputBuf) => {
                  if (err) throw err
                  console.log('stack deployed ', (outputBuf) ? outputBuf.toString() : outputBuf)
                  setTimeout(() => {
                    // fund accounts here.
                    // ----------------[eth funding]--------------------------------------------
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
                    // -------------------------------------------------------------------------
                  }, 10000)
                }
              )
            })
          })
        })
      }
    })
  }
  async finishSetup(config, internalIP) {
    const configName = config.name
    console.log('== finish setup ' + configName, internalIP)
    const managerName = `${configName}-manager`
    await this.networkCreator.buildLocalLpImage()
    await this.saveLocalDockerImage()
    const loadToWorkers = [this.loadLocalDockerImageToSwarm(managerName)]
    for (let i = 0; i < DEFAULT_MACHINES - 1; i++) {
      const workerName = `${configName}-worker-${ i+1 }`
      loadToWorkers.push(this.loadLocalDockerImageToSwarm(workerName))
    }
    await Promise.all(loadToWorkers)

    // this.swarm.deployComposeFile
    console.log('docker image pushed')
  }
  async joinWorkerIntoSwarm() {
    // console.log(`adding ${config.machines.num - 1} workers to the swarm, token ${token}, ip: ${ip}`)
    // config.machines.num - 1,
    // this.swarm.join(`${config.name}-worker-${ i+1 }`, token.trim(), ip.trim(), next)

  }
  async saveLocalDockerImage() {
    return new Promise((resolve, reject) => {
      exec(`docker save -o /tmp/lpnodeimage.tar lpnode:latest`, (err, stdout) => {
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
        exec(`docker load -i /tmp/lpnodeimage.tar`, {env}, (err, stdout) => {
          if (err) return reject(err)
          console.log('lpnode image loaded into swarm ' + managerName)
          resolve()
        })
      })
    })
  }
}

function handleError (err) {
  // TODO handle errors gracefully
  throw err
}

module.exports = TestHarness
