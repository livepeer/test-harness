'use strict'
const path = require('path')
const { exec, spawn } = require('child_process')
const { each, eachLimit, timesLimit, parallel } = require('async')
const shortid = require('shortid')
const utils = require('./utils/helpers')
const { wait } = require('./utils/helpers')
const DIST_DIR = '../dist'

class Swarm {
  constructor (name) {
    this._defaults = {
      driver: 'google',
      zone: 'us-east1-b',
      machineType: 'n1-standard-1',
      managerMachineType: 'n1-standard-1',
      tags: 'swarm-cluster',
      projectId: 'test-harness-226018'
    }

    this._managerName = `${name}-manager` || null
    this._name = name
  }

  createMachines (opts, cb) {
    let machinesCount = opts.machines.num || 3
    let name = opts.name || 'testharness-' + shortid.generate()
    parallel([
      (done) => {
        this.createMachine({
          name: `${name}-manager`,
          zone: opts.machines.zone,
          machineType: opts.machines.managerMachineType,
          tags: opts.machines.tags || `${name}-cluster`
        }, done)
      },
      (done) => {
        timesLimit(machinesCount - 1, 20, (i, next) => {
          // create workers
          this.createMachine({
            name: `${name}-worker-${i + 1}`,
            zone: opts.machines.zone,
            machineType: opts.machines.machineType,
            tags: opts.machines.tags || `${name}-cluster`
          }, next)
        }, done)
      }
    ], (err) => {
      if (err) return cb(err)
      cb(null)
    })
  }


