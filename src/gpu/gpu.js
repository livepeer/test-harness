'use strict'
const path = require('path')
const fs = require('fs')

const {exec} = require('child_process')
const Pool = require('threads').Pool
const {timesLimit, eachLimit} = require('async')
const utils = require('../utils/helpers')
const composefile = require('composefile')
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

const DIST_DIR = '../../dist'

class GpuTranscoder {
    constructor (config, opts) {
        this._config = config || {}
        this._opts = opts || {}
        this._sshParams = this._config.sshParams
        this._stackName = 'gpu'
    }

    generateTranscoderServices (managerIP, oPorts) {
        return new Promise((resolve, reject) => {

            let services = {}

            let groups = Object.keys(this._config.nodes)
            eachLimit(groups, 1, (group, cb) => {
                let type = this._config.nodes[`${group}`].type
                console.log('type: ', type)
                if (type !== 'gpu') {
                    return cb()
                }
                if (type === 'gpu') {
                    timesLimit(
                        this._config.nodes[`${group}`].instances,
                        5,
                        (i, next) => {
                            let serviceName = `${group}_${i}`
                            let nodes = this._config.nodes[group]
                            let vname = `v_${serviceName}`
                            let image = this._config.local ? 'lpnode:latest' : 'localhost:5000/lpnode:latest'
                            if (this._config.publicImage) {
                                image = (typeof this._config.publicImage === 'string') ? this._config.publicImage : 'livepeer/go-livepeer:edge'
                            }
                            // override with gpu specific image
                            if (nodes.image) {
                                image = nodes.image
                            }

                            const generated = {
                                image,
                                ports: [
                                    `${utils.getRandomPort(8935)}:8935`,
                                    `${utils.getRandomPort(7935)}:7935`,
                                    `${utils.getRandomPort(1935)}:1935`
                                ],
                                command: this._getNodeOptions(group, nodes, i),
                                hostname: serviceName,
                                networks: {
                                    testnet: {
                                        aliases: [serviceName]
                                    }
                                },
                                labels: {
                                    gpu: 'genesis',
                                    host: this._config.sshParams.hostname
                                },
                                restart: 'unless-stopped',
                                volumes: [vname + ':/root/.lpData']
                            }

                            this._output.volumes[vname] = {}
                            if (nodes.googleStorage) {
                                generated.secrets = [nodes.googleStorage.secretName]
                            }
                        
                            if (!this._config.local) {
                                // if (!this._config.noGCPLogging) {
                                //   generated.logging = {
                                //     driver: 'gcplogs',
                                //     options: {
                                //       'gcp-project': PROJECT_ID,
                                //       'gcp-log-cmd': 'true',
                                //       'labels': `type=${type},node=${type}_${i},lpgroup=${gname}`
                                //     }
                                //   }
                                // }
                                if (type === 'gpu') {
                                generated.deploy = {
                                    replicas: 1,
                                    placement: {
                                    constraints: [
                                        'node.role == worker',
                                        'node.hostname == ' + this._sshParams.hostname
                                    ]
                                    }
                                }
                                //   if (this._config.constrainResources) {
                                //     if (type === 'broadcaster') {
                                //       generated.deploy.resources = {
                                //         reservations: {
                                //           cpus: '0.1',
                                //           memory: '250M'
                                //         },
                                //         limits: {
                                //           cpus: '0.2',
                                //           memory: '500M'
                                //         }
                                //       }
                                //     } else {
                                //       generated.deploy.resources = {
                                //         reservations: {
                                //           cpus: '1.0',
                                //           memory: '500M'
                                //         }
                                //       }
                                //     }
                                //   }
                                }
                            }
                            console.log('generated all but JSON key ', generated)
                            // cb(null, generated)
                            this.getEnvVars((err, envObj) => {
                                if (err) throw err
                                envObj.type = type
                                generated.environment = envObj
                                this._output.services[serviceName] = generated
                                console.log('generated service ', serviceName, generated)
                                next(null)
                            })

                    }, cb)
                } 
            }, (err, results) => {
                if (err) {
                    reject(err)
                } else {
                    console.log('all gpu transcoders generated ', results)
                    resolve(true)
                }
            })
        })
    }

    async generateDockerStack (outputPath = `${DIST_DIR}/${this._config.name}`) {
        console.log('output path: ', outputPath)
        const outputFolder = path.resolve(__dirname, outputPath)
        console.log('output folder: ', outputFolder)
        this._outputFolder = outputFolder
        if (!fs.existsSync(outputFolder)) {
            fs.mkdirSync(outputFolder, { recursive: true, mode: 484 })
        }
        
        return new Promise(async (resolve, reject) => {
            console.log('inside promise')
            this._output = {
                version: '3.7',
                outputFolder,
                filename: `${this._stackName}-stack.yml`,
                services: {},
                networks: {
                  testnet: {
                    driver: this._config.local ? 'bridge' : 'overlay',
                    external: this._config.local ? false : true
                  }
                },
                volumes: {},
                configs: {},
                // network_mode: 'host',
              }
            if (!this._opts.swarm) {
                throw new Error('Error: GpuTranscoder class requires swarm')
            }
    
            this._managerIP = await this._opts.swarm.getPubIP(`${this._config.name}-manager`)
            this._oPorts = await this._opts.swarm._api.getPortsArray(['orchestrators'])
            console.log('generating services...', this._managerIP, this._oPorts)
            await this.generateTranscoderServices(this._managerIP, this._oPorts)
            console.log('storing services...')    
            composefile(this._output, (err, resp) => {
                console.log('compose file stored', err, resp)
                if (err) {
                    reject(err)
                } else {
                    pool.killAll()

                    resolve(outputFolder)
                }
            })
        })

    }

