'use strict'
const path = require('path')
const chalk = require('chalk')
const { exec, spawn } = require('child_process')
const { each, eachLimit, eachOfLimit, timesLimit, parallel } = require('async')
const shortid = require('shortid')
const Api = require('./api')
const { PROJECT_ID, GCE_VM_IMAGE } = require('./constants')
const monitoring = require('@google-cloud/monitoring')
const utils = require('./utils/helpers')
const { wait, parseComposeAndGetAddresses, getConstrain } = require('./utils/helpers')
const DIST_DIR = '../dist'

// assume for a one run we only work with one config
let service2IP = null
let worker1IP = null

class Swarm {
  constructor (name) {
    this._defaults = {
      driver: 'google',
      zone: 'us-east1-b',
      machineType: 'n1-standard-1',
      managerMachineType: 'n1-standard-1',
      tags: 'swarm-cluster',
      projectId: PROJECT_ID,
    }

    this._managerName = `${name}-manager` || null
    this._name = name
    this._machines = null
  }

  createMachines (config, cb) {
    this._updateMachines = config.updateMachines
    this._installNodeExporter = config.installNodeExporter
    this._installGoogleMonitoring = config.installGoogleMonitoring
    const machinesCount = config.machines.num || 3
    const name = config.name || 'testharness-' + shortid.generate()
    const getMachineType = machineName => {
      const cm = config.machines
      if (cm.machine2serviceType.has(machineName)) {
        switch (cm.machine2serviceType.get(machineName)) {
        case 'streamer':
          return cm.streamerMachineType
        case 'broadcaster':
          return cm.broadcasterMachineType
        case 'orchestrator':
          return cm.orchestratorMachineType
        case 'transcoder':
          return cm.transcoderMachineType
        }
      } else {
        return cm.managerMachineType
      }
    }

    if (Array.isArray(config.machines.zones)) {
      let numberOfZones = config.machines.zones.length
      let machinesPerGroup = Math.floor(machinesCount / numberOfZones)
      let groups = {}
      for (let i = 0, j = 0; i < machinesCount - 1; i++) {
        if (!groups[config.machines.zones[j]]) {
          groups[config.machines.zones[j]] = []
        }

        groups[config.machines.zones[j]].push({
          name: `${name}-worker-${i + 1}`,
          zone: config.machines.zones[j],
          machineType: getMachineType(`${name}-worker-${i + 1}`),
          tags: config.machines.tags || `${name}-cluster`
        })

        j = ++j % numberOfZones
      }
      console.log('groups: ', groups)
      parallel([
        (done) => {
          this.createMachine({
            name: `${name}-manager`,
            zone: config.machines.zones[0],
            machineType: config.machines.managerMachineType,
            tags: config.machines.tags || `${name}-cluster`
          }, done)
        },
        (done) => {
          eachOfLimit(groups, 3, (machinesOpts, zone, next) => {
            eachLimit(machinesOpts, 50, (machine, n) => {
              this.createMachine(machine, n)
            }, next)
          }, done)
        }
      ], (err) => {
        if (err) return cb(err)
        this.setupGCEMonitoring(config).then(() => cb(null), cb)
      })
    } else {
      parallel([
        (done) => {
          this.createMachine({
            name: `${name}-manager`,
            zone: config.machines.zone,
            machineType: config.machines.managerMachineType,
            tags: config.machines.tags || `${name}-cluster`
          }, done)
        },
        (done) => {
          timesLimit(machinesCount - 1, 50, (i, next) => {
            // create workers
            const  mName = `${name}-worker-${i + 1}`
            this.createMachine({
              name: mName,
              zone: config.machines.zone,
              machineType: getMachineType(mName),
              tags: config.machines.tags || `${name}-cluster`
            }, next)
          }, done)
        }
      ], (err) => {
        if (err) return cb(err)
        this.setupGCEMonitoring(config).then(() => cb(null), cb)
      })
    }
  }

