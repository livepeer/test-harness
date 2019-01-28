'use strict'

const { EventEmitter } = require('events')
const { exec, spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const toml = require('toml')
const composefile = require('composefile')
const { timesLimit, each, eachLimit } = require('async')
const log = require('debug')('livepeer:test-harness:network')
const spawnThread = require('threads').spawn
const Pool = require('threads').Pool
const { getNames, spread } = require('./utils/helpers')

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
    this.hasGeth = false
    this.hasMetrics = false

    const workers = getNames(`${config.name}-worker-`, config.machines.num-1, 1)
    const broadcasters = getNames('broadcaster_', config.nodes.broadcasters.instances)
    const orchestrators = getNames('orchestrator_', config.nodes.orchestrators.instances)
    const transcoders = getNames('transcoder_', config.nodes.transcoders.instances)

    this._serviceConstraints = {
      broadcaster: spread(broadcasters, workers, true),
      orchestrator: spread(orchestrators, workers, true),
      transcoder: spread(transcoders, workers, true),
    }
  }

  isPortUsed (port) {
    if (Object.keys(this.ports).indexOf(port.toString()) === -1) {
      return false
    }

    return true
  }

  loadBinaries (dist, cb) {
    if (this.config.localBuild) {
      return cb()
    }
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
    if (this.config.localBuild) {
      this.buildLocalLpImage(cb)
      return
    }
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

  async buildLocalLpImage(cb) {
    console.log('building local lpnode...')
    return new Promise((resolve, reject) => {
      const lpnodeDir = path.resolve(__dirname, '../containers/lpnode')
      const builder = spawn('docker', [
        'build',
        '-t',
        'lpnode:latest',
        '-f',
        path.join(lpnodeDir, 'Dockerfile.local'),
        lpnodeDir
      ])

      builder.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`)
      })

      builder.stderr.on('data', (data) => {
        console.log(`stderr: ${data}`)
      })

      builder.on('close', (code) => {
        console.log(`child process exited with code ${code}`)
        if (code != 0) {
          reject(code)
          if (cb) {
            cb(err)
          }
        } else {
          resolve()
          if (cb) {
            cb(null)
          }
        }
      })
    })
    //
    // exec(`docker build -t lpnode:latest ./containers/lpnode/`, (err, stdout, stderr) => {
    //   if (err) throw err
    //   console.log('stdout: ', stdout)
    //   console.log('stderr: ', stderr)
    // })
  }

  generateComposeFile (outputPath, cb) {
    const outputFolder = path.resolve(__dirname, outputPath)
    let output = {
      version: '3.7',
      outputFolder,
      filename: 'docker-compose.yml',
      services: {},
      networks: {
        testnet: {
          driver: this.config.local ? 'bridge' : 'overlay',
          external: this.config.local ? false : true
        }
      },
      volumes: {}
      // network_mode: 'host',
    }

    this.copySecrets(output, outputFolder)

    this.generateServices((err, services, volumes) => {
      if (err) throw err
      output.services = services
      output.volumes = volumes
      this.nodes = output.services
      composefile(output, cb)
    })
  }

  copySecrets (top, outputFolder) {
    Object.keys(this.config.nodes).forEach(nodesName => {
      const nodes = this.config.nodes[nodesName]
      const gs = nodes.googleStorage
      if (gs) {
        if (!gs.bucket) {
          throw 'Should specify "bucket" field for google storage'
        }
        if (!gs.key) {
          throw 'Should specify "key" field for google storage'
        }
        console.log('dirname:', __dirname)
        const fileName = path.basename(gs.key)
        gs.keyName = fileName
        const fnp = fileName.split('.')
        gs.secretName = fnp[0]
        const srcPath = path.resolve(__dirname, '..', gs.key)
        console.log(`Copying from ${srcPath} to ${outputFolder}`)
        fs.copyFileSync(srcPath, path.join(outputFolder, fileName))
        if (!top.secrets) {
          top.secrets = {}
        }
        top.secrets[gs.secretName] = {
          file: './' + fileName,
          name: gs.secretName
        }
      }
    })
  }

  getDependencies () {
    const deps = []
    if (this.hasGeth) {
      deps.push('geth')
    }
    if (this.hasMetrics) {
      deps.push('metrics')
    }
    return deps
  }

  _generateService (type, i, volumes, cb) {
    const serviceName = `${type}_${i}`
    const nodes = this.config.nodes[`${type}s`]
    const vname = 'v_' + serviceName
    const generated = {
      image: (this.config.local || this.config.localBuild) ? 'lpnode:latest' : 'localhost:5000/lpnode:latest',
      ports: [
        `${getRandomPort(8935)}:8935`,
        `${getRandomPort(7935)}:7935`,
        `${getRandomPort(1935)}:1935`
      ],
      // TODO fix the serviceAddr issue
      command: this.getNodeOptions(type, nodes),
      depends_on: this.getDependencies(),
      networks: {
        testnet: {
          aliases: [serviceName]
        }
      },
      volumes: [vname + ':/lpData']
    }
    volumes[vname] = {}
    if (nodes.googleStorage) {
      generated.secrets = [nodes.googleStorage.secretName]
    }

    if (this.config.local) {

    } else {
     generated.logging = {
        driver: 'gcplogs',
        options: {
          'gcp-project': 'test-harness-226018',
        }
      }
      if (type === 'orchestrator' || type == 'transcoder' || type == 'broadcaster') {
        generated.deploy = {
          replicas: 1,
          placement: {
            constraints: [
              'node.role == worker', 
              'node.hostname == ' + this._serviceConstraints[type].get(serviceName)
            ]
          }
        }
        if (this.config.constrainResources) {
          generated.deploy.resources = {
            reservations: {
              cpus: '0.2',
              memory: '100M'
            }
          }
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
    const output = {}
    const volumes = {}
    
    // if (this.config.blockchain && this.config.blockchain.controllerAddress === '') {
    // }
    output.geth = this.generateGethService(volumes)
    if (!output.geth) {
      delete output.geth
      this.hasGeth = false
    } else {
      this.hasGeth = true
    }
    if (this.config.startMetricsServer) {
      output.mongodb = this.generateMongoService(volumes)
      output.metrics = this.generateMetricsService()
      this.hasMetrics = true
    }

    eachLimit(['transcoder', 'orchestrator', 'broadcaster'], 1, (type, callback) => {
      console.log(`generating ${type} nodes ${this.config.nodes[`${type}s`].instances}`)
      timesLimit(
        this.config.nodes[`${type}s`].instances,
        5,
        (i, next) => {
          // generate separate services with the forwarded ports.
          // append it to output as output.<node_generate_id> = props
          this._generateService(type, i, volumes, next)
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
      cb(null, output, volumes)
    })
  }

  generateMetricsService () {
    const mService = {
        image: 'darkdragon/livepeermetrics:latest',
        ports: [
          '3000:3000',
        ],
        depends_on: ['mongodb'],
        networks: {
          testnet: {
            aliases: [`metrics`]
          }
        },
        deploy: {
          placement: {
            constraints: ['node.role == manager']
          }
        }
      }
      return mService
  }

  generateMongoService (volumes) {
    const mService = {
        image: 'mongo:latest',
        networks: {
          testnet: {
            aliases: [`mongodb`]
          }
        },
        deploy: {
          placement: {
            constraints: ['node.role == manager']
          }
        },
        volumes: ['vmongo1:/data/db', 'vmongo2:/data/configdb']
        // networks: ['outside']
      }
      volumes.vmongo1 = {}
      volumes.vmongo2 = {}
      return mService
  }

  generateGethService (volumes) {
    let gethService = {
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
      }
    }

    if (!this.config.local) {
      gethService.logging = {
        driver: 'gcplogs',
        options: {
          'gcp-project': 'test-harness-226018'
        }
      }

      gethService.deploy = {
        replicas: 1,
        placement: {
          constraints: ['node.role == manager']
        }
      }
      if (this.config.constrainResources) {
        gethService.deploy.resources = {
          reservations: {
            cpus: '0.5',
            memory: '500M'
          }
        }
      }
      gethService.volumes = ['vgeth:/root/.ethereum']
      volumes.vgeth = {}
    }

    switch (this.config.blockchain.name) {
      case 'rinkeby':
      case 'mainnet':
      case 'offchain':
          // no need to run a node.
        break
      case 'lpTestNet2':
      case 'lpTestNet':
      default:
        return gethService
    }
  }

  getNodeOptions (nodeType, nodes) {
    const output = []
    const userFlags = nodes.flags

    // default 0.0.0.0 binding
    output.push(`-httpAddr 0.0.0.0:8935`)
    output.push(`-cliAddr 0.0.0.0:7935`)
    output.push(`-rtmpAddr 0.0.0.0:1935`)

    if (nodes.googleStorage) {
      output.push('-gsbucket')
      output.push(nodes.googleStorage.bucket)
      output.push('-gskey')
      output.push('/run/secrets/' + nodes.googleStorage.secretName)
    }

    // default datadir
    output.push(`-datadir /lpData`)

    if (this.hasMetrics) {
      output.push('-monitor=true')
      output.push('-monitorhost http://metrics:3000/api/events')
    }

    if (nodeType === 'transcoder' ) { //|| nodeType === 'orchestrator') {
      output.push('-transcoder')
    } else if (nodeType === 'orchestrator') {
      output.push('-orchestrator')
    }

    switch (this.config.blockchain.name) {
      case 'rinkeby':
        output.push('-rinkeby')
        break
      case 'lpTestNet2':
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
