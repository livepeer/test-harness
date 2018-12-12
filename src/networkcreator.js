'use strict'

const { EventEmitter } = require('events')
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
      this.hashGeth = true
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
        output.push('-devenv')
        output.push(`-ethUrl http://geth:8545`)
        output.push(`-controllerAddr ${this.config.blockchain.controllerAddress}`)
        break
      default:
        output.push('-devenv')
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

// side note: Get controller address
// docker run -it --entrypoint="" darkdragon/geth-with-livepeer-protocol cat /root/.ethereum/controllerAddress


// ffmpeg
// ffmpeg -re -i Heat.1995.mp4 -vcodec libx264 -profile:v main -tune zerolatency -preset superfast -r 30 -g 4 -keyint_min 4 -sc_threshold 0 -b:v 2500k -maxrate 2500k -bufsize 2500k -acodec aac -strict -2 -b:a 96k -ar 48000 -ac 2 -f flv rtmp://localhost:1935