  async setupGCEMonitoring(config) {
    const zone = config.machines.zone || this._defaults.zone
    const parsedCompose = parseComposeAndGetAddresses(config.name)

    // const client = new monitoring.MetricServiceClient()
    const gc = new monitoring.v3.GroupServiceClient({projectId: PROJECT_ID})
    const formattedName = gc.projectPath(PROJECT_ID);
    // console.log('Formatted name:', formattedName)
    const [groups] = await gc.listGroups({name: formattedName})
    // console.log('====== groups:', groups)
    // const group = await gc.getGroup({name: formattedName})
    // console.log('====== group:', group)
    if (!groups.find(g => g.displayName === config.name)) {
      const cgreq = {
        name: formattedName,
        group: {
          displayName: config.name,
          filter: `resource.metadata.name=starts_with("${config.name}-")`
        },
      }
      const [resp] = await gc.createGroup(cgreq)
      // console.log(`Group ${config.name} created:`, resp)
      console.log(`Group ${config.name} created:`)
    } else {
      console.log(`Group ${config.name} already exists.`)
    }
    const api = new Api(parsedCompose)
    // const oPorts = await api.getPortsArray(['all'])
    const oPorts = await api.getPortsArray(['orchestrators'])
    const tPorts = await api.getPortsArray(['transcoders'])
    const bPorts = await api.getPortsArray(['broadcasters'])
    const allPorts = oPorts.concat(bPorts).concat(tPorts)
    // console.log(allPorts)
    const ucClient = new monitoring.v3.UptimeCheckServiceClient()
    const [checks] = await ucClient.listUptimeCheckConfigs({parent: formattedName})
    // console.log('uptime chekcs:', JSON.stringify(checks, null, 2))
    const servicesNames = Object.keys(parsedCompose.services).filter(sn => {
      return sn.startsWith('transcoder') || sn.startsWith('orchestrator') || sn.startsWith('broadcaster') || sn === 'geth'
    })
    // console.log(servicesNames)
    for (let sn of servicesNames) {
      const isGeth = sn === 'geth'
      const ip = await Swarm.getPublicIPOfService(parsedCompose, sn)
      const [po] = allPorts.filter(o => o.name === sn)
      console.log(`ip of ${sn} is ${ip} cli port: ${po && po['7935']}, isGeth: ${isGeth}`)
      const checkName = `${config.name}-${sn} status`
      if (checks.find(c => c.displayName === checkName)) {
        // console.log(`Uptime check '${checkName} already exists.`)
        continue
      }
      const port = isGeth ? 8545 : +po['7935']
      const contentMatchers = isGeth ? undefined : [{ content: 'Manifests' }]
      const [upResp] = await ucClient.createUptimeCheckConfig({
        parent: formattedName,
        uptimeCheckConfig: {
          displayName: checkName,
          monitoredResource: {
            labels: {
              project_id: PROJECT_ID,
              host: ip
            },
            type: 'uptime_url'
          },
          httpCheck: {
            useSsl: false,
            path: '/status',
            port
          },
          period: {
            seconds: '300',
            nanos: 0
          },
          contentMatchers,
      }})
      // console.log(`Uptime check for service ${sn} created:`, upResp)
    }
    let nc = null
    if (config.email) {
      // configure aler policies
      const ncClient = new monitoring.v3.NotificationChannelServiceClient()
      const displayName = config.name + '-alerts'
      const [channels] = await ncClient.listNotificationChannels({name: formattedName})
      console.log('Existing notification channels:', channels)
      nc = channels.find(c => c.displayName === displayName)
      if (!nc) {
        [nc] = await ncClient.createNotificationChannel({
          name: formattedName,
          notificationChannel: {
            type: 'email',
            displayName,
            labels: { email_address: config.email },
            userLabels: {
              config: config.name
            }
          }
        })
        console.log('Notification channel created:', nc)
      }
    }
    const apClient = new monitoring.v3.AlertPolicyServiceClient()
    const [alertPolicies] = await apClient.listAlertPolicies({name: formattedName})
    // console.log('Existing alert policies:', JSON.stringify(alertPolicies, null, 2))
    const [checks2] = await ucClient.listUptimeCheckConfigs({parent: formattedName})
    // console.log(`Existing checks:`, JSON.stringify(checks2, null, 2))
    // return
    const chunked = chunk(servicesNames, 6)
    for (let i = 0; i < chunked.length; i++) {
      const apDisplayName = config.name + '-alert-group-' + i
      if (!alertPolicies.find(ap => ap.displayName === apDisplayName)) {
        const ch = chunked[i]
        const alertPolicy = {
          displayName: apDisplayName,
          userLabels: {
            config: config.name
          },
          combiner: 'OR',
          conditions: ch.map(sn => {
            const checkDisplayName = `${config.name}-${sn} status`
            const ch = checks2.find(c => c.displayName === checkDisplayName)
            if (!ch) {
              throw 'Can\t find check for ' + checkDisplayName
            }
            const chnp = ch.name.split('/')
            const checkName = chnp[chnp.length-1]
            return {
              displayName: `${sn} not responding`,
              conditionThreshold: {
                aggregations: [
                  {
                    groupByFields: ['resource.*'],
                    alignmentPeriod: {
                      seconds: '1200',
                      nanos: 0
                    },
                    perSeriesAligner: 'ALIGN_NEXT_OLDER',
                    crossSeriesReducer: 'REDUCE_COUNT_FALSE'
                  }
                ],
                denominatorAggregations: [],
                filter: `metric.type="monitoring.googleapis.com/uptime_check/check_passed" resource.type="uptime_url" metric.label."check_id"="${checkName}"`,
                comparison: "COMPARISON_GT",
                thresholdValue: 1,
                duration: {
                  seconds: '180',
                  nanos: 0
                },
                trigger: {
                  count: 1,
                  type: 'count'
                },
                denominatorFilter: ''
              },
              condition: 'conditionThreshold'
            }
          })
        }
        if (nc) {
          alertPolicy.notificationChannels = [nc.name]
        }
        const [ap] = await apClient.createAlertPolicy({
          name: formattedName,
          alertPolicy
        })
        // console.log('Created alert policy', JSON.stringify(ap, null, 2))
      }
    }
    // await utils.remotelyExec(
    //   machine,
    //   zone,
    //   `sudo curl -sSO https://dl.google.com/cloudagents/install-monitoring-agent.sh && sudo bash install-monitoring-agent.sh`
    // )
  }

