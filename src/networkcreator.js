'use strict'

const { EventEmitter } = require('events')
const { exec, spawn } = require('child_process')
const path = require('path')
const toml = require('toml')
const composefile = require('composefile')
const { timesLimit, each, eachLimit } = require('async')
const log = require('debug')('livepeer:test-harness:network')
const spawnThread = require('threads').spawn
const Pool = require('threads').Pool

const pool = new Pool()
const thread = pool.run(function(input, done) {
  // Everything we do here will be run in parallel in another execution context.
  // Remember that this function will be executed in the thread's context,
  // so you cannot reference any value of the surrounding code.
  // done({ string : input.string, integer : parseInt(input.string) })
  const ethers = require('ethers')
  // const log = require('debug')('livepeer:test-harness:network:worker')
  let randomKey = ethers.Wallet.createRandom()
  randomKey.encrypt('').then((json) => {
    console.log('acc: ', JSON.parse(json).address)
    done({
      JSON_KEY: json
    })
  })
}, {
  ethers: 'ethers',
})

class NetworkCreator extends EventEmitter {
  constructor (config, isToml) {
    super()
    if (isToml) {
      try {
        this.config = toml.parse(config)
      } catch (e) {
        throw e
      }
    } else {
      this.config = config
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

  loadBinaries (dist, cb) {
    // copy livepeer binaries to lpnode image folder
    console.log(`copying LP binary from ${this.config.livepeerBinaryPath}. ${__dirname}`)
    exec(`cp ${path.resolve(__dirname, this.config.livepeerBinaryPath)} ${path.resolve(__dirname, dist)}`,
    (err, stdout, stderr) => {
      if (err) throw err
      console.log('stdout: ', stdout)
      console.log('stderr: ', stderr)
      cb(null, stdout)
    })
  }

  buildLpImage (cb) {
    console.log('building lpnode...')
    let builder = spawn('docker', [
      'build',
      '-t',
      'lpnode:latest',
      path.resolve(__dirname, '../containers/lpnode')
    ])

    builder.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`)
    })

    builder.stderr.on('data', (data) => {
      console.log(`stderr: ${data}`)
    })

    builder.on('close', (code) => {
      console.log(`child process exited with code ${code}`)
      cb(null)
    })
    //
    // exec(`docker build -t lpnode:latest ./containers/lpnode/`, (err, stdout, stderr) => {
    //   if (err) throw err
    //   console.log('stdout: ', stdout)
    //   console.log('stderr: ', stderr)
    // })
  }

  generateComposeFile (outputPath, cb) {
    let output = {
      version: '3',
      outputFolder: path.resolve(__dirname, outputPath),
      filename: 'docker-compose.yml',
      services: {},
      networks: {
        testnet: {
          driver: this.config.local ? 'bridge' : 'overlay',
          external: this.config.local ? false : true
        }
      }
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

  _generateService (type, i, cb) {
    let generated = {
    // generated['lp_t_' + i] = {
      image: (this.config.local) ? 'lpnode:latest' : 'localhost:5000/lpnode:latest',
      ports: [
        `${getRandomPort(8935)}:8935`,
        `${getRandomPort(7935)}:7935`,
        `${getRandomPort(1935)}:1935`
      ],
      // TODO fix the serviceAddr issue
      command: this.getNodeOptions(type, this.config.nodes[`${type}s`].flags),
      depends_on: this.getDependencies(),
      networks: {
        testnet: {
          aliases: [`${type}_${i}`]
        }
      }
    }

    if (this.config.local) {

    } else {
      generated.logging = {
        driver: 'gcplogs',
        options: {
          'gcp-project': 'test-harness-226018'
        }
      }
    }
    // cb(null, generated)
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

    eachLimit(['transcoder', 'orchestrator', 'broadcaster'], 1, (type, callback) => {
      console.log(`generating ${type} nodes ${this.config.nodes[`${type}s`].instances}`)
      timesLimit(
        this.config.nodes[`${type}s`].instances,
        5,
        (i, next) => {
          // generate separate services with the forwarded ports.
          // append it to output as output.<node_generate_id> = props
          this._generateService(type, i, next)
        },
        (err, nodes) => {
          if (err) throw err
          // console.log(`finished ${type}, ${JSON.stringify(nodes)}`)
          nodes.forEach((node, i) => {
            output[`${type}_${i}`] = node
          })
          // console.log('output', output)
          callback(null)
        }
      )
    }, (err) => {
      if (err) throw err
      console.log('all nodes have been generated')
      pool.killAll()
      log('output:', output)
      cb(null, output)
    })
  }

  generateGethService () {
    switch (this.config.blockchain.name) {
      case 'rinkeby':
      case 'mainnet':
      case 'offchain':
          // no need to run a node.
        break
      case 'lpTestNet':
      default:
        return {
          // image: 'geth-dev:latest',
          image: 'darkdragon/geth-with-livepeer-protocol:pm',
          ports: [
            '8545:8545',
            '8546:8546',
            '30303:30303'
          ],
          networks: {
            testnet: {
              aliases: [`geth`]
            }
          },
          deploy: {
            placement: {
              constraints: ['node.role == manager']
            }
          },
          logging: {
            driver: 'gcplogs',
            options: {
              'gcp-project': 'test-harness-226018'
            }
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
        output.push(`-ethUrl ws://geth:8546`)
        output.push(`-controllerAddr ${this.config.blockchain.controllerAddress}`)
        break
      default:
        // output.push('-devenv')
    }

    // output.push(`-ethPassword ""`)
    output.push(userFlags)

    let outputStr = output.join(' ')
    // console.log('outputStr: ', outputStr)
    return outputStr
  }

  // getEnvVars (cb) {
  //   let randomKey = ethers.Wallet.createRandom()
  //   randomKey.encrypt('').then((json) => {
  //     log('encrypted json: ', json)
  //     cb(null, {
  //       JSON_KEY: json
  //     })
  //   })
  // }

  getEnvVars (cb) {
    thread.send('')
    .on('done',(env) => {
      // console.log('got env, ', env)
      // thread.kill()
      cb(null, env)
    })
    .on('error', function(error) {
      console.error('Worker errored:', error)
    })
    .on('exit', function() {
      console.log('Worker has been terminated.')
    })
  }

  createJSONKeys (num, outputFolder, cb) {
    let randomKey = ethers.Wallet.createRandom()
    randomKey.encrypt('').then((json) => {
      log('encrypted json: ', json)
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

let usedPorts = [8545, 8546, 30303]
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
