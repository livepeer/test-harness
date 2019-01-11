'use strict'
const { exec } = require('child_process')

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

  setEnv (machineName, cb) {
    exec(`docker-machine env ${machineName}`, cb)
  }

  unsetEnv (cb) {
    exec(`docker-machine env --unset`, cb)
  }

  init (managerName, cb) {
    this.setEnv(managerName, (err) => {
      if (err) throw err
      exec(`docker swarm init`, cb)
    })
  }

  join (machineName, managerIP, cb) {
    this.setEnv(machineName, (err) => {
      if (err) throw err
      // TODO get the managers internal IP automatically.
      exec(`docker swarm join ${managerIP}:2377`)
    })
  }

  deployComposeFile (filePath, prefix, managerName, cb) {
    this.setEnv(managerName, (err) => {
      exec(`docker stack deploy --composefile ${filePath} ${prefix}`, cb)
    })
  }

  stopStack (prefix, cb) {
    this.setEnv(managerName, (err) => {
      exec(`docker stack rm -y ${prefix}`, cb)
    })
  }

  tearDown (machineName, cb) {
    exec(`docker-machine rm ${machineName}`, cb)
  }

}

module.exports = Swarm
