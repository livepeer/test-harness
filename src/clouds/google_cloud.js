'use strict'


const chalk = require('chalk')
const { exec, spawn } = require('child_process')
const Compute = require('@google-cloud/compute')
const { PROJECT_ID, GCE_VM_IMAGE, GCE_CUSTOM_VM_IMAGE } = require('../constants')
const { asyncExec, trim } = require('../utils/helpers')

function toArray(value) {
  if (value && !Array.isArray(value)) {
    return [value]
  }
  return value
}

/**
 * Abstracts VMs creation by directly using Google Cloud's API
 */
class GoogleCloud {
  constructor(context, deploymentName, machinesConfig, zone = 'us-east1-b', machineType = 'n1-standard-1', projectId = PROJECT_ID) {
    this.deploymentName = deploymentName
    this._machinesConfig = machinesConfig
    this._context = context
    this._defaults = {
      zone,
      machineType,
      projectId,
    }
    this._compute = new Compute()
    if (!context.machine2zone) {
      context.machine2zone = {}
    }
    if (!context.machine2ip) {
      context.machine2ip = {}
    }
  }

  /**
   * 
   * @param {string} name machine name
   * @param {string} zone zone
   * @param {string} machineType type of machine
   * @param {string|array} tags tags
   */
  async createMachine(name, zone, machineType, tags) {
    const zoneName = zone || this._defaults.zone
    this._context.machine2zone[name] = zoneName
    // Create a new VM using the latest OS image of your choice.
    const gZone = this._compute.zone(zoneName)

    // Start the VM create task
    const vmConfig = {
      os: `${this._defaults.projectId}/${GCE_CUSTOM_VM_IMAGE}`,
      machineType,
      networkInterfaces: [
        {
          "kind": "compute#networkInterface",
          // "subnetwork": "projects/test-harness-226018/regions/us-central1/subnetworks/default",
          accessConfigs: [
            {
              "kind": "compute#accessConfig",
              "name": "External NAT",
              "type": "ONE_TO_ONE_NAT",
              // "networkTier": "PREMIUM"
            }
          ],
          "aliasIpRanges": []
        }
      ],
    }
    if (tags) {
      vmConfig.tags = toArray(tags)
    }
    const [vm, operation, _apiResponse] = await gZone.createVM(name, vmConfig)
    // `operation` lets you check the status of long-running tasks.
    await operation.promise()
    const [meta] = await vm.getMetadata()
    this._updateIPFromMeta(name, meta)
    // Complete!
    console.log(`Virtual machine ${name} with tags ${tags} created!`)
  }

  /**
   * Removes VM
   * 
   * @param {string} machineName name of the VM to remove
   */
  async removeMachine(machineName, waitForCompletioin = true) {
    const [allVMs] = await this._compute.getVMs({ autoPaginate: false })
    const vm = allVMs.find(v => v.name == machineName)
    if (!vm) {
      throw new Error(`Can't find machine ${machineName} to remove.`)
    }
    const [operation, _apiResponse] = await vm.delete()
    // console.log('API response:', _apiResponse)
    if (waitForCompletioin) {
      // `operation` lets you check the status of long-running tasks.
      await operation.promise()
    }
  }

  /**
   * Configures newly created machine
   * 
   * @param {*} _machine  machine
   * @param {*} _zone zone
   */
  async setupMachine(_machine, _zone) {
    // nothing to do here - all been done at stage of creating VM image
  }

  async getInternalIP(machineName) {
    return (this._context.machine2ip[machineName] || {}).internalIP
  }

  async getExternalIP(machineName) {
    const ip = (this._context.machine2ip[machineName] || {}).externalIP
    if (ip) {
      return ip
    }
    await this._updateIP(machineName)
    return (this._context.machine2ip[machineName] || {}).externalIP
  }

  async _updateIP(machineName) {
    const vm = await this._getVM(machineName)
    if (!vm) {
      return
    }
    this._updateIPFromMeta(machineName, vm.metadata)
  }

