'use strict'

const { EventEmitter } = require('events')
const { exec } = require('child_process')
const path = require('path')
const toml = require('toml')
const composefile = require('composefile')
const ethers = require('ethers')
const { times, each } = require('async')

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
    exec(`docker build -t lpnode:latest ./containers/lpnode/`, (err, stdout, stderr) => {
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

    this.generateServices((err, services) => {
      if (err) throw err
      output.services = services
      this.nodes = output.services
      composefile(output, cb)
    })
  }

  getDependencies () {
    if (this.hasGeth) {
      return ['geth']
    } else {
      return []
    }
  }

  _generateService (type, cb) {
    let generated = {
    // generated['lp_t_' + i] = {
      image: 'lpnode:latest',
      ports: [
        `${getRandomPort(8935)}:8935`,
        `${getRandomPort(7935)}:7935`,
        `${getRandomPort(1935)}:1935`
      ],
      // TODO fix the serviceAddr issue
      command: this.getNodeOptions(type, this.config.nodes[`${type}s`].flags),
      depends_on: this.getDependencies()
      // networks: [ 'outside']
    }

    this.getEnvVars((err, envObj) => {
      if (err) throw err
      generated.environment = envObj
      cb(null, generated)
    })
  }

  generateServices (cb) {
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

    each(['transcoder', 'orchestrator', 'broadcaster'], (type, callback) => {
      console.log(`generating ${type} nodes ${this.config.nodes[`${type}s`].instances}`)
      times(
        this.config.nodes[`${type}s`].instances,
        (i, next) => {
          // generate separate services with the forwarded ports.
          // append it to output as output.<node_generate_id> = props
          this._generateService(type, next)
        },
        (err, nodes) => {
          if (err) throw err
          console.log(`finished ${type}, ${JSON.stringify(nodes)}`)
          nodes.forEach((node, i) => {
            output[`lp_${type}_${i}`] = node
          })
          // console.log('output', output)
          callback(null)
        }
      )
    }, (err) => {
      if (err) throw err
      console.log('all nodes have been generated')
      console.log('output:', output)
      cb(null, output)
    })
    // // transcoders
    // for (let i = 0; i < this.config.nodes.transcoders.instances; i++) {
    //   // generate separate services with the forwarded ports.
    //   // append it to output as output.<node_generate_id> = props
    //   output['lp_t_' + i] = {
    //     image: 'lpnode:latest',
    //     ports: [
    //       `${getRandomPort(8935)}:8935`,
    //       `${getRandomPort(7935)}:7935`,
    //       `${getRandomPort(1935)}:1935`,
    //     ],
    //     // TODO fix the serviceAddr issue
    //     command: this.getNodeOptions('transcoder', this.config.nodes.transcoders.flags),
    //     depends_on: this.getDependencies()
    //     // networks: [ 'outside']
    //   }
    // }
    //
    // // orchestrators
    // for (let i = 0; i < this.config.nodes.orchestrators.instances; i++) {
    //   output['lp_o_' + i] = {
    //     image: 'lpnode:latest',
    //     ports: [
    //       `${getRandomPort(8935)}:8935`,
    //       `${getRandomPort(7935)}:7935`,
    //       `${getRandomPort(1935)}:1935`,
    //     ],
    //     command: this.getNodeOptions('orchestrator', this.config.nodes.orchestrators.flags),
    //     depends_on: this.getDependencies()
    //     // networks: [ 'outside']
    //   }
    // }
    //
    // // broadcasters
    // for (let i = 0; i < this.config.nodes.broadcasters.instances; i++) {
    //
    //   output['lp_b_' + i] = {
    //     image: 'lpnode:latest',
    //     ports: [
    //       `${getRandomPort(8935)}:8935`,
    //       `${getRandomPort(7935)}:7935`,
    //       `${getRandomPort(1935)}:1935`,
    //     ],
    //     command: this.getNodeOptions('broadcaster', this.config.nodes.broadcasters.flags),
    //     depends_on: this.getDependencies()
    //     // networks: [ 'outside']
    //   }
    // }
    //
    // return output
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
    // console.log('outputStr: ', outputStr)
    return outputStr
  }

  getEnvVars (cb) {
    let randomKey = ethers.Wallet.createRandom()
    randomKey.encrypt('').then((json) => {
      console.log('encrypted json: ', json)
      cb(null, {
        JSON_KEY: JSON.stringify(json)
      })
    })
  }

  createJSONKeys (num, outputFolder, cb) {
    let randomKey = ethers.Wallet.createRandom()
    randomKey.encrypt('').then((json) => {
      console.log('encrypted json: ', json)
      cb(null, json)
    })
  }

  // TODO, fix the docker-compose added prefix so it won't default to basename
  fundAccount (address, valueInEth, cb) {
    // NOTE: this requires the geth container to be running and account[0] to be unlocked.
    exec(`docker exec -it test-harness_geth_1
      geth --exec
      'eth.sendTransaction({
        from: eth.accounts[0],
        to: ${address},
        value: web3.toHex(web3.toWei(${valueInEth}, "ether"))
      })' attach`,
    (err, stdout, stderr) => {
      if (err) throw err
      console.log('stdout: ', stdout)
      console.log('stderr: ', stderr)
      cb(null, stdout)
    })
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
