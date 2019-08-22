'use strict'
const {exec} = require('child_process')

class GpuTranscoder {
    constructor (config, opts) {
        this._config = config || {}
        this._opts = opts || {}
        this._sshParams = this._config.sshParams
        this._stackName = 'gpu'
    }

    generateTranscoderServices () {
        let services = {}

        let groups = Object.keys(this._config.nodes)
        eachLimit(groups, 1, (group, cb) => {
            let type = this._config.nodes[`${group}`].type
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

                        services[serviceName] = {
                            image,
                            ports: [
                                `${utils.getRandomPort(8935)}:8935`,
                                `${utils.getRandomPort(7935)}:7935`,
                                `${utils.getRandomPort(1935)}:1935`
                            ],

                        }

                })
            } 
        })
    }

    generateDockerStack () {
        let output = {
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
    }

    deployStack () {
        // return new Promise((resolve, reject) => {
        //     this._sshExec(this._sshParams, `sudo docker stack deploy -c ${composeFilePath} ${this._stackName}`).then((stdout) => {
        //         console.log('stack deploy: ', stdout)
        //         resolve(stdout)
        //     }).catch(reject)
        // })
        
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

    leaveSwarm () {
        return new Promise((resolve, reject) => {
            this._sshExec(this._sshParams, `sudo docker swarm leave`).then((stdout) => {
                console.log('leaveSwarm: ', stdout)
                stdout = stdout.trim()
                if (stdout === 'Node left the swarm.') {
                    return resolve(true)
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

                resolve(jsonResp)

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
            output.push('-orchAddr', `${this.config.o2t[`${gname}_${i}`]}:8935`)
            let oName = this.config.o2t[`${gname}_${i}`]
            let oGroup = oName.split('_')
            oGroup = oGroup.slice(0, oGroup.length - 1).join('_')
            console.log('o_group: ', oGroup)
            if (!this.config.nodes[oGroup].orchSecret) {
              console.log(chalk.red(`For transcoder nodes ${chalk.yellowBright('orchSecret')} should be specified on ${chalk.yellowBright('orchestrators')} config object.`))
              process.exit(17)
            }
            output.push('-orchSecret', `${this.config.nodes[oGroup].orchSecret}`)
            output.push('-transcoder')
            break
          case 'gpu_o':
            if (this.config.nodes[gname].orchSecret) {
              output.push('-orchSecret', this.config.nodes[gname].orchSecret)
            }
            output.push('-orchestrator')
            output.push('-pricePerUnit')
            output.push('1')
            output.push('-serviceAddr')
            output.push(this._getHostnameForService(gname, i) + ':8935')
            break
        }
    
        let ldir = ''
        switch (this.config.blockchain.name) {
          case 'rinkeby':
            output.push('-network=rinkeby')
            ldir = 'rinkeby'
            break
          case 'lpTestNet2':
          case 'lpTestNet':
            output.push('-network=devenv')
            output.push(`-ethUrl ws://geth:8546`)
            output.push(`-ethController ${this.config.blockchain.controllerAddress}`)
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
}

module.exports = GpuTranscoder