  async teardownGCEMonitoring(config) {
    const gc = new monitoring.v3.GroupServiceClient({projectId: PROJECT_ID})
    const formattedName = gc.projectPath(PROJECT_ID);
    // console.log('Formatted name:', formattedName)
    const [groups] = await gc.listGroups({name: formattedName})
    // console.log('====== groups:', groups)
    for (let group of groups) {
      if (group.displayName === config.name) {
        await gc.deleteGroup({name: group.name})
        console.log(`Groupd ${group.name} deleted.`)
      }
    }
    const apClient = new monitoring.v3.AlertPolicyServiceClient()
    const [alertPolicies] = await apClient.listAlertPolicies({name: formattedName})
    // console.log('Existing alert policies:', JSON.stringify(alertPolicies, null, 2))
    for (let policy of alertPolicies) {
      const apDisplayName = config.name + '-alert-group-'
      if (policy.displayName.startsWith(apDisplayName)) {
        await apClient.deleteAlertPolicy({name: policy.name})
        console.log(`Alert policy ${policy.name} deleted.`)
      }
    }
    const ucClient = new monitoring.v3.UptimeCheckServiceClient()
    const [checks] = await ucClient.listUptimeCheckConfigs({parent: formattedName})
    for (let check of checks) {
      if (check.displayName.startsWith(config.name + '-')) {
        await ucClient.deleteUptimeCheckConfig({name: check.name})
        console.log(`Uptime check ${check.name} deleted.`)
      }
    }
    if (config.email) {
      // configure aler policies
      const ncClient = new monitoring.v3.NotificationChannelServiceClient()
      const displayName = config.name + '-alerts'
      const [channels] = await ncClient.listNotificationChannels({name: formattedName})
      // console.log('Existing notification channels:', channels)
      const nc = channels.find(c => c.displayName === displayName)
      if (nc) {
        await ncClient.deleteNotificationChannel({name: nc.name, force: true})
        console.log(`Notification channel ${nc.name} deleted.`)
      }
    }
  }

  async deleteAllStackDriverChecks (config) {
    console.log('deleting unused checks.')
    const reserved = ['shareddemo']
    const gc = new monitoring.v3.GroupServiceClient({projectId: PROJECT_ID})
    const formattedName = gc.projectPath(PROJECT_ID)
    // console.log('Formatted name:', formattedName)
    const [groups] = await gc.listGroups({name: formattedName})
    // console.log('====== groups:', groups)
    for (let group of groups) {
      if (reserved.indexOf(group.displayName) === -1) {
        await gc.deleteGroup({name: group.name})
        console.log(`Groupd ${group.name} deleted.`)
      }
    }
    const apClient = new monitoring.v3.AlertPolicyServiceClient()
    const [alertPolicies] = await apClient.listAlertPolicies({name: formattedName})
    // console.log('Existing alert policies:', JSON.stringify(alertPolicies, null, 2))
    for (let policy of alertPolicies) {
      if (policy.displayName.startsWith(`shareddemo`)) {
      } else {
        await apClient.deleteAlertPolicy({name: policy.name})
        console.log(`Alert policy ${policy.name} deleted.`)
      }
    }
    const ucClient = new monitoring.v3.UptimeCheckServiceClient()
    const [checks] = await ucClient.listUptimeCheckConfigs({parent: formattedName})
    for (let check of checks) {
      if (check.displayName.startsWith(`shareddemo`)) {
      } else {
        await ucClient.deleteUptimeCheckConfig({name: check.name})
        console.log(`Uptime check ${check.name} deleted.`)
      }
    }
    if (config.email) {
      // configure aler policies
      const ncClient = new monitoring.v3.NotificationChannelServiceClient()
      const displayName = config.name + '-alerts'
      const [channels] = await ncClient.listNotificationChannels({name: formattedName})
      // console.log('Existing notification channels:', channels)
      const nc = channels.find(c => c.displayName === displayName)
      if (nc) {
        await ncClient.deleteNotificationChannel({name: nc.name, force: true})
        console.log(`Notification channel ${nc.name} deleted.`)
      }
    }
  }

