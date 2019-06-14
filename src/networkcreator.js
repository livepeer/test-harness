'use strict'

const { EventEmitter } = require('events')
const { exec, spawn } = require('child_process')
const path = require('path')
const tar = require('tar')
const fs = require('fs')
const toml = require('toml')
const chalk = require('chalk')
const composefile = require('composefile')
const { timesLimit, each, eachLimit } = require('async')
const log = require('debug')('livepeer:test-harness:network')
const Pool = require('threads').Pool
const { getNames, spread, needToCreateGeth } = require('./utils/helpers')
const { PROJECT_ID, NODE_TYPES } = require('./constants')
const YAML = require('yaml')
const mConfigs = require('./configs')

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

function countNeededMachines (config, type = undefined) {
  let machines = 0
  for (let groupName of Object.keys(config.nodes)) {
    const node = config.nodes[groupName]
    if (node.instances) {
      if (type && type !== node.type) {
        continue
      }
      machines += node.instances
    }
  }
  // if counting all machinges, add one for manager
  return type ? machines : machines + 1
}

function joinMaps (ma, mb) {
  const c = new Map()
  for (let t of ma) {
    c.set(t[0], t[1])
  }
  for (let t of mb) {
    c.set(t[0], t[1])
  }
  return c
}

function reverseMap (ma) {
  const c = new Map()
  for (let t of ma) {
    c.set(t[1], t[0])
  }
  return c
}

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
    if (!config.local) {
      const neededMachines = countNeededMachines(config)
      // setting config.machines.num property, because it is used by a lot of code downpath
      config.machines.num = neededMachines
      console.log(`For this config ${chalk.green(neededMachines)} machines should be created`)
      const workers = getNames(`${config.name}-worker-`, neededMachines-1, 1)
      const [_serviceConstraints, machine2serviceType] = this.getServiceConstraints(workers, config)
      this._serviceConstraints = _serviceConstraints

      console.log('_serviceConstraints: ', this._serviceConstraints)
      console.log('machine2serviceType: ', machine2serviceType)
      config.machines.machine2serviceType = machine2serviceType
      // process.exit(11)
    }
  }

  getServiceConstraints (workers, config) {
    let j  = 0
    let machine2serviceType = new Map()
    const c = Object.keys(config.nodes).reduce((ac, groupName, i) => {
      const n = config.nodes[groupName]
      const needed = n.instances
      const services = getNames(groupName + '_', needed)
      ac = joinMaps(ac, spread(services, workers.slice(j, j+needed), true))
      machine2serviceType = joinMaps(machine2serviceType, spread(workers.slice(j, j+needed), new Array(needed).fill(n.type), true))
      j += needed
      return ac
    }, new Map())
    return [c, machine2serviceType]
  }

  isPortUsed (port) {
    if (Object.keys(this.ports).indexOf(port.toString()) === -1) {
      return false
    }

    return true
  }

  loadBinaries (dist, cb) {
    return new Promise((resolve, reject) => {
      if (this.config.localBuild || this.config.publicImage) {
        resolve()
        if (cb) {
          cb()
        }
        return
      }
      // copy livepeer binaries to lpnode image folder
      console.log(`copying LP binary from ${this.config.livepeerBinaryPath}. ${__dirname}`)
      exec(`cp ${path.resolve(__dirname, this.config.livepeerBinaryPath)} ${path.resolve(__dirname, dist)}`,
      (err, stdout, stderr) => {
        if (err) throw err
        console.log('stdout: ', stdout)
        console.log('stderr: ', stderr)
        if (cb) {
          cb(null, stdout)
        }
        resolve(stdout)
      })
    })
  }

  compressAndCopyBinaries (dist, cb) {
    return new Promise((resolve, reject) => {
      if (this.config.localBuild || this.config.publicImage) {
        resolve()
        if (cb) {
          cb()
        }
        return
      }
      tar.c({
        gzip: true,
        file: `${path.resolve(__dirname, this.config.livepeerBinaryPath)}.tar.gz`,
        cwd: `${path.dirname(path.resolve(__dirname, this.config.livepeerBinaryPath))}`
      }, [path.basename(path.resolve(__dirname, this.config.livepeerBinaryPath))]).then((_) => {
        exec(`cp ${path.resolve(__dirname, this.config.livepeerBinaryPath)}.tar.gz ${path.resolve(__dirname, dist)}`,
        (err, stdout, stderr) => {
          if (err) {
            process.exit('Error transferring binaries', err)
            throw err
          }
          console.log('stdout: ', stdout)
          console.log('stderr: ', stderr)
          if (cb) {
            cb(null, stdout)
          }
          resolve(stdout)
        })
      })
    })
  }

  buildLpImage (cb) {
    return new Promise((resolve, reject) => {
      if (this.config.localBuild) {
        return this.buildLocalLpImage(cb).then(resolve, reject)
      }
      if (this.config.publicImage) {
        resolve()
        if (cb) {
          cb()
        }
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
        if (cb) {
          cb(null)
        }
        if (code) {
          reject(code)
        } else {
          resolve()
        }
      })
      //
      // exec(`docker build -t lpnode:latest ./containers/lpnode/`, (err, stdout, stderr) => {
      //   if (err) throw err
      //   console.log('stdout: ', stdout)
      //   console.log('stderr: ', stderr)
      // })
    })
  }

  async buildLocalLpImage(cb) {
    console.log('building local lpnode...')
    return new Promise((resolve, reject) => {
      // const lpnodeDir = path.resolve(__dirname, '../containers/lpnode')
      const builder = spawn('docker', [
        'tag', 'livepeerbinary:debian', 'lpnode:latest',
        // 'build',
        // '-t',
        // 'lpnode:latest',
        // '-f',
        // path.join(lpnodeDir, 'Dockerfile.local'),
        // lpnodeDir
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
    this._outputFolder = outputFolder
    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true, mode: 484 })
    }
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
      volumes: {},
      configs: {},
      // network_mode: 'host',
    }

    this.copySecrets(output, outputFolder)

    this.generateServices(outputFolder, (err, services, volumes, configs) => {
      if (err) throw err
      output.services = services
      output.volumes = volumes
      output.configs = configs
      this.nodes = output.services
      if (this.config.local) {
        this.mutateConfigsToVolumes(outputFolder, output)
      }
      composefile(output, cb)
    })
  }

  machinesCreated(ips) {
    // ips - array of public ips, starting from manager machine
    if (this.config.metrics && ips.length) {
      this.saveYaml(this._outputFolder, 'alertmanager.yml', mConfigs.alertManager(this.config.local, [], this.config.name,
        this.config.discordUserId, ips))
    }
  }

  mutateConfigsToVolumes(outputFolder, cf) {
    for (let sn of Object.keys(cf.services)) {
      const service = cf.services[sn]
      for (let config of (service.configs||[])) {
        const gConfig = cf.configs[config.source]
        if (!gConfig) {
          console.log(`Problem in config: ${config.source} not found in global config.`)
          process.exit(12)
        }
        // const fp = path.join(outputFolder, gConfig.file)
        if (!service.volumes) {
          service.volumes = []
        }
        service.volumes.push(gConfig.file + ':' + config.target + ':ro')
      }
      delete service.configs
    }
    delete cf.configs
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
        if (!fs.existsSync(outputFolder)) {
          fs.mkdirSync(outputFolder, { recursive: true, mode: 484 })
        }
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

  getDependencies (type, i) {
    const deps = []
    if (this.hasGeth) {
      deps.push('geth')
    }
    if (this.hasMetrics) {
      deps.push('prometheus')
      deps.push('loki')
      deps.push('logspout')
    }
    // if (type === 'transcoder') {
    //   deps.push(`orchestrator_${i}`)
    // }
    return deps
  }

  _generateStreamerService (gname, type, i, volumes, cb) {
    let serviceName = this._getHostnameForService(gname, i)
    console.log(`generate service serviceName: ${serviceName}`)
    const nodes = this.config.nodes[gname]
    const flags = nodes.flags || ''
    const generated = {
      image: 'livepeer/streamtester:latest',
      ports: [
        `${getRandomPort(7934)}:7934`,
      ],
      command: '/root/streamtester -server -serverAddr 0.0.0.0:7934 ' + flags,
      hostname: serviceName,
      networks: {
        testnet: {
          aliases: [serviceName]
        }
      },
      environment: {
        type: 'streamer'
      },
      restart: 'unless-stopped',
    }
    if (!this.config.local) {
      if (!this.config.noGCPLogging) {
        generated.logging = {
          driver: 'gcplogs',
          options: {
            'gcp-project': PROJECT_ID,
            'gcp-log-cmd': 'true',
            'labels': `type=${type},node=${type}_${i},lpgroup=${gname}`
          }
        }
      }
      generated.deploy = {
        replicas: 1,
        placement: {
          constraints: [
            'node.role == worker',
            'node.hostname == ' + this._serviceConstraints.get(serviceName)
          ]
        }
      }
    }
    cb(null, generated)
  }

  _getHostnameForService(gname, i) {
    return `${gname}_${i}`
  }

  _getHostsByType(type) {
    let hosts = []
    for (let gname of Object.keys(this.config.nodes)) {
      let g = this.config.nodes[gname]
      if (g.type === type) {
        for (let i = 0; i < g.instances; i++) {
          hosts.push(this._getHostnameForService(gname, i))
        }
      }
    }
    return hosts
  }
  
  _generateService (gname, type, i, volumes, cb) {
    let serviceName = this._getHostnameForService(gname, i)
    console.log(`generate service serviceName: ${serviceName}`)
    const nodes = this.config.nodes[gname]
    const vname = 'v_' + serviceName
    let image = this.config.local ? 'lpnode:latest' : 'localhost:5000/lpnode:latest'
    if (this.config.publicImage) {
      image = (typeof this.config.publicImage === 'string') ? this.config.publicImage : 'livepeer/go-livepeer:edge'
    }
    const generated = {
      // image: (this.config.local || this.config.localBuild) ? 'lpnode:latest' : 'localhost:5000/lpnode:latest',
      // image: this.config.local ? 'lpnode:latest' : 'localhost:5000/lpnode:latest',
      image,
      // image: 'localhost:5000/lpnode:latest',
      ports: [
        `${getRandomPort(8935)}:8935`,
        `${getRandomPort(7935)}:7935`,
        `${getRandomPort(1935)}:1935`
      ],
      // TODO fix the serviceAddr issue
      command: this.getNodeOptions(gname, nodes, i),
      depends_on: this.getDependencies(type, i),
      hostname: serviceName,
      networks: {
        testnet: {
          aliases: [serviceName]
        }
      },
      labels: {
        zone: this._getZoneFromConfig()
      },
      restart: 'unless-stopped',
      volumes: [vname + ':/root/.lpData']
    }
    volumes[vname] = {}
    if (nodes.googleStorage) {
      generated.secrets = [nodes.googleStorage.secretName]
    }

    if (!this.config.local) {
      if (!this.config.noGCPLogging) {
        generated.logging = {
          driver: 'gcplogs',
          options: {
            'gcp-project': PROJECT_ID,
            'gcp-log-cmd': 'true',
            'labels': `type=${type},node=${type}_${i},lpgroup=${gname}`
          }
        }
      }
      if (type === 'orchestrator' || type === 'transcoder' || type === 'broadcaster') {
        generated.deploy = {
          replicas: 1,
          placement: {
            constraints: [
              'node.role == worker',
              'node.hostname == ' + this._serviceConstraints.get(serviceName)
            ]
          }
        }
        if (this.config.constrainResources) {
          if (type === 'broadcaster') {
            generated.deploy.resources = {
              reservations: {
                cpus: '0.1',
                memory: '250M'
              },
              limits: {
                cpus: '0.2',
                memory: '500M'
              }
            }
          } else {
            generated.deploy.resources = {
              reservations: {
                cpus: '1.0',
                memory: '500M'
              }
            }
          }
        }
      }
    }
    // cb(null, generated)
    this.getEnvVars((err, envObj) => {
      if (err) throw err
      envObj.type = type
      generated.environment = envObj
      cb(null, generated)
    })
  }

  generateServices (outputFolder, cb) {
    const output = {}
    const volumes = {}
    const configs = {}

    output.geth = this.generateGethService(volumes)
    if (!output.geth) {
      delete output.geth
      this.hasGeth = false
    } else {
      this.hasGeth = true
    }
    this.hasMetrics = this.config.metrics
    if (this.hasMetrics) {
      // output.prometheus = this.generatePrometheusService(outputFolder, volumes, configs)
      output.cadvisor = this.generateCAdvisorService(volumes)
      output.grafana = this.generateGrafanaService(outputFolder, volumes, configs)
      output['node-exporter'] = this.generateNodeExporterService(volumes)
      output.loki = this.generateLokiService(outputFolder, volumes, configs)
      output.logspout = this.generateLogspoutService(outputFolder, volumes, configs)
    }

    let groups = Object.keys(this.config.nodes)
    // if (!groups || groups.length < 1) {
    //   groups = ['broadcaster', 'orchestrator', 'transcoder']
    // }
    eachLimit(groups, 1, (group, callback) => {
      let type = this.config.nodes[`${group}`].type
      // if (!type) {
      //   // type = group.slice(0, group.length - 1)
      // }
      console.log(`generating group ${group} type: ${type} nodes ${this.config.nodes[`${group}`].instances}`)
      timesLimit(
        this.config.nodes[`${group}`].instances,
        5,
        (i, next) => {
          // generate separate services with the forwarded ports.
          // append it to output as output.<node_generate_id> = props
          if (type === 'streamer') {
            this._generateStreamerService(group, type, i, volumes, next)
          } else {
            this._generateService(group, type, i, volumes, next)
          }
        },
        (err, nodes) => {
          if (err) throw err
          // console.log(`finished ${type}, ${JSON.stringify(nodes)}`)
          nodes.forEach((node, i) => {
            output[`${group}_${i}`] = node
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
      if (this.config.metrics) {
        output.prometheus = this.generatePrometheusService(outputFolder, Object.keys(output), this.config.nodes, volumes, configs)
        output.alertmanager = this.generateAlertManagerService(outputFolder, Object.keys(output), volumes, configs)
      }

      // output.pumba = this.generatePumbaService()

      cb(null, output, volumes, configs)
    })
  }

  generatePumbaService () {
    const service = {
      image: 'gaiaadm/pumba:latest',
      volumes: ['/var/run/docker.sock:/var/run/docker.sock'],
      networks: {
        testnet: {
          aliases: [`pumba`]
        }
      },
      deploy: {
        mode: 'global'
      },
      restart: 'unless-stopped',
      command: [
        `--interval`,
        '10s',
        `--random`,
        `kill`,
        `--signal`,
        'SIGKILL',
        're2:livepeer_o_a*'
      ]
    }

    return service
  }

  generateAlertManagerService (outputFolder, servicesNames, volumes, configs) {
    const service = {
      image: 'prom/alertmanager:latest',
      // image: 'localalert:latest',
      command: ['--config.file=/etc/alert/alertmanager.yml', '--log.level=debug'],
      ports: ['9093:9093'],
      networks: {
        testnet: {
          aliases: [`alertmanager`]
        }
      },
      deploy: {
        placement: {
          constraints: ['node.role == manager']
        }
      },
      restart: 'unless-stopped',
      configs: [{
        source: 'alertcfg',
        target: '/etc/alert/alertmanager.yml'
      }]
    }
    if (!this.config.local && !this.config.noGCPLogging) {
     service.logging = {
        driver: 'gcplogs',
        options: {
          'gcp-project': PROJECT_ID,
          'gcp-log-cmd': 'true',
          'labels': `type=prometheus`
        }
      }
    }
    configs.alertcfg = {
      file: './alertmanager.yml'
    }
    // const servicesToMonitor = servicesNames.filter(sn => {
    //   return sn.startsWith('orchestrator') || sn.startsWith('broadcaster')
    //   // || sn.startsWith('transcoder') - right now standalone transcoder does not expose CLI port
    // })
    this.saveYaml(outputFolder, 'alertmanager.yml', mConfigs.alertManager(this.config.local, [], this.config.name, this.config.discordUserId))
    return service
  }

  generatePrometheusService (outputFolder, servicesNames, configNodes, volumes, configs) {
    const service = {
      image: 'prom/prometheus:latest',
      command: ['--config.file=/etc/prometheus/prometheus.yml', '--storage.tsdb.retention.time=30d'],
      depends_on: ['cadvisor', 'node-exporter'],
      ports: ['9090:9090'],
      networks: {
        testnet: {
          aliases: [`prometheus`]
        }
      },
      deploy: {
        placement: {
          constraints: ['node.role == manager']
        }
      },
      restart: 'unless-stopped',
      configs: [{
        source: 'promcfg',
        target: '/etc/prometheus/prometheus.yml'
      }, {
        source: 'alertrulescfg',
        target: '/etc/prometheus/alert.rules'
      }]
    }
    if (!this.config.local && !this.config.noGCPLogging) {
     service.logging = {
        driver: 'gcplogs',
        options: {
          'gcp-project': PROJECT_ID,
          'gcp-log-cmd': 'true',
          'labels': `type=prometheus`
        }
      }
    }
    configs.promcfg = {
      file: './prometheus.yml'
    }
    configs.alertrulescfg = {
      file: './alert.rules'
    }
    const groups = Object.keys(configNodes)
    const servicesToMonitorByType = new Map()
    for (let sn of servicesNames) {
      const group = groups.find(g => sn.startsWith(g + '_'))
      if (group) {
        const typ = configNodes[group].type
        const cn = servicesToMonitorByType.get(typ)||[]
        cn.push(sn)
        servicesToMonitorByType.set(typ, cn)
      }
    }
    this.saveYaml(outputFolder, 'prometheus.yml', mConfigs.prometheus(this.config.local, servicesToMonitorByType))
    this.saveYaml(outputFolder, 'alert.rules', mConfigs.alertRules(this.config.local))
    return service
  }

  saveYaml (outputFolder, name, content) {
    // console.log(`===== saving ${name} into ${outputFolder}`)
    // console.log(content)
    fs.writeFileSync(path.join(outputFolder, name), YAML.stringify(content))
  }

  generateLogspoutService (outputFolder, volumes, configs) {
    const service = {
      image: 'darkdragon/logspout-loki:latest',
      command: ['/bin/logspout' ,'loki://loki:3100/api/prom/push?filter.sources=stdout%2Cstderr'],
      // ports: ['3100:3100'],
      networks: {
        testnet: {
        }
      },
      labels: {
        'logspout.exclude': 'true',
      },
      environment: {
        'EXCLUDE_LABEL': 'logspout.exclude',
      },
      deploy: {
        mode: 'global',
      },
      restart: 'unless-stopped',
      // volumes: ['/var/run/docker.sock:/var/run/docker.sock', '/etc/hostname:/etc/host_hostname:ro'],
      volumes: ['/var/run/docker.sock:/var/run/docker.sock'],
    }
    return service
  }

  generateLokiService (outputFolder, volumes, configs) {
    const service = {
      image: 'grafana/loki:latest',
      command: ['-config.file=/etc/loki/local-config.yaml'],
      ports: ['3100:3100'],
      networks: {
        testnet: {
          aliases: [`loki`]
        }
      },
      deploy: {
        placement: {
          constraints: ['node.role == manager']
        }
      },
      restart: 'unless-stopped',
      configs: [{
        source: 'lokiConfig',
        target: '/etc/loki/local-config.yaml'
      }]
    }
    if (!this.config.local && !this.config.noGCPLogging) {
     service.logging = {
        driver: 'gcplogs',
        options: {
          'gcp-project': PROJECT_ID,
          'gcp-log-cmd': 'true',
          'labels': `type=loki`
        }
      }
    }
    configs.lokiConfig = {
      file: './loki.yml'
    }
    this.saveYaml(outputFolder, 'loki.yml', mConfigs.loki(this.config.local))

    return service
  }

  generateNodeExporterService (volumes) {
    const service = {
      image: 'prom/node-exporter:latest',
      command: ['--config.file=/etc/prometheus/prometheus.yml'],
      command: [
        '--path.procfs=/host/proc',
        '--path.sysfs=/host/sys',
        '--path.rootfs=/host',
        '--collector.filesystem.ignored-mount-points="^(/rootfs|/host|)/(sys|proc|dev|host|etc)($$|/)"',
        '--collector.filesystem.ignored-fs-types="^(sys|proc|auto|cgroup|devpts|ns|au|fuse\.lxc|mqueue)(fs|)$$"'
      ],
      networks: {
        testnet: {
          // aliases: [`cadvisor`]
        }
      },
      deploy: {
        mode: 'global'
        // placement: {
        //   constraints: ['node.role == manager']
        // }
      },
      restart: 'unless-stopped',
      volumes: ['/proc:/host/proc:ro', '/sys:/host/sys:ro', '/:/rootfs:ro'] // '/etc/hostname:/etc/host_hostname']
    }
    if (this.config.local) {
      service.networks.testnet.aliases = ['node-exporter']
    }
    if (!this.config.local && !this.config.noGCPLogging) {
     service.logging = {
        driver: 'gcplogs',
        options: {
          'gcp-project': PROJECT_ID,
          'gcp-log-cmd': 'true',
          'labels': `type=cadvisor`
        }
      }
    }
    return service
  }

  generateCAdvisorService (volumes) {
    const service = {
      image: 'google/cadvisor:latest',
      ports: ['8080:8080'],
      depends_on: ['geth'],
      networks: {
        testnet: {
          // aliases: [`cadvisor`]
        }
      },
      deploy: {
        mode: 'global'
        // placement: {
        //   constraints: ['node.role == manager']
        // }
      },
      restart: 'unless-stopped',
      volumes: ['/:/rootfs:ro', '/var/run:/var/run:rw', '/sys:/sys:ro', '/var/lib/docker/:/var/lib/docker:ro',
        '/dev/disk/:/dev/disk:ro', '/dev/kmsg:/dev/kmsg:ro'
      ]
    }
    if (this.config.local) {
      service.networks.testnet.aliases = ['cadvisor']
    }
    if (!this.config.local && !this.config.noGCPLogging) {
     service.logging = {
        driver: 'gcplogs',
        options: {
          'gcp-project': PROJECT_ID,
          'gcp-log-cmd': 'true',
          'labels': `type=cadvisor`
        }
      }
    }
    return service
  }

  generateGrafanaService (outputFolder, volumes, configs) {
    const service = {
      image: 'grafana/grafana',
      // command: ['--config.file=/etc/prometheus/prometheus.yml'],
      ports: ['3001:3000'],
      depends_on: ['prometheus'],
      networks: {
        testnet: {
          aliases: [`grafana`]
        }
      },
      environment: {
        GF_SECURITY_ADMIN_USER: 'admin',
        GF_SECURITY_ADMIN_PASSWORD: 'admin1234',
        GF_AUTH_ANONYMOUS_ENABLED: 'True',
        GF_AUTH_ANONYMOUS_ORG_NAME: 'Main Org.',
        GF_AUTH_ANONYMOUS_ORG_ROLE: 'Viewer',
      },
      deploy: {
        placement: {
          constraints: ['node.role == manager']
        }
      },
      restart: 'unless-stopped',
      volumes: ['grafana1:/var/lib/grafana'],
      configs: [{
        source: 'grafanaDrsc',
        target: '/etc/grafana/provisioning/datasources/datasources.yml'
      }, {
        source: 'grafanaDashboards',
        target: '/etc/grafana/provisioning/dashboards/dashboards.yml'
      }, {
        source: 'grafanaDashboards1',
        target: '/var/lib/grafana/dashboards/1.json'
      }, {
        source: 'grafanaDashboards2',
        target: '/var/lib/grafana/dashboards/2.json'
      }, {
        source: 'grafanaDashboards3',
        target: '/var/lib/grafana/dashboards/3.json'
      }, {
        source: 'grafanaDashboards4',
        target: '/var/lib/grafana/dashboards/4.json'
      }, {
        source: 'grafanaDashboards5',
        target: '/var/lib/grafana/dashboards/5.json'
      }]
    }
    if (!this.config.local && !this.config.noGCPLogging) {
     service.logging = {
        driver: 'gcplogs',
        options: {
          'gcp-project': PROJECT_ID,
          'gcp-log-cmd': 'true',
          'labels': `type=prometheus`
        }
      }
    }
    volumes.grafana1 = {}
    configs.grafanaDrsc = {
      file: './grafanaDatasources.yml'
    }
    configs.grafanaDashboards = {
      file: './grafanaDashboards.yml'
    }
    configs.grafanaDashboards1 = {
      file: './3662.json'
    }
    configs.grafanaDashboards2 = {
      file: './179.json'
    }
    configs.grafanaDashboards3 = {
      file: './1860c.json'
    }
    configs.grafanaDashboards4 = {
      file: './livepeer_overview.json'
    }
    configs.grafanaDashboards5 = {
      file: './goprocesses.json'
    }
    // curl --fail --compressed https://grafana.com/api/dashboards/{{ item.dashboard_id }}/revisions/{{ item.revision_id }}/download -o /tmp/dashboards/{{ item.dashboard_id }}.json
    // curl https://grafana.com/api/dashboards/3662/revisions/2/download -o 3662.json
    // curl https://grafana.com/api/dashboards/4271/revisions/4/download -o 4271.json
    // curl https://grafana.com/api/dashboards/179/revisions/7/download -o 179.json
    // curl https://grafana.com/api/dashboards/1860/revisions/13/download -o 1860.json
    /*
    - dashboard_id: '3662' # Prometheus 2.0 overview
      revision_id: '2'
      datasource: '{{ grafana_datasources.0.name }}'
    - dashboard_id: '4271' # Docker and system monitoring
      revision_id: '4' # One requirement is to start a docker containers with a label named 'namespace'.
      datasource: '{{ grafana_datasources.0.name }}'
      // 893 - # Docker and system monitoring - original - bad
      // 179 - # Docker and Host Monitoring w/ Prometheus
      // 1860 -# Node Exporter Full
    */

    this.saveYaml(outputFolder, 'grafanaDatasources.yml', mConfigs.grafanaDatasources(this.config.metrics))
    this.saveYaml(outputFolder, 'grafanaDashboards.yml', mConfigs.grafanaDashboards)
    this.copyFileToOut('templates/grafana', outputFolder, '3662.json')
    this.copyFileToOut('templates/grafana', outputFolder, '4271.json')
    this.copyFileToOut('templates/grafana', outputFolder, '179.json')
    this.copyFileToOut('templates/grafana', outputFolder, '1860c.json')
    this.copyFileToOut('templates/grafana', outputFolder, 'livepeer_overview.json')
    this.copyFileToOut('templates/grafana', outputFolder, 'goprocesses.json')
    return service
  }

  copyFileToOut(srcFolder, outputFolder, name) {
    const srcPath = path.resolve(__dirname, srcFolder)
    fs.copyFileSync(path.join(srcPath, name), path.join(outputFolder, name))
  }

  _getZoneFromConfig () {
    return this.config.machines && this.config.machines.zone || 'us-east1-b'
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
      },
      restart: 'unless-stopped',
      labels: {
        zone: this._getZoneFromConfig()
      }
    }

    if (!this.config.local && !this.config.noGCPLogging) {
      gethService.logging = {
        driver: 'gcplogs',
        options: {
          'gcp-project': PROJECT_ID,
          'gcp-log-cmd': 'true',
          'labels': `type=geth,node=geth`
        }
      }
    }
    if (!this.config.local) {
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

    return needToCreateGeth(this.config) ? gethService : undefined
  }

  getNodeOptions (gname, nodes, i) {
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

    if (this.hasMetrics) {
      output.push('-monitor=true')
    }

    // if (nodeType === 'orchestrator') {
    //   output.push('-initializeRound=true')
    // }
    let nodeType = this.config.nodes[gname].type || gname

    switch (nodeType) {
      case 'transcoder':
        // output.push('-orchAddr', `https://orchestrator_${i}:8935`)
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
      case 'orchestrator':
        if (this.config.nodes[gname].orchSecret) {
          output.push('-orchSecret', this.config.nodes[gname].orchSecret)
        }
        output.push('-orchestrator')
        output.push('-serviceAddr')
        output.push(this._getHostnameForService(gname, i) + ':8935')
        break
      case 'broadcaster':
        output.push('-broadcaster')
        if (!this.config.hasGeth) {
          let orchs = this._getHostsByType('orchestrator')
          if (orchs.length) {
            output.push('-orchAddr')
            output.push(orchs.join(','))
          }
        }
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
  /*
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
      if (err) return cb(err)
      console.log('stdout: ', stdout)
      console.log('stderr: ', stderr)
      cb(null, stdout)
    })
  }
  */
}

let usedPorts = [8545, 8546, 30303, 8080, 3000, 3001, 9090]
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