    deployStack () {
        return new Promise((resolve, reject) => {
            this._opts.swarm.deployComposeFile(
                `${this._outputFolder}/${this._stackName}-stack.yml`, this._stackName, `${this._config.name}-manager`
            ).then(resolve).catch(reject)
        })
    }

    rmStack () {

    }

    joinSwarm (token, url, opts) {
        return new Promise((resolve, reject) => {
            this._sshExec(this._sshParams, `sudo docker swarm join ${opts || ''} --token ${token} ${url}`).then((stdout) => {
                console.log('join swarm: ', stdout)
                resolve(stdout)
            }).catch(reject)
        })
    }

    leaveSwarm (shutdown) {
        return new Promise((resolve, reject) => {
            this._sshExec(this._sshParams, `sudo docker swarm leave`).then((stdout) => {
                console.log('leaveSwarm: ', stdout)
                stdout = stdout.trim()
                if (stdout === 'Node left the swarm.') {
                    return resolve(true)
                }
                if (shutdown) { 
                    pool.killAll()
                }
                resolve(stdout)
            }).catch(reject)
        })
    }

    _getSwarmStatus (sshParams) {
        return new Promise((resolve, reject) => {
            // example active response 
            // livepeer@livepeerNV1080Ti:~$ sudo docker info -f '{{json .Swarm}}'
            // {"NodeID":"uodot36a4sl4iayxn6jowmctq","NodeAddr":"172.21.40.201","LocalNodeState":"active","ControlAvailable":false,"Error":"","RemoteManagers":[{"NodeID":"xmin68zyt7148nos1uz4b0k7","Addr":"10.142.0.61:2377"}]}
            sshParams = sshParams || this._sshParams
    
            this._sshExec(sshParams, `sudo docker info -f '{{json .Swarm}}'`).then((stdout) => {
                let jsonResp
                try {
                    jsonResp = JSON.parse(stdout)
                } catch (e) {
                    console.error('[GPU Transcoding] couldn\'t parse ', stdout)
                    return resolve(stdout)
                }

                resolve(jsonResp.LocalNodeState)

            }).catch(reject)
        })
    }

    _sshExec(sshParams, command) {
        return new Promise((resolve, reject) => {
            // example active response 
            // livepeer@livepeerNV1080Ti:~$ sudo docker info -f '{{json .Swarm}}'
            // {"NodeID":"uodot36a4sl4iayxn6jowmctq","NodeAddr":"172.21.40.201","LocalNodeState":"active","ControlAvailable":false,"Error":"","RemoteManagers":[{"NodeID":"xmin68zyt7148nos1uz4b0k7","Addr":"10.142.0.61:2377"}]}
            sshParams = sshParams || this._sshParams
    
            exec(`${this._getSSHPrefix(sshParams)} "${command}"`, (err, stdout, stderr) => {
                if (err) {
                    console.error('[GPU Transcoding] _sshExec Error: ', command, err)
                    return reject(err)
                }

                resolve(stdout)
            })
        })
    }

    _getSSHPrefix (params) {
        return `ssh -i "${params.identityKey}" ${params.user}@${params.ip} `
    }

    _getNodeOptions (gname, nodes, i) {
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
    
        if (this._config.metrics) {
          output.push('-monitor=true')
        }
    
        // if (nodeType === 'orchestrator') {
        //   output.push('-initializeRound=true')
        // }
        let nodeType = this._config.nodes[gname].type || gname
    
        switch (nodeType) {
          case 'gpu':
            let oName = this._config.o2t[`${gname}_${i}`]
            const [po] = this._oPorts.filter(o => o.name === oName)

            output.push('-orchAddr', `${this._managerIP}:${po['8935']}`)
            // make sure the orchestrator updates -serviceAddr to public IP aswell
            utils.updateServiceUri(this._config.name, oName, this._managerIP, po)
            // -------------------------------

            let oGroup = oName.split('_')
            oGroup = oGroup.slice(0, oGroup.length - 1).join('_')
            console.log('o_group: ', oGroup)
            if (!this._config.nodes[oGroup].orchSecret) {
              console.log(chalk.red(`For transcoder nodes ${chalk.yellowBright('orchSecret')} should be specified on ${chalk.yellowBright('orchestrators')} config object.`))
              process.exit(17)
            }
            output.push('-orchSecret', `${this._config.nodes[oGroup].orchSecret}`)
            output.push('-transcoder')
            break
          case 'gpu_o':
            if (this._config.nodes[gname].orchSecret) {
              output.push('-orchSecret', this._config.nodes[gname].orchSecret)
            }
            output.push('-orchestrator')
            output.push('-pricePerUnit')
            output.push('1')
            output.push('-serviceAddr')
            output.push(this._getHostnameForService(gname, i) + ':8935')
            break
        }
    
        let ldir = ''
        switch (this._config.blockchain.name) {
          case 'rinkeby':
            output.push('-network=rinkeby')
            ldir = 'rinkeby'
            break
          case 'lpTestNet2':
          case 'lpTestNet':
            output.push('-network=devenv')
            output.push(`-ethUrl ws://${this._managerIP}:8546`)
            output.push(`-ethController ${this._config.blockchain.controllerAddress}`)
            ldir = 'devenv'
            break
          default:
            // output.push('-devenv')
        }
    
        // default datadir
        // output.push(`-datadir /lpData/${ldir}`)
    
        // output.push(`-ethPassword ""`)
        output.push(userFlags)
    
        let outputStr = output.join(' ')
        // console.log('outputStr: ', outputStr)
        return outputStr
      }
    
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
}

module.exports = GpuTranscoder