'use strict'

const { EventEmitter } = require('events')
const { exec } = require('child_process')
const path = require('path')
const toml = require('toml')
const composefile = require('composefile')

class NetworkCreator extends EventEmitter {
  constructor (config) {
    super()

    try {
      this.config = toml.parse(config)
    } catch (e) {
      throw e
    }

    this.ports = {}
    this.nodes = {}
  }

  isPortUsed (port) {
    if (Object.keys(this.ports).indexOf(port.toString()) === -1) {
      return false
    }

    return true
  }

  loadBinaries (cb) {
    // copy livepeer binaries to lpnode image folder
    console.log(`copying LP binary from ${this.config.livepeerBinaryPath}`)
    exec(`cp ${this.config.livepeerBinaryPath} ./containers/lpnode/binaries`,
    (err, stdout, stderr) => {
      if (err) throw err
      console.log('stdout: ', stdout)
      console.log('stderr: ', stderr)
      cb(null, stdout)
    })
  }

  buildLpImage (cb) {
    console.log('building lpnode...')
    exec(`docker build -t lpnode ./containers/lpnode/`, (err, stdout, stderr) => {
      if (err) throw err
      console.log('stdout: ', stdout)
      console.log('stderr: ', stderr)
      cb(null, stdout)
    })
  }

  generateComposeFile (outputPath, cb) {
    let output = {
      version: 3,
      outputFolder: outputPath,
      filename: 'docker-compose.yml',
      services: {},
      // network_mode: 'host',
    }

    output.services = this.generateServices()
    this.nodes = output.services
    composefile(output, cb)
  }

  getDependencies () {
    if (this.hasGeth) {
      return ['geth']
    } else {
      return []
    }
  }

  generateServices () {
    let output = {}
    // if (this.config.blockchain && this.config.blockchain.controllerAddress === '') {
    // }
    output.geth = this.generateGethService()
    if (!output.geth) {
      delete output.geth
      this.hasGeth = false
    } else {
      this.hasGeth = true
    }
    // transcoders
    for (let i = 0; i < this.config.nodes.transcoders.instances; i++) {
      // generate separate services with the forwarded ports.
      // append it to output as output.<node_generate_id> = props
      output['lp_t_' + i] = {
        image: 'lpnode:latest',
        ports: [
          `${getRandomPort(8935)}:8935`,
          `${getRandomPort(7935)}:7935`,
          `${getRandomPort(1935)}:1935`,
        ],
        // TODO fix the serviceAddr issue
        command: this.getNodeOptions('transcoder', this.config.nodes.transcoders.flags),
        depends_on: this.getDependencies()
        // networks: [ 'outside']
      }
    }

    // orchestrators
    for (let i = 0; i < this.config.nodes.orchestrators.instances; i++) {
      output['lp_o_' + i] = {
        image: 'lpnode:latest',
        ports: [
          `${getRandomPort(8935)}:8935`,
          `${getRandomPort(7935)}:7935`,
          `${getRandomPort(1935)}:1935`,
        ],
        command: this.getNodeOptions('orchestrator', this.config.nodes.orchestrators.flags),
        depends_on: this.getDependencies()
        // networks: [ 'outside']
      }
    }

    // broadcasters
    for (let i = 0; i < this.config.nodes.broadcasters.instances; i++) {

      output['lp_b_' + i] = {
        image: 'lpnode:latest',
        ports: [
          `${getRandomPort(8935)}:8935`,
          `${getRandomPort(7935)}:7935`,
          `${getRandomPort(1935)}:1935`,
        ],
        command: this.getNodeOptions('broadcaster', this.config.nodes.broadcasters.flags),
        depends_on: this.getDependencies()
        // networks: [ 'outside']
      }
    }

    return output
  }

  generateGethService () {
    switch (this.config.blockchain.name) {
      case 'rinkeby':
      case 'mainnet':
          // no need to run a node.
        break
      case 'lpTestNet':
      default:
        return {
          // image: 'geth-dev:latest',
          image: 'darkdragon/geth-with-livepeer-protocol:latest',
          ports: [
            '8545:8545',
            '8546:8546',
            '30303:30303'
          ]
          // networks: ['outside']
        }
    }
  }

  getNodeOptions (nodeType, userFlags) {
    let output = []

    // default 0.0.0.0 binding
    output.push(`-httpAddr 0.0.0.0:8935`)
    output.push(`-cliAddr 0.0.0.0:7935`)
    output.push(`-rtmpAddr 0.0.0.0:1935`)

    // default datadir
    output.push(`-datadir /lpData`)

    if (nodeType === 'transcoder' || nodeType === 'orchestrator') {
      output.push('-transcoder')
    }

    switch (this.config.blockchain.name) {
      case 'rinkeby':
        output.push('-rinkeby')
        break
      case 'lpTestNet':
        // output.push('-devenv')
        output.push(`-ethUrl ws://geth:8546`)
        output.push(`-controllerAddr ${this.config.blockchain.controllerAddress}`)
        break
      default:
        // output.push('-devenv')
    }

    output.push(userFlags)

    let outputStr = output.join(' ')
    console.log('outputStr: ', outputStr)
    return outputStr
  }
}

let usedPorts = []
function getRandomPort (origin) {
  // TODO, ugh, fix this terrible recursive logic, use an incrementer like a gentleman
  let port = origin + Math.floor(Math.random() * 999)
  if (usedPorts.indexOf(port) === -1) {
    usedPorts.push(port)
    return port
  } else {
    return getRandomPort(origin)
  }
}

module.exports = NetworkCreator