  async _updateIPFromMeta(machineName, metadata) {
    const internalIP = metadata.networkInterfaces[0].networkIP
    let externalIP
    const ac = metadata.networkInterfaces[0].accessConfigs || []
    if (ac.length) {
      externalIP = ac[0].natIP
    }
    if (!externalIP) {
      externalIP = internalIP
    }
    this._context.machine2ip[machineName] = { internalIP, externalIP }
  }

  async getRunningMachinesList(name) {
    // const [code, out, errOut] = await asyncExec('gcloud', 'compute instances list --quiet --format=json'.split(' '))
    // if (code) {
    //   console.log(`Error getting running machines list from google cloud: ${errOut}`)
    //   process.exit(208)
    // }
    // const parsed = JSON.parse(out)
    const [data] = await this._compute.getVMs({ autoPaginate: false })
    return data.map(o => o.name).filter(n => n.startsWith(name + '-'))
  }

  async scp(src, machineName, dst) {
    const zone = await this._getZoneForVM(machineName)
    if (!zone) {
      console.log(chalk.red(`Can't find zone for ${machineName}`))
      process.exit(207)
    }
    const [code, out, errOut] = await asyncExec('gcloud', `compute scp --zone ${zone} ${src} ${machineName}:${dst}`.split(' '), false)
    if (code) {
      console.log(`Error copying file ${src} to ${machineName} to ${dst}: ${errOut}`)
      process.exit(208)
    }
  }

  async _getZoneForVM(machineName) {
    const zone = this._context.machine2zone[machineName]
    if (zone) {
      return zone
    }
    const vm = await this._getVM(machineName)
    if (!vm) {
      return null
    }
    this._context.machine2zone[machineName] = vm.zone.name
    return vm.zone.name
  }

  async _getVM(machineName) {
    const [allVMs] = await this._compute.getVMs({ autoPaginate: false })
    return allVMs.find(v => v.name == machineName)
  }

  /**
   * Executes provided command on remote machine
   * 
   * @param {string} machineName name of VM
   * @param {string} command command to execute
   * @returns [number, string, string] returns array with exit code, standard output and stderr output
   */
  remotelyExec(machineName, command, quiet = true) {
    const zone = this._context.machine2zone[machineName]
    if (!zone) {
      console.log(`Trying to execute '${chalk.yellow(command)}' on '${chalk.green(machineName)}, but zone for it was not found.`)
      process.exit(22)
    }
    return new Promise((resolve) => {
      let args = ['compute', 'ssh', machineName, '--zone', zone, '--', command]

      console.log('gcloud ' + args.join(' '))
      console.log(`Running remote command '${command}'`)
      let builder = spawn('gcloud', args)
      let output = '', errOutput = ''

      builder.stdout.on('data', (data) => {
        if (data) {
          if (!quiet) {
            const trimmed = String.prototype.trim.call(data)
            console.log(`stdout: ${trimmed}`)
          }
          output += data
        }
      })

      builder.stderr.on('data', (data) => {
        if (data) {
          if (data == '.') return
          if (!quiet) {
            const trimmed = String.prototype.trim.call(data)
            console.log(`stderr: ${trimmed}`)
          }
          errOutput += data
        }
      })

      builder.on('message', (msg, sendHandle) => {
        console.log(`[remotelyExec] msg: ${JSON.stringify(msg)}`)
      })

      builder.on('close', (code, signal) => {
        console.log(`[remotelyExec] child process '${command}' exited with code ${code} (${!!code}), signal: ${signal}`)
        setTimeout(() => {
          resolve([code, trim(output), trim(errOutput)])
        }, 1)
      })
    })
  }

}

async function test() {
  const name = 'dlongtest'
  const gc = new GoogleCloud({}, name, {})
  const eip = await gc.getExternalIP('ivan-workstation')
  const iip = await gc.getInternalIP('ivan-workstation')
  return [iip, eip]
  // const rml = await gc.getRunningMachinesList(name)
  // console.log(rml)
  // await gc.scp('/tmp/lpnodeimage.tar.gz', 'ivan-workstation', '/tmp/lpnodeimage.tar.gz')
  // const Swarm = require('../swarm')
  // const swarm = new Swarm(name)
  // await swarm.tearDown(name)
  // return rml
}

// test().then(console.log, console.error)

module.exports = GoogleCloud