  createMachine (opts, cb) {
    const zone = opts.zone || this._defaults.zone
    let driver = opts.driver || this._defaults.driver
    // TODO sanitize user opts here
    // exec(`docker-machine create ${opts.name} \
    //   --driver ${driver} \
    //   --${driver}-zone ${opts.zone || this._defaults.zone} \
    //   --${driver}-machine-type ${opts.machineType || this._defaults.machineType} \
    //   --${driver}-tags ${opts.tags || this._defaults.tags} \
    //   --${driver}-project ${this._defaults.projectId}`, cb)

    let args = [
      'create',
      opts.name,
      '--driver',
      driver,
      `--${driver}-zone`,
      zone,
      `--${driver}-machine-type`,
      opts.machineType || this._defaults.machineType,
      `--${driver}-tags`,
      opts.tags || this._defaults.tags,
      `--${driver}-project`,
      this._defaults.projectId,
      `--${driver}-machine-image`,
      GCE_VM_IMAGE
    ]

    console.log('running docker-machine ', args.join(' '))
    let builder = spawn('docker-machine', args)
    let stderr = ''

    builder.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`)
    })

    builder.stderr.on('data', (data) => {
      console.log(`stderr: ${data}`)
      stderr = data.toString()
    })

    builder.on('close', (code) => {
      console.log(`[createMachine] child process exited with code ${code}`)
      if (code !== 0 && !stderr.match(/already exists/g) ) {
        return cb(`[createMachine err] child process exited with code ${code}`)
      }
      this.setupMachine(opts.name, zone).then(() => cb(null)).catch(cb)
    })
  }

  async setupMachine(machine, zone) {
    if (this._installGoogleMonitoring) {
      await utils.remotelyExec(machine, zone,
        `sudo curl -sSO https://dl.google.com/cloudagents/install-monitoring-agent.sh && sudo bash install-monitoring-agent.sh`
      )
    }
    if (this._updateMachines) {
      await utils.remotelyExec(machine, zone, `sudo apt-get update && sudo apt-get upgrade -y`)
      console.log(`=============== apt updated`)
    }
    if (this._installNodeExporter) {
      await utils.remotelyExec(machine, zone,
        `sudo apt-get install -y python3-pip && sudo apt autoremove -y && \
        sudo pip3 install ansible && \
        ansible-galaxy install cloudalchemy.node-exporter && \
        cat <<-SHELL_SCREENRC > $HOME/nodepb.yml
  - hosts: 127.0.0.1
    connection: local
    become: yes
    roles:
      - cloudalchemy.node-exporter
SHELL_SCREENRC`
      )
      await utils.remotelyExec(machine, zone, 'sudo ansible-playbook  nodepb.yml')
    }
  }

  async setupMachine2(machine, zone) {
    await utils.remotelyExec(machine, zone,
       `cat <<-SHELL_SCREENRC > $HOME/nodepb.yml
- hosts: 127.0.0.1
  connection: local
  become: yes
  roles:
    - cloudalchemy.node-exporter
SHELL_SCREENRC`
    )
  }

  createNetwork (networkName, name, cb) {
    this.setEnv(this._managerName, (err, env) => {
      console.log('env before network: ', env)
      if (err) return cb(err)
      exec(`docker network create -d overlay --subnet=10.0.0.0/16 --gateway=10.0.0.1 ${networkName}`, {
        env: env
      }, (err, output) => {
        if (err) console.error('create network err: ', err)
        this.openExternalAccess(name, cb)
      })
    })
  }

  scp (origin, destination, opts, cb) {
    return new Promise((resolve, reject) => {
      exec(`docker-machine scp ${opts} ${origin} ${destination}`, (err, res) => {
        if (err) {
          reject(err)
        } else {
          resolve(res)
        }
        if (cb) {
          cb(err, res)
        }
      })
    })
  }

  getPubIP (machineName, cb) {
    // console.log(`getPubIP(${machineName})`)
    return new Promise((resolve, reject) => {
      exec(`docker-machine ip ${machineName}`, (err, ip) => {
        if (err) {
          reject(err)
        } else {
          resolve(ip.trim())
        }
        if (cb) {
          cb(err, ip.trim())
        }
      })
    })
  }

  getInternalIP (machineName, cb) {
    // Reference https://stackoverflow.com/a/38950953/2159869
    // gcloud Resource keys https://cloud.google.com/sdk/gcloud/reference/topic/resource-keys
    exec(`gcloud --format="value(networkInterfaces[0].networkIP)" \
      compute instances list --filter="name:(${machineName})"`, cb)
  }

  getMachineStatus (machineName, cb) {
    // TODO check if the machineName is on the list first or not.
    exec(`docker-machine status ${machineName}`, cb)
    // sudo docker service ps -q -f name=th_lp_broadcaster_0 -f desired-state=running th_lp_broadcaster_0
  }

  setEnv (machineName, cb) {
    exec(`docker-machine env ${machineName}`, (err, stdout) => {
      // if (err) throw err
      if (err) {
        console.error(err, `\nRetrying setEnv ${machineName}`)
        this.setEnv(machineName, cb)
      } else {
        // get all the values in the double quotes
        // example env output
        // export DOCKER_TLS_VERIFY="1"
        // export DOCKER_HOST="tcp://12.345.678.90:2376"
        // export DOCKER_CERT_PATH="/machine/machines/swarm-manager"
        // export DOCKER_MACHINE_NAME="swarm-manager"
        // # Run this command to configure your shell:
        // # eval $(docker-machine env swarm-manager)

        let parsed = stdout.match(/(["'])(?:(?=(\\?))\2.)*?\1/g)
        if (parsed.length !== 4) {
          throw new Error('env parsing mismatch!')
        }
        let env = {
          DOCKER_TLS_VERIFY: parsed[0].substr(1,parsed[0].length -2),
          DOCKER_HOST: parsed[1].substr(1, parsed[1].length-2),
          DOCKER_CERT_PATH: parsed[2].substr(1, parsed[2].length-2),
          DOCKER_MACHINE_NAME: parsed[3].substr(1, parsed[3].length-2)
        }

        cb(null, env)
      }
    })
  }

  unsetEnv (cb) {
    exec(`. $(docker-machine env --unset)`, cb)
  }

  getMachinesToCreateNames (config) {
    const res = [`${config.name}-manager`]
    for (let i = 1; i < config.machines.num; i++) {
      res.push(`${config.name}-worker-${i}`)
    }
    res.sort()
    return res
  }

  async createSwarm (config) {
    const runninMachines = await this.getRunningMachinesList(config.name)
    console.log(`running machines:`, runninMachines)
    if (runninMachines.length) {
      runninMachines.sort()
      const machinesToCreate = this.getMachinesToCreateNames(config)
      console.log(`machines to create:`, machinesToCreate)
      if (runninMachines.length === machinesToCreate.length &&
        runninMachines.reduce((ac, cv, ci) => ac && (cv === machinesToCreate[ci]), true)
      ) {
        console.log(`Found already running machines: ${runninMachines}`)
        console.log(`not removing them. If you want to remove them, run`)
        console.log(chalk.inverse(`docker-machine rm -y -f ${runninMachines.join(' ')}`))
        try {
          await this.stopStack('livepeer')
          await this.stopStack('streamer')
        } catch (e) {
          if (e) console.log('stopping stack error ', e)
        }

        while (true) {
          await wait(1000) // need to wait while instances gets shutdown
          try {
            await this.pruneLocalVolumes(config.name)
          } catch (e) {
          }
          const volumes = await this.getVolumes(config.name + '-manager')
          if (volumes.filter(n => n.startsWith('livepeer_')).length === 0) {
            break
          }
        }
        return true
      } else {
        await this.tearDown(config.name)
      }
    }
    await this.createSwarmCreateMachines(config)
    return false
  }

  createSwarmCreateMachines (config) {
    return new Promise((resolve, reject) => {
      // createMachines
      this.createMachines(config, (err) => {
        if (err) throw err
        // init the swarm.
        this.init(`${config.name}-manager`, (err, stdout) => {
          if (err) throw err
          // get the swarm-token and the manager's ip.
          // create the docker network.
          parallel({
            token: (next) => {
              this.getSwarmToken(`${config.name}-manager`, next)
            },
            internalIP: (next) => {
              this.getInternalIP(`${config.name}-manager`, next)
            },
            networkId: (next) => {
              this.createNetwork(`testnet`, config.name, next)
            }
          }, (err, result) => {
            if (err) throw err
            console.log('result: ', result)
            console.log(`adding ${config.machines.num - 1} workers to the swarm, token ${result.token[0]}, ip: ${result.internalIP[0]}`)
            timesLimit(
              config.machines.num - 1,
              5,
              (i, next) => {
                this.join(`${config.name}-worker-${i + 1}`, result.token[0].trim(), result.internalIP[0].trim(), next)
                /*
                this.join(`${config.name}-worker-${i + 1}`, result.token[0].trim(), result.internalIP[0].trim(), (err, output) => {
                  if (err) throw err
                  if (config.localBuild) {
                    next()
                    return
                  }
                  utils.remotelyExec(
                    `${config.name}-worker-${i + 1}`,
                    config.machines.zone,
                    `mkdir -p /tmp/assets`,
                    (err, output) => {
                      if (err) throw err
                      this.rsync(
                        `${config.name}-worker-${i + 1}`,
                        config.machines.zone,
                        `gs://lp_testharness_assets`,
                        `/tmp/assets`,
                        next
                      )
                    })
                })
                */
              }, (err, results) => {
                if (err) throw err
                resolve({
                  token: result.token[0].trim(),
                  internalIP: result.internalIP[0].trim()
                })
              })
          })
        })
      })
    })
  }

  init (managerName, cb) {
    this.setEnv(managerName, (err, env) => {
      if (err) throw err
      console.log('env before init: ', env)
      exec(`docker swarm init`, {
        env: env
      }, (err, stdout) => {
        if (err) return cb(err)
        setTimeout(() => {
          cb(null, stdout)
        }, 1)
      })
    })
  }

  getSwarmToken (managerName, cb) {
    this.setEnv(managerName, (err, env) => {
      if (err) throw err
      // type can be either manager or worker
      // right now this defaults to worker
      exec(`docker swarm join-token -q worker`, {env: env}, cb)
    })
  }

  join (machineName, token, managerIP, cb) {
    this.setEnv(machineName, (err, env) => {
      if (err) throw err
      // TODO get the managers internal IP automatically.
      console.log(`adding ${machineName}..`, env, managerIP)
      console.log(`docker swarm join --token ${token} ${managerIP}:2377`)
      exec(`docker swarm join --token ${token} ${managerIP}:2377`, {env: env}, cb)
    })
  }

  deployComposeFile (filePath, prefix, managerName, cb) {
    return new Promise((resolve, reject) => {
      this.setEnv(managerName, (err, env) => {
        if (err) {
          reject(err)
          cb(err)
        }
        console.log(`running docker stack deploy on ${managerName} (using ${filePath})`)
        let builder = spawn('docker', ['stack', 'deploy', '--compose-file', filePath, prefix], {env: {...process.env, ...env}})
        let stdout = ''
        let stderr = ''

        builder.stdout.on('data', (data) => {
          console.log(data.toString().trimEnd())
          stdout += data.toString()
        })

        builder.stderr.on('data', (data) => {
          if (data && data.toString()) {
            console.log(chalk.yellow(data.toString().trimEnd()))
            stderr += data.toString()
          }
        })
        builder.on('error', (err) => {
          console.error(chalk.red(err))
        })

        builder.on('close', (code) => {
          console.log(`child process exited with code ${code}`)
          if (code !== 0 && !stderr.match(/already exists/g) ) {
            return reject(`child process exited with code ${code}`)
          }
          resolve({stdout, stderr})
        })

        /*
        exec(`docker stack deploy --compose-file ${filePath} ${prefix}`, {env: env}, (e, stdout, stderr) => {
          if (cb) cb(e, stdout, stderr)
          if (e) {
            reject(e)
          } else {
            resolve({stdout, stderr})
          }
        })
        */
      })
    })
  }

  stopStack (stackName, cb) {
    console.log(`Stopping stack ${stackName} on ${this._managerName}`)
    return new Promise((resolve, reject) => {
      this.setEnv(this._managerName, (err, env) => {
        if (err) throw err
        const cmd = `docker stack rm ${stackName}`
        console.log('running:', cmd)
        exec(cmd, {env: env}, (e, r) => {
          if (e) {
            console.log(e)
            reject(e)
          } else {
            console.log(r)
            resolve(r)
          }
          if (cb) {
            cb(e, r)
          }
          /*
          if (e) {
            console.log('Error removing stack:', e)
            reject(e)
            if (cb) cb(e, r)
            return
          }
          console.log(r)
          console.log('running "docker volume prune -f"')
          console.log(env)
          exec('docker volume prune -f', {env}, (e, r) => {
            if (e) {
              console.log(e)
              reject(e)
            } else {
              console.log(r)
              resolve(r)
            }
            if (cb) {
              cb(e, r)
            }
          })
          */
        })
      })
    })
  }

  async getVolumes (machineName) {
    const v = await this._runDocker(machineName, 'volume ls -q')
    return v.trim().split('\n')
  }

  async pruneLocalVolumes (name) {
    const rm = await this.getRunningMachinesList(name)
    for (let mn of rm) {
      const conts = await this._runDocker(mn, 'ps -f "status=exited" -q')
      console.log(conts)
      if (conts.trim()) {
        await this._runDocker(mn, `rm -f ${conts.trim().split('\n').join(' ')}`)
      }
      await wait(100)
      const out2 = await this._runDocker(mn, 'volume prune -f')
      console.log(out2)
    }
  }

  async _runDocker(machineName, args) {
    return new Promise((resolve, reject) => {
      this.setEnv(machineName, (err, env) => {
        if (err) {
          reject(err)
          throw err
        }
        const cmd = 'docker ' + args
        exec(cmd, {env}, (err, r) => {
          err ? reject(err) : resolve(r)
        })
      })
    })
  }

  /**
   * 
   * @param {string} serviceName Name of service of which to save logs
   * @param {string} managerName Name of manager VM
   * @param {number} stdioFd File descriptor of file to which save STDIO of logs
   * @param {number} stderrFd File descriptor of file to which save STDERR of logs:w
   */
  saveLogs (serviceName, managerName, stdioFd, stderrFd) {
    return new Promise((resolve, reject) => {
      this.setEnv(managerName, (err, denv) => {
        if (err) {
          reject(err)
        } else {
          const env = {...process.env, ...denv}
          const subprocess = spawn(`docker`, ['service', 'logs', serviceName], {env, stdio: [ 'ignore', stdioFd, stderrFd ]})
          subprocess.on('error', (err) => {
            reject(err)
          })
          subprocess.on('close', (code) => {
            if (code) {
              reject(code)
            } else {
              resolve()
            }
          })
        }
      })
    })
  }

  getLogs (serviceName, managerName) {
    return new Promise((resolve, reject) => {
      this.setEnv(managerName, (err, env) => {
        if (err) {
          reject(err)
        } else {
          exec(`docker service logs ${serviceName}`, {env}, (err, stdout, stderr) => {
            if (err) {
              reject(err)
            } else {
              resolve({stdout, stderr})
            }
          })
        }
      })
    })
  }

  createRegistry () {
    return new Promise((resolve, reject) => {
      this.setEnv(this._managerName, (err, env) => {
        if (err) {
          reject(err)
          throw err
        }
        exec(`docker service create --name registry --network testnet --publish published=5000,target=5000 registry:2`,
          {env: env}, err => {
            if (err) {
              reject(err)
            } else (
              resolve()
            )
          })
      })
    })
  }

  rsync (machine, zone, bucket, path, cb) {
    utils.remotelyExec(
      machine,
      zone,
      `sudo gsutil rsync ${bucket} ${path}`,
      cb
    )
  }

  openExternalAccess (name, cb) {
    exec(`gcloud compute firewall-rules create ${name}-swarm \
    --allow tcp \
    --description "open tcp ports for the test-harness" \
    --target-tags ${name}-cluster`, (err, output) => {
      if (err) console.log('firewall Error ', err)
      cb(null, output)
    })
  }

  restartService (serviceName, cb) {
    console.log(`swarm.restartService ${serviceName}`)
    return new Promise((resolve, reject) => {
      this.setEnv(this._managerName, (err, env) => {
        if (err) {
          reject(err)
          throw err
        }
        exec(`docker service scale livepeer_${serviceName}=0`, {env}, (err, output) => {
          if (err) {
            reject(err)
            throw err
          }
          exec(`docker service scale livepeer_${serviceName}=1`, {env}, (err, out) => {
            if (err) {
              reject(err)
            } else {
              resolve(out)
            }
            if (cb) {
              cb(err, out)
            }
          })
        })
      })
    })
  }

  restartServices (services, cb) {
    console.log(`swarm.restartServices ${services}`)
    this.setEnv(this._managerName, (err, env) => {
      if (err) throw err
      eachLimit(services, 3, (serviceName, next) => {
        exec(`docker service scale livepeer_${serviceName}=0`, {env}, (err, output) => {
          if (err) throw err
          exec(`docker service scale livepeer_${serviceName}=1`, {env}, next)
        })
      }, cb)
    })
  }

  isSwarmActive (cb) {
    this.setEnv(this._managerName, (err, env) => {
      if (err) throw err
      exec(`docker node ls -q`, {env}, (err, output) => {
        if (err) return cb(null, false)
        console.log('isSwarmActive: ', output)
        cb(null, true)
      })
    })
  }

  doesMachineExist (machineName, cb) {
    exec(`gcloud compute instances list --quiet --format=json --filter="name:${machineName}"`, (err, output) => {
      if (err) throw err
      console.log(typeof output)
      let jsoned = null
      try {
        jsoned = JSON.parse(output)
      } catch (e) {
        throw e
      }
      if (jsoned && jsoned.length > 0) {
        cb(null, jsoned[0])
      } else {
        cb(null)
      }
    })
  }

  setupManager (config, cb) {
    const name = config.name
    const zone = config.machines.zone
    exec(`cp -r ./scripts/* ${path.resolve(__dirname, `${DIST_DIR}/${name}`)}`, (err, stdout) => {
      if (err) throw err
      console.log('manager_setup.sh copied')
      parallel({
        upload: (done) => {
          this.scp(
            path.resolve(__dirname, `${DIST_DIR}/${name}/`),
            `${name}-manager:/tmp`,
            `-r`,
            done)
        },
        mkdir: (done) => {
          utils.remotelyExec(
            `${name}-manager`,
            zone,
            `mkdir -p /tmp/assets`,
            done)
        }
      }, (err, result) => {
        if (err) throw err
        this.rsync(
          `${name}-manager`,
          zone,
          `gs://lp_testharness_assets`,
          `/tmp/assets`,
          (err) => {
            if (err) throw err
            utils.remotelyExec(
              `${name}-manager`,
              zone,
              `cd /tmp && \
               sudo rm -r -f config && \
               sudo mv ${name} config && \
               sudo chown $USER:$USER -R config && \
               cd /tmp/config && \
               /bin/sh manager_setup.sh ${(config.livepeerBinaryPath) ? 'binary' : null} && /bin/sh create_streamer_image.sh`,
              cb)
          }
        )
      })
    })
  }

  updateStack (cb) {
    // 1. remove old stack.
    // 2. update docker-compose.yml.
    // 3. deploy new stack.
    // 4. profit.
    this.stopStack(`livepeer`, (err, resp) => {
      // if (err) throw err
      if (err) console.log('livepeer stack is not there.')
      cb()
    })
  }

  tearDown (name, cb) {
    return new Promise((resolve, reject) => {
      exec(`docker-machine ls -q --filter "name=${name}-([a-z]+)"`, (err, output) => {
        if (err) throw err
        if (!output) {
          resolve(null)
          if (cb) {
            cb(null)
          }
          return
        }

        output = output.trim().split('\n')
        console.log('machines to reprovision', output)
        each(output, (machine, next) => {
          if (!machine) {
            return next()
          }
          exec(`docker-machine rm -y ${machine}`, next)
        }, (e, r) => {
          if (e) {
            reject(e)
          } else {
            resolve(r)
          }
          if (cb) {
            cb(e, r)
          }
        })
      })
    })
  }

  getRunningMachinesList(name) {
    return new Promise((resolve, reject) => {
      if (this._machines) {
        resolve(this._machines)
      } else {
        const cmd = `docker-machine ls -q --filter "name=${name}-([a-z]+)" -filter "state=Running"`
        // console.log(cmd)
        exec(cmd, (err, output) => {
          if (err) {
            reject(err)
          } else {
            const tr = output.trim()
            const machines = tr ? tr.split('\n') : []
            // console.log('found running machines: ', machines)
            this._machines = machines
            resolve(this._machines)
          }
        })
      }
    })
  }

  static async getManagerIP(configName) {
    const swarm = new Swarm(configName)
    // const ri = await swarm.getRunningMachinesList(configName)
    // console.log(`running machines: "${ri}"`)
    const ip = await swarm.getPubIP(`${configName}-manager`)
    return ip
  }

  static async getPublicIPOfService (parsedCompose, serviceName) {
    const configName = parsedCompose.configName
    if (!service2IP) {
      const swarm = new Swarm(configName)
      const ri = await swarm.getRunningMachinesList(configName)
      console.log(`running machines: "${ri}"`)
      ri.sort()
      // ri.splice(0, 1)
      let workersIPS
      try {
        workersIPS = await Promise.all(ri.map(wn => swarm.getPubIP(wn)))
      } catch (e) {
        console.log('getPublicIPOfService Error: ', e)
      }
      const worker2IP = ri.reduce((a, v, i) => a.set(v, workersIPS[i]), new Map())
      worker1IP = workersIPS[0]
      service2IP = new Map()
      Object.keys(parsedCompose.services).forEach(sn => {
        service2IP.set(sn, worker2IP.get(getConstrain(parsedCompose.services[sn])) || worker1IP)
      })
    }
    return service2IP.get(serviceName)
  }

}

function chunk(arr, n) {
  return Array(Math.ceil(arr.length/n)).fill().map((_,i) => arr.slice(i*n,i*n+n))
}

async function test() {
  const config = {
    name: 'darkswa',
    email: 'ivan@livepeer.org',
    machines: {
      num: 1,
      // zone: 'europe-west3-c',
      zone: 'europe-west3-b',
      machineType: 'n1-standard-1',
    }
  }
  const swarm = new Swarm(config.name)
  // await swarm.setupGCEMonitoring(config)
  // await swarm.teardownGCEMonitoring(config)
  // await swarm.setupMachine('ldark-worker-2', config.machines.zone)
  swarm.createMachine({
    name: 'dark-test',
    zone: config.machines.zone,
    machineType: config.machines.machineType,
    tags: config.machines.tags || `${config.name}-cluster`
  }, (err, res) => {
    console.log('machin created, err:', err)
  })

  return 'done'
}

// test().then(console.log, console.warn)

module.exports = Swarm
