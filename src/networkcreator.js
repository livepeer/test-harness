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

  generateServices () {
    let output = {}
    // if (this.config.blockchain && this.config.blockchain.controllerAddress === '') {
    // }
    output.geth = this.generateGethService()

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
        command: '-transcoder -devenv -ethUrl http://geth:8545 -controllerAddr 0x93ad00a63b14492386df9f1cc123d785705bdf99 -datadir /lpData --rtmpAddr 0.0.0.0:1935 --cliAddr 0.0.0.0:7935 --httpAddr 0.0.0.0:8935',
        depends_on: ['geth']
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
        command: '-devenv -ethUrl http://geth:8545 -controllerAddr 0x93ad00a63b14492386df9f1cc123d785705bdf99 -datadir /lpData --rtmpAddr 0.0.0.0:1935 --cliAddr 0.0.0.0:7935 --httpAddr 0.0.0.0:8935',
        depends_on: ['geth']
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
        command: '-devenv -ethUrl http://geth:8545 -controllerAddr 0x93ad00a63b14492386df9f1cc123d785705bdf99 -datadir /lpData --rtmpAddr 0.0.0.0:1935 --cliAddr 0.0.0.0:7935 --httpAddr 0.0.0.0:8935',
        depends_on: ['geth']
        // networks: [ 'outside']
      }
    }

    return output
  }

  generateGethService () {
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
