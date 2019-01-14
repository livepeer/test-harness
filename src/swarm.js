'use strict'
const { exec, spawn } = require('child_process')
const { timesLimit } = require('async')
const shortid = require('shortid')

class Swarm {
  constructor () {
    this._defaults = {
      driver: 'google',
      zone: 'us-east1-b',
      machineType: 'n1-standard-1',
      tags: 'swarm-cluster',
      projectId: 'test-harness-226018'
    }
  }

  createMachines (opts, cb) {
    let machinesCount = opts.machines || 3
    let name = opts.name || 'testharness-' + shortid.generate()

    timesLimit(machinesCount - 1, 3, (i, next) => {
      // create workers
      this.createMachine({
        name: `${name}-worker-${i+1}`,
        zone: opts.zone,
        machineType: opts.machineType,
        tags: opts.tags
      }, next)
    }, (err) => {
      if (err) throw err
      // create Manager
      this.createMachine({
        name: `${name}-manager`,
        zone: opts.zone,
        machineType: opts.machineType,
        tags: opts.tags
      }, (err) => {
        if (err) throw err
        cb(null)
      })
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

    builder.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`)
    })

    builder.stderr.on('data', (data) => {
      console.log(`stderr: ${data}`)
    })

    builder.on('close', (code) => {
      console.log(`child process exited with code ${code}`)
      if (code !== 0) {
         return cb(`child process exited with code ${code}`)
      }

      cb(null)
    })
  }

  createNetwork (name, cb) {
    `docker network create -d overlay ${name}`
  }

  scp (origin, destination, opts, cb) {
    exec(`docker-machine scp ${opts} ${origin} ${destination}`, cb)
  }

  getPubIP (machineName, cb) {
    exec(`docker-machine ip ${machineName}`, cb)
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
        DOCKER_TLS_VERIFY: parsed[0],
        DOCKER_HOST: parsed[1],
        DOCKER_CERT_PATH: parsed[2],
        DOCKER_MACHINE_NAME: parsed[3]
      }

      cb(null, env)
    })
  }

  unsetEnv (cb) {
    exec(`. $(docker-machine env --unset)`, cb)
  }

  init (managerName, cb) {
    this.setEnv(managerName, (err, env) => {
      if (err) throw err
      exec(`docker swarm init`, {
        env: env
      }, cb)
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
      exec(`docker swarm join --token ${token} ${managerIP}:2377`, {env: env}, cb)
    })
  }

  deployComposeFile (filePath, prefix, managerName, cb) {
    this.setEnv(managerName, (err, env) => {
      if (err) throw err
      exec(`docker stack deploy --composefile ${filePath} ${prefix}`, {env: env}, cb)
    })
  }

  stopStack (stackName, managerName, cb) {
    this.setEnv(managerName, (err, env) => {
      if (err) throw err
      exec(`docker stack rm -y ${stackName}`, {env: env}, cb)
    })
  }

  getLogs (serviceName, managerName, cb) {
    this.setEnv(managerName, (err, env) => {
      if (err) throw err
      exec(`docker service logs ${serviceName}`, {env: env}, cb)
    })
  }

  createRegistry (cb) {
    this.setEnv(this._managerName, (err, env) => {
      if (err) throw err
      exec(`docker service create --name registry --network testnet --publish published=5000,target=5000 registry:2`, {env: env}, cb)
    })
  }

  
  tearDown (machineName, cb) {
    exec(`docker-machine rm ${machineName}`, cb)
  }
}

module.exports = Swarm