  createMachine (opts, cb) {
    let driver = opts.driver || this._defaults.driver
    // TODO sanitize user opts here
    // exec(`docker-machine create ${opts.name} \
    //   --driver ${driver} \
    //   --${driver}-zone ${opts.zone || this._defaults.zone} \
    //   --${driver}-machine-type ${opts.machineType || this._defaults.machineType} \
    //   --${driver}-tags ${opts.tags || this._defaults.tags} \
    //   --${driver}-project ${this._defaults.projectId}`, cb)
    console.log('running docker-machine create')

    let builder = spawn('docker-machine', [
      'create',
      opts.name,
      '--driver',
      driver,
      `--${driver}-zone`,
      opts.zone || this._defaults.zone,
      `--${driver}-machine-type`,
      opts.machineType || this._defaults.machineType,
      `--${driver}-tags`,
      opts.tags || this._defaults.tags,
      `--${driver}-project`,
      this._defaults.projectId
    ])
    let stderr = ''

    builder.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`)
    })

    builder.stderr.on('data', (data) => {
      console.log(`stderr: ${data}`)
      stderr = data.toString()
    })

    builder.on('close', (code) => {
      console.log(`child process exited with code ${code}`)
      if (code !== 0 && !stderr.match(/already exists/g) ) {
         return cb(`child process exited with code ${code}`)
      }

      cb(null)
    })
  }

  createNetwork (networkName, name, cb) {
    this.setEnv(this._managerName, (err, env) => {
      console.log('env before network: ', env)
      if (err) return cb(err)
      exec(`docker network create -d overlay ${networkName}`, {
        env: env
      }, (err, output) => {
        if (err) console.error('create network err: ', err)
        this.openExternalAccess(name, cb)
      })
    })
  }

  scp (origin, destination, opts, cb) {
    exec(`docker-machine scp ${opts} ${origin} ${destination}`, cb)
  }

  getPubIP (machineName, cb) {
    return new Promise((resolve, reject) => {
      exec(`docker-machine ip ${machineName}`, (err, ip) => {
        if (err) {
          reject(err)
        } else {
          resolve(ip.trim())
        }
        if (cb) {
          cb(err, ip.trim())
        }
      })
    })
  }

  getInternalIP (machineName, cb) {
    // Reference https://stackoverflow.com/a/38950953/2159869
    // gcloud Resource keys https://cloud.google.com/sdk/gcloud/reference/topic/resource-keys
    exec(`gcloud --format="value(networkInterfaces[0].networkIP)" \
      compute instances list --filter="name:(${machineName})"`, cb)
  }

  getMachineStatus (machineName, cb) {
    // TODO check if the machineName is on the list first or not.
    exec(`docker-machine status ${machineName}`, cb)
    // sudo docker service ps -q -f name=th_lp_broadcaster_0 -f desired-state=running th_lp_broadcaster_0
  }

  setEnv (machineName, cb) {
    exec(`docker-machine env ${machineName}`, (err, stdout) => {
      if (err) throw err
      // get all the values in the double quotes
      // example env output
      // export DOCKER_TLS_VERIFY="1"
      // export DOCKER_HOST="tcp://12.345.678.90:2376"
      // export DOCKER_CERT_PATH="/machine/machines/swarm-manager"
      // export DOCKER_MACHINE_NAME="swarm-manager"
      // # Run this command to configure your shell:
      // # eval $(docker-machine env swarm-manager)

      let parsed = stdout.match(/(["'])(?:(?=(\\?))\2.)*?\1/g)
      if (parsed.length !== 4) {
        throw new Error('env parsing mismatch!')
      }
      let env = {
        DOCKER_TLS_VERIFY: parsed[0].substr(1,parsed[0].length -2),
        DOCKER_HOST: parsed[1].substr(1, parsed[1].length-2),
        DOCKER_CERT_PATH: parsed[2].substr(1, parsed[2].length-2),
        DOCKER_MACHINE_NAME: parsed[3].substr(1, parsed[3].length-2)
      }

      cb(null, env)
    })
  }

  unsetEnv (cb) {
    exec(`. $(docker-machine env --unset)`, cb)
  }

  getMachinesToCreateNames (config) {
    const res = [`${config.name}-manager`]
    for (let i = 1; i < config.machines.num; i++) {
      res.push(`${config.name}-worker-${i}`)
    }
    res.sort()
    return res
  }

  async createSwarm (config) {
    const runninMachines = await this.getRunningMachinesList(config.name)
    console.log(`running machines:`, runninMachines)
    if (runninMachines.length) {
      runninMachines.sort()
      const machinesToCreate = this.getMachinesToCreateNames(config)
      console.log(`machines to create:`, machinesToCreate)
      if (runninMachines.length === machinesToCreate.length &&
        runninMachines.reduce((ac, cv, ci) => ac && (cv === machinesToCreate[ci]), true)
      ) {
        console.log(`Found already running machines: ${runninMachines}`)
        console.log(`not removing them. If you want to remove them, run`)
        console.log(`docker-machine rm -y -f ${runninMachines.join(' ')}`)
        await this.stopStack('livepeer')
        await this.stopStack('streamer')
        while (true) {
          await wait(2000) // need to wait while instances gets shutdown
          try {
            await this.pruneLocalVolumes(config.name)
          } catch (e) {
          }
          const volumes = await this.getVolumes(config.name + '-manager')
          if (volumes.filter(n => n.startsWith('livepeer_')).length === 0) {
            break
          }
        }
        return true
      } else {
        await this.tearDown(config.name)
      }
    }
    await this.createSwarmCreateMachines(config)
    return false
  }

  createSwarmCreateMachines (config) {
    return new Promise((resolve, reject) => {
      // createMachines
      this.createMachines(config, (err) => {
        if (err) throw err
        // init the swarm.
        this.init(`${config.name}-manager`, (err, stdout) => {
          if (err) throw err
          // get the swarm-token and the manager's ip.
          // create the docker network.
          parallel({
            token: (next) => {
              this.getSwarmToken(`${config.name}-manager`, next)
            },
            internalIP: (next) => {
              this.getInternalIP(`${config.name}-manager`, next)
            },
            networkId: (next) => {
              this.createNetwork(`testnet`, config.name, next)
            }
          }, (err, result) => {
            if (err) throw err
            console.log('result: ', result)
            console.log(`adding ${config.machines.num - 1} workers to the swarm, token ${result.token[0]}, ip: ${result.internalIP[0]}`)
            timesLimit(
              config.machines.num - 1,
              5,
              (i, next) => {
                this.join(`${config.name}-worker-${i + 1}`, result.token[0].trim(), result.internalIP[0].trim(), next)
                /*
                this.join(`${config.name}-worker-${i + 1}`, result.token[0].trim(), result.internalIP[0].trim(), (err, output) => {
                  if (err) throw err
                  if (config.localBuild) {
                    next()
                    return
                  }
                  utils.remotelyExec(
                    `${config.name}-worker-${i + 1}`,
                    config.machines.zone,
                    `mkdir -p /tmp/assets`,
                    (err, output) => {
                      if (err) throw err
                      this.rsync(
                        `${config.name}-worker-${i + 1}`,
                        config.machines.zone,
                        `gs://lp_testharness_assets`,
                        `/tmp/assets`,
                        next
                      )
                    })
                })
                */
              }, (err, results) => {
                if (err) throw err
                resolve({
                  token: result.token[0].trim(),
                  internalIP: result.internalIP[0].trim()
                })
              })
          })
        })
      })
    })
  }

  init (managerName, cb) {
    this.setEnv(managerName, (err, env) => {
      if (err) throw err
      console.log('env before init: ', env)
      exec(`docker swarm init`, {
        env: env
      }, (err, stdout) => {
        if (err) return cb(err)
        setTimeout(() => {
          cb(null, stdout)
        }, 1)
      })
    })
  }

  getSwarmToken (managerName, cb) {
    this.setEnv(managerName, (err, env) => {
      if (err) throw err
      // type can be either manager or worker
      // right now this defaults to worker
      exec(`docker swarm join-token -q worker`, {env: env}, cb)
    })
  }

  join (machineName, token, managerIP, cb) {
    this.setEnv(machineName, (err, env) => {
      if (err) throw err
      // TODO get the managers internal IP automatically.
      console.log(`adding ${machineName}..`, env, managerIP)
      console.log(`docker swarm join --token ${token} ${managerIP}:2377`)
      exec(`docker swarm join --token ${token} ${managerIP}:2377`, {env: env}, cb)
    })
  }

  deployComposeFile (filePath, prefix, managerName, cb) {
    return new Promise((resolve, reject) => {
      this.setEnv(managerName, (err, env) => {
        if (err) {
          reject(err)
          cb(err)
        }
        console.log(`running docker stack deploy on ${managerName} (using ${filePath})`)
        exec(`docker stack deploy --compose-file ${filePath} ${prefix}`, {env: env}, (e, r) => {
          if (cb) cb(e, r)
          if (e) {
            reject(e)
          } else {
            resolve(r)
          }
        })
      })
    })
  }

  stopStack (stackName, cb) {
    console.log(`Stopping stack ${stackName} on ${this._managerName}`)
    return new Promise((resolve, reject) => {
      this.setEnv(this._managerName, (err, env) => {
        if (err) throw err
        const cmd = `docker stack rm ${stackName}`
        console.log('running:', cmd)
        exec(cmd, {env: env}, (e, r) => {
          if (e) {
            console.log(e)
            reject(e)
          } else {
            console.log(r)
            resolve(r)
          }
          if (cb) {
            cb(e, r)
          }
          /*
          if (e) {
            console.log('Error removing stack:', e)
            reject(e)
            if (cb) cb(e, r)
            return
          }
          console.log(r)
          console.log('running "docker volume prune -f"')
          console.log(env)
          exec('docker volume prune -f', {env}, (e, r) => {
            if (e) {
              console.log(e)
              reject(e)
            } else {
              console.log(r)
              resolve(r)
            }
            if (cb) {
              cb(e, r)
            }
          })
          */
        })
      })
    })
  }

  async getVolumes (machineName) {
    const v = await this._runDocker(machineName, 'volume ls -q')
    return v.trim().split('\n')
  }

  async pruneLocalVolumes (name) {
    const rm = await this.getRunningMachinesList(name)
    for (let mn of rm) {
      const conts = await this._runDocker(mn, 'ps -f "status=exited" -q')
      console.log(conts)
      if (conts.trim()) {
        await this._runDocker(mn, `rm -f ${conts.trim().split('\n').join(' ')}`)
      }
      await wait(1000)
      const out2 = await this._runDocker(mn, 'volume prune -f')
      console.log(out2)
    }
  }

  async _runDocker(machineName, args) {
    return new Promise((resolve, reject) => {
      this.setEnv(machineName, (err, env) => {
        if (err) {
          reject(err)
          throw err
        }
        const cmd = 'docker ' + args
        exec(cmd, {env}, (err, r) => {
          err ? reject(err) : resolve(r)
        })
      })
    })
  }

  getLogs (serviceName, managerName, cb) {
    this.setEnv(managerName, (err, env) => {
      if (err) throw err
      exec(`docker service logs ${serviceName}`, {env: env}, cb)
    })
  }

  createRegistry () {
    return new Promise((resolve, reject) => {
      this.setEnv(this._managerName, (err, env) => {
        if (err) {
          reject(err)
          throw err
        }
        exec(`docker service create --name registry --network testnet --publish published=5000,target=5000 registry:2`,
          {env: env}, err => {
            if (err) {
              reject(err)
            } else (
              resolve()
            )
          })
      })
    })
  }

  rsync (machine, zone, bucket, path, cb) {
    utils.remotelyExec(
      machine,
      zone,
      `sudo gsutil rsync ${bucket} ${path}`,
      cb
    )
  }

  openExternalAccess (name, cb) {
    exec(`gcloud compute firewall-rules create ${name}-swarm \
    --allow tcp \
    --description "open tcp ports for the test-harness" \
    --target-tags ${name}-cluster`, (err, output) => {
      if (err) console.log('firewall Error ', err)
      cb(null, output)
    })
  }

  restartService (serviceName, cb) {
    return new Promise((resolve, reject) => {
      this.setEnv(this._managerName, (err, env) => {
        if (err) {
          reject(err)
          throw err
        }
        exec(`docker service scale livepeer_${serviceName}=0`, {env}, (err, output) => {
          if (err) {
            reject(err)
            throw err
          }
          exec(`docker service scale livepeer_${serviceName}=1`, {env}, (err, out) => {
            if (err) {
              reject(err)
            } else {
              resolve(out)
            }
            if (cb) {
              cb(err, out)
            }
          })
        })
      })
    })
  }

  restartServices (services, cb) {
    this.setEnv(this._managerName, (err, env) => {
      if (err) throw err
      eachLimit(services, 3, (serviceName, next) => {
        exec(`docker service scale livepeer_${serviceName}=0`, {env}, (err, output) => {
          if (err) throw err
          exec(`docker service scale livepeer_${serviceName}=1`, {env}, next)
        })
      }, cb)
    })
  }

  isSwarmActive (cb) {
    this.setEnv(this._managerName, (err, env) => {
      if (err) throw err
      exec(`docker node ls -q`, {env}, (err, output) => {
        if (err) return cb(null, false)
        console.log('isSwarmActive: ', output)
        cb(null, true)
      })
    })
  }

  doesMachineExist (machineName, cb) {
    exec(`gcloud compute instances list --quiet --format=json --filter="name:${machineName}"`, (err, output) => {
      if (err) throw err
      console.log(typeof output)
      let jsoned = null
      try {
        jsoned = JSON.parse(output)
      } catch (e) {
        throw e
      }
      if (jsoned && jsoned.length > 0) {
        cb(null, jsoned[0])
      } else {
        cb(null)
      }
    })
  }

  setupManager (config, cb) {
    const name = config.name
    const zone = config.machines.zone
    exec(`cp -r ./scripts/* ${path.resolve(__dirname, `${DIST_DIR}/${name}`)}`, (err, stdout) => {
      if (err) throw err
      console.log('manager_setup.sh copied')
      parallel({
        upload: (done) => {
          this.scp(
            path.resolve(__dirname, `${DIST_DIR}/${name}/`),
            `${name}-manager:/tmp`,
            `-r`,
            done)
        },
        mkdir: (done) => {
          utils.remotelyExec(
            `${name}-manager`,
            zone,
            `mkdir -p /tmp/assets`,
            done)
        }
      }, (err, result) => {
        if (err) throw err
        this.rsync(
          `${name}-manager`,
          zone,
          `gs://lp_testharness_assets`,
          `/tmp/assets`,
          (err) => {
            if (err) throw err
            utils.remotelyExec(
              `${name}-manager`,
              zone,
              `cd /tmp && \
               sudo rm -r -f config && \
               sudo mv ${name} config && cd /tmp/config && /bin/sh manager_setup.sh && /bin/sh create_streamer_image.sh`,
              cb)
          }
        )
      })
    })
  }

  updateStack (cb) {
    // 1. remove old stack.
    // 2. update docker-compose.yml.
    // 3. deploy new stack.
    // 4. profit.
    this.stopStack(`livepeer`, (err, resp) => {
      if (err) throw err
      cb()
    })
  }

  tearDown (name, cb) {
    return new Promise((resolve, reject) => {
      exec(`docker-machine ls -q --filter "name=${name}-([a-z]+)"`, (err, output) => {
        if (err) throw err
        if (!output) {
          resolve(null)
          if (cb) {
            cb(null)
          }
          return
        }

        output = output.trim().split('\n')
        console.log('machines to reprovision', output)
        each(output, (machine, next) => {
          if (!machine) {
            return next()
          }
          exec(`docker-machine rm -y ${machine}`, next)
        }, (e, r) => {
          if (e) {
            reject(e)
          } else {
            resolve(r)
          }
          if (cb) {
            cb(e, r)
          }
        })
      })
    })
  }

  getRunningMachinesList(name) {
    return new Promise((resolve, reject) => {
      const cmd = `docker-machine ls -q --filter "name=${name}-([a-z]+)" -filter "state=Running"`
      // console.log(cmd)
      exec(cmd, (err, output) => {
        if (err) {
          reject(err)
        } else {
          const machines = output.trim().split('\n')
          // console.log('found running machines: ', machines)
          resolve(machines)
        }
      })
    })
  }
}

module.exports = Swarm
