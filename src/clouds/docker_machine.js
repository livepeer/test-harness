'use strict'

const { exec, spawn } = require('child_process')
const { PROJECT_ID, GCE_VM_IMAGE } = require('../constants')
const { wait, remotelyExec } = require('../utils/helpers')

/**
 * Abstracts VMs creation by docker-machine
 */
class DockerMachine {
  constructor(deploymentName, machinesConfig, zone = 'us-east1-b', machineType = 'n1-standard-1', projectId = PROJECT_ID) {
    this.deploymentName = deploymentName
    this._machinesConfig = machinesConfig
    this._defaults = {
      zone,
      machineType,
      projectId,
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
    const _zone = zone || this._defaults.zone
    for (let tr = 0; tr < 8; tr++) {
      console.log(`running create machine ${name} try ${tr}`)
      const exit = await this._createMachine(name, _zone, machineType, tags)
      if (exit === 0) {
        return true
      }
      await wait(Math.random() * 500 | 0 + 500)
      await this.tearDownOne(name)
      await wait(Math.random() * 2500 | 0 + 100)
    }
    console.error(`Tried to created machine ${name} for 8 times and failed.`)
    process.exit(14)
  }

  /**
   * Configures newly created machine
   * 
   * @param {*} machine  machine
   * @param {*} zone zone
   */
  async setupMachine(machine, zone) {
    // configure docker to rotate logs
    await remotelyExec(machine, zone,
      `sudo bash -c 'echo {\\"log-driver\\": \\"json-file\\", \\"log-opts\\": {\\"max-size\\": \\"1000m\\", \\"max-file\\": \\"5\\"}} > /etc/docker/daemon.json'`
    )
    await remotelyExec(machine, zone,
      // SIGHUP reloads configuration, but it doesn't affect logging driver's configuration
      // `sudo kill -SIGHUP $(pidof dockerd)`
      `sudo kill -SIGKILL $(pidof dockerd)`
    )
    if (this._machinesConfig.installGoogleMonitoring) {
      await utils.remotelyExec(machine, zone,
        `sudo curl -sSO https://dl.google.com/cloudagents/install-monitoring-agent.sh && sudo bash install-monitoring-agent.sh`
      )
    }
    if (this._machinesConfig.updateMachines) {
      await utils.remotelyExec(machine, zone, `sudo apt-get update && sudo apt-get upgrade -y`)
      console.log(`=============== apt updated`)
    }
    if (this._machinesConfig.installNodeExporter) {
      await utils.remotelyExec(machine, zone,
        `sudo apt-get install -y python3-pip && sudo apt autoremove -y && \
        sudo pip3 install ansible && \
        ansible-galaxy install cloudalchemy.node-exporter && \
        cat <<-SHELL_SCREENRC > $HOME/nodepb.yml
  - hosts: 127.0.0.1
    connection: local
    become: yes
    roles:
      - cloudalchemy.node-exporter
SHELL_SCREENRC`
      )
      await utils.remotelyExec(machine, zone, 'sudo ansible-playbook  nodepb.yml')
    } else {
      await wait(1000) // need to wait while till new docker daemon starts up after being killed
    }
    console.log(`Done setting up machine ${machine}, exiting.`)
  }

  /**
   * 
   * @param {string} name machine name
   * @param {string} zone zone
   * @param {string} machineType type of machine
   * @param {string|array} tags tags
   */
  _createMachine(name, zone, machineType, tags) {
    return new Promise(resolve => {
      const driver = 'google'

      let args = [
        'create',
        name,
        '--driver',
        driver,
        `--${driver}-zone`,
        zone || this._defaults.zone,
        `--${driver}-machine-type`,
        machineType || this._defaults.machineType,
        `--${driver}-project`,
        this._defaults.projectId,
        // `--google-use-internal-ip`,
        // '--google-use-internal-ip-only',
        `--${driver}-machine-image`,
        GCE_VM_IMAGE
      ]
      if (tags) {
        args.push(`--${driver}-tags`, tags)
      }

      console.log('running docker-machine ', args.join(' '))
      let builder = spawn('docker-machine', args)
      let stderr = ''

      builder.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`)
      })

      builder.stderr.on('data', (data) => {
        console.log(`stderr: ${data}`)
        stderr = data.toString()
      })

      builder.on('close', (code) => {
        console.log(`[createMachine] child process exited with code ${code}`)
        resolve(code)
      })
    })
  }

  /**
   * Removes one machine
   * @param {string} machine machine name
   */
  tearDownOne(machine) {
    return new Promise((resolve, reject) => {
      exec(`docker-machine rm -y ${machine}`, (err) => {
        if (err) {
          reject(err)
          return
        }
        resolve(null)
      })
    })
  }
}

module.exports = DockerMachine
