'use strict'


const chalk = require('chalk')
const { exec, spawn } = require('child_process')
const axios = require('axios')
const Compute = require('@google-cloud/compute')
const { PROJECT_ID, GCE_VM_IMAGE, GCE_CUSTOM_VM_IMAGE } = require('../constants')
const { asyncExec, trim } = require('../utils/helpers')
const { wait } = require('../utils/helpers')

function toArray(value) {
  if (value && !Array.isArray(value)) {
    return [value]
  }
  return value
}

// const SWARM_ROLE_MANAGER = 'manager'
// const SWARM_ROLE_WORKER = 'worker'



/**
 * Abstracts VMs creation by directly using Google Cloud's API
 */
class GoogleCloud {
  static SWARM_ROLE_MANAGER = 'manager'
  static SWARM_ROLE_WORKER = 'worker'

  constructor(context, deploymentName, machinesConfig, zone = 'us-east1-b', machineType = 'n1-standard-1', projectId = PROJECT_ID) {
    this.deploymentName = deploymentName
    this._machinesConfig = machinesConfig
    this._context = context
    this._defaults = {
      zone,
      machineType,
      projectId,
    }
    this._compute = new Compute({
      projectId
    })
    if (!context.machine2zone) {
      context.machine2zone = {}
    }
    if (!context.machine2ip) {
      context.machine2ip = {}
    }
  }

  /**
   * Returns true if currently running inside Google's Cloud
   * 
   * @returns {boolean}
   */
  async isInsideCloud() {
    try {
      const res = await axios.get('http://metadata.google.internal')
      return res.headers['metadata-flavor'] === 'Google'
    } catch {
    }
    return false
  }

  /**
   * Opens up specified ports for all the machines in the deployment
   * with external IPs
   * 
   * @param {Array<number>} portsList 
   */
  async openPortsForDeployment(portsList) {
    const ruleName = `${this.deploymentName}-swarm-new`
    const rule = this._compute.firewall(ruleName)
    const [nRule, operation] = await rule.create({
      protocols: {
        tcp: portsList
      },
      targetTags: [this.deploymentName + '-cluster']
    })
    await operation.promise()
    console.log(`Firewall rule ${chalk.green(ruleName)} for deploymenet ${chalk.green(this.deploymentName)} for opening ports ${portsList.map(p => chalk.green(p)).join(' ')} created.`)
  }

  async closePorts() {
    await this._removeFirewallRule(`${this.deploymentName}-swarm`)
    await this._removeFirewallRule(`${this.deploymentName}-swarm-new`)
  }

  async _removeFirewallRule(ruleName) {
    const rule = this._compute.firewall(ruleName)
    try {
      const [ruleObj] = await rule.get()
      // console.log(ruleObj)
      // const [me] = await ruleObj.getMetadata()
      // console.log(me)
      ruleObj.delete()
      console.log(`Submitted request to delete ${chalk.green(ruleName)} firewall rule.`)
    } catch (err) {
      if (err.code !== 404) {
        console.error('Unexpected error:', err)
      }
    }
  }

  /**
   * 
   * @param {string} name machine name
   * @param {string} zone zone
   * @param {string} machineType type of machine
   * @param {string|array} tags tags
   */
  async createMachine(name, zone, machineType, tags, addExternalIP = true, swarmRole = '', initValues = {}) {
    const zoneName = zone || this._defaults.zone
    this._context.machine2zone[name] = zoneName
    // Create a new VM using the latest OS image of your choice.
    const gZone = this._compute.zone(zoneName)
    const isManager = name.endsWith('-manager')

    // Start the VM create task
    const vmConfig = {
      os: `${this._defaults.projectId}/${GCE_CUSTOM_VM_IMAGE}`,
      machineType,
    }
    if (addExternalIP) {
      vmConfig.networkInterfaces = [
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
      ]
    }
    if (tags) {
      vmConfig.tags = toArray(tags)
    }
    if (isManager) {
      vmConfig.serviceAccounts = [
        {
          email: '926323785560-compute@developer.gserviceaccount.com',
          scopes: [
             "https://www.googleapis.com/auth/cloud-platform" // full access
            // 'https://www.googleapis.com/auth/compute.instances.set_metadata',
            // 'https://www.googleapis.com/auth/compute.projects.get',
            // 'https://www.googleapis.com/auth/devstorage.read_only',
            // 'https://www.googleapis.com/auth/logging.write',
            // 'https://www.googleapis.com/auth/monitoring.write',
            // 'https://www.googleapis.com/auth/service.management.readonly',
            // 'https://www.googleapis.com/auth/servicecontrol',
            // 'https://www.googleapis.com/auth/trace.append'
          ]
        }
      ]
    }
    const startupScript = this._getStartupScript(swarmRole, initValues)
    if (startupScript) {
      vmConfig.metadata = {
        kind: 'compute#metadata',
        items: [
          {
            key: 'startup-script',
            value: startupScript
          }
        ]
      }
    }
    const [vm, operation, _apiResponse] = await gZone.createVM(name, vmConfig)
    // `operation` lets you check the status of long-running tasks.
    await operation.promise()
    const [meta] = await vm.getMetadata()
    this._updateIPFromMeta(name, meta)
    // Complete!
    console.log(`Virtual machine ${name} with tags ${tags} created!`)
    return vm
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
    return await this._getIP(machineName, 'internalIP')
  }

