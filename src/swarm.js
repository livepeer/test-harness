'use strict'
const { exec, spawn } = require('child_process')

class Swarm {
  constructor (opts) {
    this._defaults = {
      driver: 'google',
      zone: 'us-east1-b',
      machineType: 'n1-standard-1',
      tags: 'swarm-cluster',
      projectId: 'test-harness-226018'
    }
  }

  createMachine (opts, cb) {
    let driver = opts.driver || this._defaults.driver
    // TODO sanitize user opts here
    exec(`docker-machine create ${opts.name} \
      --driver ${driver} \
      --${driver}-zone ${opts.zone || this._defaults.zone} \
      --${driver}-machine-type ${opts.machineType || this._defaults.machineType} \
      --${driver}-tags ${opts.tags || this._defaults.tags} \
      --${driver}-project ${this._defaults.projectId}`, cb)
  }

  scp (origin, destination, opts, cb) {
    exec(`docker-machine scp ${origin} ${destination}`, cb)
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

  tearDown (machineName, cb) {
    exec(`docker-machine rm ${machineName}`, cb)
  }
}

module.exports = Swarm
