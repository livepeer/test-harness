'use strict'

const { EventEmitter } = require('events')
const { exec, spawn } = require('child_process')
const path = require('path')
const tar = require('tar')
const fs = require('fs')
const toml = require('toml')
const composefile = require('composefile')
const { timesLimit, each, eachLimit } = require('async')
const log = require('debug')('livepeer:test-harness:network')
const Pool = require('threads').Pool
const { getNames, spread, getServiceConstraints } = require('./utils/helpers')
const { PROJECT_ID } = require('./constants')
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
    this.hasPrometheus = false
    if (config.local) {

    } else {
      const workers = getNames(`${config.name}-worker-`, config.machines.num-1, 1)
      const n = config.nodes
      this._serviceConstraints = 
        config.machines.orchestartorsMachines ?
          this.getServiceConstraintsNew(config) :
          getServiceConstraints(workers, n.broadcasters.instances, n.orchestrators.instances, n.transcoders.instances)
    }
  }

  getServiceConstraintsNew (config) {
    const workers = getNames(`${config.name}-worker-`, config.machines.num-1, 1)
    const n = config.nodes
    const bcs = config.machines.orchestartorsMachines
    const sts = bcs + config.machines.broadcastersMachines
    const broadcasters = getNames('broadcaster_', n.broadcasters.instances)
    const orchestrators = getNames('orchestrator_', n.orchestrators.instances)
    const transcoders = getNames('transcoder_', n.transcoders.instances)
    const res = {
      orchestrator: spread(orchestrators, workers.slice(0, bcs), true),
      transcoder: spread(transcoders, workers.slice(0, bcs), true),
      broadcaster: spread(broadcasters, workers.slice(bcs, sts), true),
    }
    return res
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
      deps.push('metrics')
    }
    if (this.hasPrometheus) {
      deps.push('prometheus')
    }
    if (type === 'transcoder') {
      deps.push(`orchestrator_${i}`)
    }
    return deps
  }

  _generateService (type, i, volumes, cb) {
    const serviceName = `${type}_${i}`
    const nodes = this.config.nodes[`${type}s`]
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
      command: this.getNodeOptions(type, nodes, i),
      depends_on: this.getDependencies(type, i),
      networks: {
        testnet: {
          aliases: [serviceName]
        }
      },
      restart: 'unless-stopped',
      volumes: [vname + ':/root/.lpData']
    }
    volumes[vname] = {}
    if (nodes.googleStorage) {
      generated.secrets = [nodes.googleStorage.secretName]
    }

    if (this.config.local) {

    } else {
      if (!this.config.noGCPLogging) {
        generated.logging = {
          driver: 'gcplogs',
          options: {
            'gcp-project': PROJECT_ID,
            'gcp-log-cmd': 'true',
            'labels': `type=${type},node=${type}_${i}`
          }
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
      generated.environment = envObj
      cb(null, generated)
    })
  }

  generateServices (outputFolder, cb) {
    const output = {}
    const volumes = {}
    const configs = {}

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
    if (this.config.prometheus) {
      // output.prometheus = this.generatePrometheusService(outputFolder, volumes, configs)
      output.cadvisor = this.generateCAdvisorService(volumes)
      output.grafana = this.generateGrafanaService(outputFolder, volumes, configs)
      output['node-exporter'] = this.generateNodeExporterService(volumes)
      this.hasPrometheus = true
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
      output.prometheus = this.generatePrometheusService(outputFolder, Object.keys(output), volumes, configs)
      cb(null, output, volumes, configs)
    })
  }

  generatePrometheusService (outputFolder, servicesNames, volumes, configs) {
    const service = {
      image: 'prom/prometheus:latest',
      command: ['--config.file=/etc/prometheus/prometheus.yml'],
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
    const servicesToMonitor = servicesNames.filter(sn => {
      return sn.startsWith('orchestrator') || sn.startsWith('broadcaster') 
      // || sn.startsWith('transcoder') - right now standalone transcoder does not expose CLI port
    })
    this.saveYaml(outputFolder, 'prometheus.yml', mConfigs.prometheus(this.config.local, servicesToMonitor))
    return service
  }

  saveYaml (outputFolder, name, content) {
    // console.log(`===== saving ${name} into ${outputFolder}`)
    // console.log(content)
    fs.writeFileSync(path.join(outputFolder, name), YAML.stringify(content))
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
      file: './1860.json'
    }
    configs.grafanaDashboards4 = {
      file: './livepeer_overview.json'
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

    this.saveYaml(outputFolder, 'grafanaDatasources.yml', mConfigs.grafanaDatasources)
    this.saveYaml(outputFolder, 'grafanaDashboards.yml', mConfigs.grafanaDashboards)
    this.copyFileToOut('templates/grafana', outputFolder, '3662.json')
    this.copyFileToOut('templates/grafana', outputFolder, '4271.json')
    this.copyFileToOut('templates/grafana', outputFolder, '179.json')
    this.copyFileToOut('templates/grafana', outputFolder, '1860.json')
    this.copyFileToOut('templates/grafana', outputFolder, 'livepeer_overview.json')
    return service
  }

  copyFileToOut(srcFolder, outputFolder, name) {
    const srcPath = path.resolve(__dirname, srcFolder)
    fs.copyFileSync(path.join(srcPath, name), path.join(outputFolder, name))
  }

  generateMetricsService () {
    const mService = {
      image: 'darkdragon/livepeermetrics:latest',
      ports: ['3000:3000'],
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
      },
      restart: 'unless-stopped'
    }
    if (!this.config.local && !this.config.noGCPLogging) {
     mService.logging = {
        driver: 'gcplogs',
        options: {
          'gcp-project': PROJECT_ID,
          'gcp-log-cmd': 'true',
          'labels': `type=mongodb`
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
      restart: 'unless-stopped',
      volumes: ['vmongo1:/data/db', 'vmongo2:/data/configdb']
      // networks: ['outside']
    }
    if (!this.config.local && !this.config.noGCPLogging) {
     mService.logging = {
        driver: 'gcplogs',
        options: {
          'gcp-project': PROJECT_ID,
          'gcp-log-cmd': 'true',
          'labels': `type=mongodb`
        }
      }
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
      },
      restart: 'unless-stopped',
      labels: {
        zone: this.config.machines && this.config.machines.zone || 'us-east1-b'
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

  getNodeOptions (nodeType, nodes, i) {
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
      output.push('-monUrl http://metrics:3000/api/events')
    }

    // if (nodeType === 'orchestrator') {
    //   output.push('-initializeRound=true')
    // }
    switch (nodeType) {
      case 'transcoder':
        // output.push('-orchAddr', `https://orchestrator_${i}:8935`)
        output.push('-orchAddr', `orchestrator_${i}:8935`)
        output.push('-transcoder')
        break
      case 'orchestrator':
        output.push('-orchestrator')
        break
      case 'broadcaster':
        output.push('-broadcaster')
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