  async getExternalIP(machineName) {
    return await this._getIP(machineName, 'externalIP')
  }

  async hasExternalIP(machineName) {
    return await this._getIP(machineName, 'hasExternalIP')
  }


  async _getIP(machineName, typ) {
    if ((this._context.machine2ip[machineName] || {}).hasOwnProperty(typ)) {
      return (this._context.machine2ip[machineName] || {})[typ]
    }
    await this._updateIP(machineName)
    return (this._context.machine2ip[machineName] || {})[typ]
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
    this._context.machine2ip[machineName] = { internalIP, externalIP, hasExternalIP: externalIP !== internalIP }
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
    const hasExtIP = await this.hasExternalIP(machineName)
    const intIPArg = !hasExtIP ? ' --internal-ip' : ''
    const [code, out, errOut] = await asyncExec('gcloud', `compute scp${intIPArg} --zone ${zone} ${src} ${machineName}:${dst}`.split(' '), false)
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
  async remotelyExec(machineName, command, quiet = true) {
    const zone = this._context.machine2zone[machineName]
    if (!zone) {
      console.log(`Trying to execute '${chalk.yellow(command)}' on '${chalk.green(machineName)}, but zone for it was not found.`)
      process.exit(22)
    }
    const hasExtIP = await this.hasExternalIP(machineName)
    return new Promise((resolve) => {
      let args = ['compute', 'ssh', machineName, '--zone', zone]
      if (!hasExtIP) {
        args.push('--internal-ip')
      }
      args.push('--', command)

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

  _getStartupScript(swarmRole, values = {}) {
    switch (swarmRole) {
      case GoogleCloud.SWARM_ROLE_MANAGER:
        return `#!/bin/bash
docker node ls
if [ $? -ne 0 ]
then
  echo "Initializing Swarm"
  docker swarm init
  docker network create -d overlay --subnet=10.0.0.0/16 --gateway=10.0.0.1 ${values.network || 'testnet'}
  docker service create --name registry --network testnet --publish published=5000,target=5000 registry:2
fi
`
      case GoogleCloud.SWARM_ROLE_WORKER:
        return `#!/bin/bash
if [ "$(docker info --format '{{.Swarm.LocalNodeState}}')" = "inactive" ]
then
  echo "Joining Swarm"
  docker swarm join --token ${values.token} ${values.managerInternalIP}:2377
else
  echo "Already in Swarm"
fi
`
      default:
        break;
    }
  }
}

async function test() {
  const name = 'd100real'
  const gc = new GoogleCloud({}, name, {})
  // await gc.scp('/tmp/lpnodeimage.tar.gz', 'dsmall-manager', '/tmp/lpnodeimage.tar.gz')
  // await gc.closePorts()
  // await gc.openPortsForDeployment([1935, 7934])
  // const isInside = await gc.isInsideCloud()
  // return isInside
  // const r = await gc.createMachine(name + '-w-1', 'us-central1-b', 'n1-highcpu-16')
  // return r
  // const eip = await gc.getExternalIP('ivan-workstation')
  // const iip = await gc.getInternalIP('ivan-workstation')
  // return [iip, eip]
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
