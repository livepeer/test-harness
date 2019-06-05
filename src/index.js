'use strict'

const path = require('path')
const chalk = require('chalk')
const { exec } = require('child_process')
const { each, eachLimit, timesLimit, filter, map } = require('async')
const dockercompose = require('docker-compose')

const NetworkCreator = require('./networkcreator')
const Swarm = require('./swarm')
const Api = require('./api')
const utils = require('./utils/helpers')
const { wait, getNames, parseComposeAndGetAddresses } = require('./utils/helpers')
const { prettyPrintDeploymentInfo } = require('./helpers')

const DIST_DIR = '../dist'
const DEFAULT_MACHINES = 5
// const getOName = new RegExp('.*\/(orchestrator_\\d+):')

const deprecatedMachinesProps = ['orchestartorsMachines', 'broadcastersMachines', 'num']
const mandatoyMachinesProps = ['orchestratorMachineType', 'managerMachineType', 'broadcasterMachineType']

function configHasInstancesOfType(config, type) {
  for (let groupName of Object.keys(config.nodes)) {
    const node = config.nodes[groupName]
    if (node.type === type && node.instances) {
      return true
    }
  }
  return false
}

class TestHarness {
  constructor () {
    this.swarm = new Swarm()
    this.distDir = path.resolve(__dirname, DIST_DIR)
  }

  restartService (serviceName, cb) {
    console.log(`TestHarness.restartService ${serviceName}`)
    if (this._config.local) {
      return dockercompose.restartOne(serviceName, {
        cwd: path.join(this.distDir, this._config.name),
        log: true
      }).then(r => {
        if (cb) {
          cb(null, r)
        }
        return r
      })
    } else {
      return this.swarm.restartService(serviceName, cb)
    }
  }

  AlreadyExists (name, cb) {
    exec(`docker-machine ls -q --filter "name=${name}-([a-z]+)"`, (err, output) => {
      if (err) throw err
      if (output && output.length > 0) {
        console.log(`${name} machines already exists`)
        cb(null, true)
      } else {
        cb(null)
      }
    })
  }

  getDockerComposePath(config) {
    return path.join(this.distDir, DIST_DIR, config.name, 'docker-compose.yml')
  }


  /*
  onReady (config, cb) {
    if (config.local) {

    } else {
      const parsedCompose = parseComposeAndGetAddresses(config.name)
      eachLimit(parsedCompose.addresses, 5, (address, cb) => {
        utils.fundRemoteAccount(config.name, address, '1000', `livepeer_geth`, cb)
      }, (err) => {
        if (err) throw err
        // todo: add check if funding really got through
        console.log('funding secured!!')
        this.swarm.getPubIP(`${config.name}-manager`, (err, pubIP) => {
          if (err) throw err
          setTimeout(() => {
            cb(null, {
              parsedCompose,
              baseUrl: pubIP,
              config: config
            })
          }, 10000)
        })
      })
    }
  }
  */

  run (config, cb) {
    // 1. [ ] validate the configurations
    // 2. [x] provision GCP machines
    // 3. scp docker-compose.yml, livepeer binary and git test-harness
    // 4. create throwaway docker registry
    // 5. initiate swarm, add workers
    // 6. build lpnode with lp binary, push it to registry
    // 7. deploy geth-with-protocol, fund accounts.
    // 8. deploy lpnodes
    // 9. setup transcoders/orchestrators
    // 10. setup broadcasters.
    // 11. initializeRound.
    // 12. start streams.
    // 13. pipe logs to bucket or download them.
    // 14. teardown the cluster.
    // 15. callback.
    if (!config.name) {
      console.log(chalk.red('Config name not specified.'))
      process.exit(3)
    }
    config.name = config.name || 'testharness'
    // config.isNewConfig = !!(config.machines||{}).orchestartorsMachines
    config.isNewConfig = true
    this.swarm = new Swarm(config.name)

    this._config = config
    if (config.localBuild && config.publicImage) {
      console.log(chalk.red('Should specify either localBuild or publicImage'))
      process.exit(2)
    }
    if (!config.local) {
      let failed = false
      if (!config.machines) {
        console.log(`Config to be run in cloud should specify ${chalk.yellowBright('machines')} section.`)
        process.exit(3)
      }
      for (let prop in config.machines) {
        if (deprecatedMachinesProps.includes(prop)) {
          failed = true
          console.log(`Property ${chalk.red(prop)} is deprecated.`)
        }
      }
      if (failed) {
        console.log('Please remove deprecated properties.')
        process.exit(3)
      }
      if (config.machines.machineType) {
        console.log(`Property ${chalk.yellowBright('machineType')} is deprecated, please change to ${chalk.yellowBright('orchestratorMachineType')}`)
        process.exit(3)
      }
      for (let prop of mandatoyMachinesProps) {
        if (!config.machines.hasOwnProperty(prop)) {
          failed = true
          console.log(`Property ${chalk.yellowBright(prop)} is mandatory.`)
        }
      }
      if (failed) {
        console.log('Please specify mandatory properties.')
        process.exit(3)
      }
      if (configHasInstancesOfType(config, 'transcoder') && !config.machines.transcoderMachineType) {
        console.log(`Should specify ${chalk.yellowBright('transcoderMachineType')}.`)
        process.exit(3)
      }
      if (configHasInstancesOfType(config, 'streamer') && !config.machines.streamerMachineType) {
        console.log(`Should specify ${chalk.yellowBright('streamerMachineType')}.`)
        process.exit(3)
      }
    }
    for (let groupName of Object.keys(config.nodes)) {
      if (!config.nodes[groupName].type) {
        console.log(chalk.red('Every node should specify `type`'))
        process.exit(4)
      }
    }
    if (config.metrics && !config.local) {
      config.noGCPLogging = true
    }
    if (config.prometheus || config.loki) {
      // `prometheus` is deprecated, this is for compatibility with old configs
      config.metrics = true
    }

    // prettyPrintDeploymentInfo(config)
    // return
    let o2t = this.assignTranscoders2Orchs(config)
    config.o2t = o2t
    this.networkCreator = new NetworkCreator(config)
    this.networkCreator.generateComposeFile(`${DIST_DIR}/${config.name}`, (err) => {
      if (err) return handleError(err)

      // process.exit(9)
      if (config.local) {
        this.runLocal(config)
          .then(r => cb(null, r))
          .catch(cb)
      } else {
        this.runSwarm(config)
          .then(r => cb(null, r))
          .catch(cb)
      }
    })
  }

  async runLocal(config) {
    // copy binaries
    // build lpnode:latest
    // run geth:pm
    // 420 funding secured
    // run the lpnodes
    // profit.
    await this.networkCreator.loadBinaries(`../containers/lpnode/binaries`)
    await this.networkCreator.buildLpImage()
    let logs = await dockercompose.upOne(`geth`, {
      cwd: path.resolve(__dirname, `${DIST_DIR}/${config.name}`),
      log: true
    })
    console.warn('docker-compose warning: ', logs.err)
    console.log('geth is up...', logs.out)
    await wait(5000)
    const parsedCompose = parseComposeAndGetAddresses(config.name)

    await Promise.all(parsedCompose.addresses.map(address => {
      return utils.fundAccount(address, '1', `${config.name}_geth_1`)
    }))
    console.log('funding secured!!')
    logs = await dockercompose.upAll({
      cwd: path.resolve(__dirname, `${DIST_DIR}/${config.name}`),
      log: true
    })
    console.warn('docker-compose warning: >>>', logs.err, "<<<")
    if ((logs.err+'').includes('Encountered errors while bringing up the project')) {
      process.exit(11)
    }
    console.log('all lpnodes are up: ', logs.out)
    // console.log('waiting 10s')
    this.api = new Api(parsedCompose)
    await wait(10000)
    const experiment = {
      parsedCompose,
      baseUrl: '',
      config
    }
    await this.setupEnd(config, experiment)
    return experiment
  }

  async runSwarm(config) {
    // copy binaries to the manager instance.
    // I have a slow connection . so i'm not uploading the binary for testing.
    // TODO UNCOMMENT THIS BEFORE MERGE
    // this.networkCreator.loadBinaries(`${DIST_DIR}/${config.name}`, (err) => {
    //   if (err) throw err
    // })
    config.machines = config.machines || {
      num: DEFAULT_MACHINES,
      zone: 'us-east1-b',
      machineType: 'n1-standard-2'
    }

    config.machines.tags = `${config.name}-cluster`

    console.log('machines config', config.machines)

    if (config.localBuild) {
      await this.networkCreator.buildLocalLpImage()
    }

    if (config.livepeerBinaryPath) {
        // copy the binary to the experiment payload folder
      await this.networkCreator.compressAndCopyBinaries(`${DIST_DIR}/${config.name}`)
    }

    const notCreatedNow = await this.swarm.createSwarm(config)
    // result = {internalIp, token, networkId}
    console.log('swarm created')
    if (!notCreatedNow) {
      await this.swarm.createRegistry()
    }
    if (config.metrics) {
      const ri = await this.swarm.getRunningMachinesList(config.name)
      console.log(`running machines: "${ri}"`)
      ri.sort()
      const workersIPS = await Promise.all(ri.map(wn => this.swarm.getPubIP(wn)))
      console.log(`ips:`, workersIPS)
      this.networkCreator.machinesCreated(workersIPS)
    }

    // if (err) throw err
    // if (err) console.log('create registry error : ', err)
    let experiment
    if (config.localBuild || config.publicImage) {
      experiment = await this.finishSetup(config)
    } else {
      experiment = await this.setupManager(config)
    }
    return await this.setupEnd(config, experiment)
  }

  async setupEnd(config, experiment) {
    this.api = new Api(experiment.parsedCompose, experiment.baseUrl)
    let setupSuccess = false

    if (config.standardSetup) {
      setupSuccess =  await this.standardSetup(config)
    }

    await prettyPrintDeploymentInfo(experiment.parsedCompose)
    if (config.standardSetup && !setupSuccess) {
      console.log(chalk.red('Configuration was not successful, please check logs!'))
    }
    return experiment
  }

  assignBroadcasters2Orchs (config) {
    const orchs = this.getTypeCountAndNames('orchestrator', config)
    const broads = this.getTypeCountAndNames('broadcaster', config)

    let broadNames = broads.matchedNames
    let numOrchs = orchs.count
    const res = {}
    // const bnames = Array.from({length: numBroad}, (_, i) => `broadcaster_${i}`)
    let bnames = []
    let onames = []
    for (let i = 0; i < broadNames.length; i++) {
      bnames = bnames.concat(Array.from({length: config.nodes[broadNames[i]].instances}, (_, j) => `${broadNames[i]}_${j}`))
    }
    for (let i = 0; i < orchs.matchedNames.length; i++ ){
      let count = config.nodes[orchs.matchedNames[i]].instances
      let groupNames = Array.from({length: count}, (_, j) => `${orchs.matchedNames[i]}_${j}`)
      onames = onames.concat(groupNames)
    }

    for (let i = 0, oi = 0; i < bnames.length; i++) {
      const oname = `${onames[oi]}`
      if (!res[oname]) {
        res[oname] = []
      }
      res[oname].push(bnames[i])
      oi = ++oi % numOrchs
    }
    console.log('assignBroadcasters2Orchs: ', res)
    return res
  }

  assignTranscoders2Orchs (config) {
    const orchs = this.getTypeCountAndNames('orchestrator', config)
    const transcoders = this.getTypeCountAndNames('transcoder', config)

    let transcoderNames = transcoders.matchedNames
    let numOrchs = orchs.count
    const res = {}
    const tres = {}
    // const bnames = Array.from({length: numBroad}, (_, i) => `broadcaster_${i}`)
    let tnames = []
    let onames = []
    for (let i = 0; i < transcoderNames.length; i++) {
      tnames = tnames.concat(Array.from({length: config.nodes[transcoderNames[i]].instances}, (_, j) => `${transcoderNames[i]}_${j}`))
    }

    for (let i = 0; i < orchs.matchedNames.length; i++) {
      let count = config.nodes[orchs.matchedNames[i]].instances
      let groupNames = Array.from({length: count}, (_, j) => `${orchs.matchedNames[i]}_${j}`)
      onames = onames.concat(groupNames)
    }

    for (let i = 0, oi = 0; i < tnames.length; i++) {
      const oname = `${onames[oi]}`
      if (!res[oname]) {
        res[oname] = []
      }
      res[oname].push(tnames[i])
      tres[tnames[i]] = oname
      oi = ++oi % numOrchs
    }
    console.log('assignTranscoders2Orchs: ', tres)
    return tres
  }

  /**
   * get the number of lp nodes and their group names based on type
   * @param  {string} type   the type of livepeer node ['broadcaster', 'orchestrator', 'transcoder']
   * @param  {Object} config the configuration object
   * @return {int, array}        returns a count and an array of matched group names.
   */
  getTypeCountAndNames (type, config) {
    let count = 0
    let matchedNames = []
    let groupNames = Object.keys(config.nodes)
    console.log('groupNames, ', groupNames)
    if (!groupNames) {
      return { count, matchedNames }
    }

    groupNames.forEach((name, i) => {
      if (config.nodes[name].type === type) {
        console.log('got group ', name)
        count += config.nodes[name].instances
        matchedNames.push(name)
      }
    })
    console.log('matchedNames ', matchedNames)
    console.log({ count, matchedNames, type })
    return { count, matchedNames, type }
  }

  async standardSetup (config) {
      let setupSuccess = true
      let broads = this.getTypeCountAndNames('broadcaster', config)
      console.log('numBroad', broads.count)
      console.log('broadNames', broads.matchedNames)
      let broadNames = broads.matchedNames
      let bnames = []
      for (let i = 0; i < broadNames.length; i++) {
        bnames = bnames.concat(Array.from({length: config.nodes[broadNames[i]].instances}, (_, j) => `${broadNames[i]}_${j}`))
      }
      console.log(`bnames:`, bnames)

      let onames = []
      let tnames = []

      let orchs = this.getTypeCountAndNames('orchestrator', config)
      let transcoders = this.getTypeCountAndNames('transcoder', config)
      let broadcasters = this.getTypeCountAndNames('broadcaster', config)
      for (let i=0; i < orchs.matchedNames.length ;i++) {
        let count = config.nodes[orchs.matchedNames[i]].instances
        let groupNames = Array.from({length: count}, (_, j) => `${orchs.matchedNames[i]}_${j}`)
        onames = onames.concat(groupNames)
      }

      for (let i=0; i < transcoders.matchedNames.length ;i++) {
        let count = config.nodes[transcoders.matchedNames[i]].instances
        let groupNames = Array.from({length: count}, (_, j) => `${transcoders.matchedNames[i]}_${j}`)
        tnames = tnames.concat(groupNames)
      }


      // const bnames = Array.from({length: config.nodes.broadcasters.instances}, (_, i) => `broadcaster_${i}`)
      const orchConf = {
        blockRewardCut: '10',
        feeShare: '5',
        pricePerSegment: '1',
        amount: '500'
      }

      let tr = 0
      while (true) {
        if (tr++ > 12) {
          console.log(chalk.red(`Tried to request token ${tr} times, giving up.`))
          return false
        }
        try {
          console.log('requesting tokens')
          // await this.api.requestTokens(['all'])
          await this.api.requestTokens(['orchestrators'])
          await this.api.requestTokens(['broadcasters'])
        } catch(e) {
          console.log(e)
          await wait(2000)
          continue
        }
        break
      }
      console.log('Depositing....')
      // await this.api.fundDepositAndReserve(['all'], '5000000000', '500000000000000000')
      // await this.api.fundDepositAndReserve(['orchestrators'], '1', '2')
      // await this.api.fundDeposit(['broadcasters'], '1')
      console.log('Initialize round...', onames)
      await this.api.initializeRound([`${onames[0]}`])
      await wait(2000)
      await this.api.fundDepositAndReserve(['broadcasters'], '1', '2')
      // check if deposit was successful
      tr = 0
      while (true) {
        let succeed = 0
        for (let i = 0; i < bnames.length; i++) {
          const senderInfo = await this.api.getSenderInfo(bnames[i])
          if (senderInfo.Deposit) {
            succeed++
          }
        }
        if (succeed == bnames.length) {
          break
        }
        if (tr++ > 12) {
          console.log(chalk.red('Deposit was unsuccessful!'))
          setupSuccess = false
          break
        }
      }
      await this.api.fundDepositAndReserve(['broadcasters'], '1', '2')
      console.log('Initialize round...', onames)
      await this.api.initializeRound([`${onames[0]}`])
      console.log('activating orchestrators...')
      // await wait(2000)
      // await this.api.activateOrchestrator(['orchestrators'], orchConf)
      // bond

      // await Promise.all(onames.map(n => this.restartService(n)))
      // console.log(`restarted ${onames.length} orchestrators`)
      // await Promise.all(bnames.map(n => this.restartService(n)))
      // console.log(`restarted ${bnames.length} broadcasters`)
      await this.api.waitTillAlive(`${orchs.matchedNames[0]}_0`)
      let orchsList = await this.api.getOrchestratorsList(`${orchs.matchedNames[0]}_0`)
      console.log(`orchsList:`, orchsList)
      tr = 0
      while (orchsList.length < onames.length-0) {
        await wait(2000, true)
        const activatedOrchs = orchsList.map(r => {
            const isNull = (!r.serviceURI || r.serviceURI === 'null')
            // const match = getOName.exec(r.ServiceURI)
            if (!isNull) {
              return r.serviceURI
            }
        })
        const toActivate = onames.filter(name => !activatedOrchs.includes(name))

        try {
          console.log(`Calling activateOrchestrator ${toActivate}, ${orchConf} `)
          await this.api.activateOrchestrator(toActivate, orchConf)
        } catch(e) {
          console.log(e)
          continue
        }

       /*
       let bad = false
       for (let name of toActivate) {
         try {
            await this.api.activateOrchestrator([name], orchConf)
            let orchsList = await this.api.getOrchestratorsList(name)
            // console.log(orchsList)
         } catch(e) {
           console.log(e)
           bad = true
           break
         }
       }
       if (bad) {
         continue
       }
       */
        // const reactivated = []
        // for (let i = 0; i < onames.length-0; i++) {
        //   if (!activatedOrchs.includes(onames[i])) {
        //     try {
        //     await this.api.activateOrchestrator([onames[i]], orchConf)
        //     reactivated.push(onames[i])
        //     } catch(e) {
        //       console.log(e)
        //     }
        //   }
        // }
        // if (reactivated.length == 0) {
        //   continue
        // }
        // await Promise.all(onames.map(n => this.restartService(n)))
        // await Promise.all(reactivated.map(n => this.restartService(n)))
        console.log(`standardSetup toActivate: ${toActivate}`)
        await Promise.all(toActivate.map(n => this.restartService(n)))
        // await this.api.waitTillAlive('orchestrator_0')
        await this.api.waitTillAlive(toActivate[0])
        // orchsList = await this.api.getOrchestratorsList('orchestrator_0')
        orchsList = await this.api.getOrchestratorsList(toActivate[0])
        tr++
        if (tr++ > 12) {
          console.log(chalk.red('After 10 tries archestrators still not activated, giving up!'))
          return false
        }
      }
      console.log(`standardsetup restart bnames: ${bnames}`)
      await Promise.all(bnames.map(n => this.restartService(n)))
      await this.api.waitTillAlive(`${broadcasters.matchedNames[0]}_0`)
      const o2b = this.assignBroadcasters2Orchs(config)
      for (let i = 0; i < 10; i++) {
        try {
          await Promise.all(Object.keys(o2b).map(oname => this.api.bond(o2b[oname], '5000', oname)))
        } catch(e) {
          console.log(e)
          continue
        }
        break
      }
      console.log(`standardsetup restart bnames 2: ${bnames}`)
      await Promise.all(bnames.map(n => this.restartService(n)))
      await Promise.all(tnames.map(n => this.restartService(n)))
      await this.api.waitTillAlive(`${broadcasters.matchedNames[0]}_0`)
      return setupSuccess
  }

  setupManager(config) {
    return new Promise((resolve, reject) => {
      this.swarm.setupManager(config, (err, output) => {
        if (err) {
          reject(err)
          throw err
        }
        //
        // deploy the stack.
        utils.remotelyExec(
          `${config.name}-manager`,
          config.machines.zone,
          `cd /tmp/config && sudo docker stack deploy -c docker-compose.yml livepeer`,
          (err, outputBuf) => {
            if (err) {
              reject(err)
              throw err
            }
            console.log('stack deployed ', (outputBuf) ? outputBuf.toString() : outputBuf)
            this.fundAccounts(config).then(resolve, reject)
          }
        )
      })
    })
  }

  async finishSetup(config) {
    const configName = config.name
    console.log('== finish setup ' + configName)
    const managerName = `${configName}-manager`
    // await this.networkCreator.buildLocalLpImage()
    let locTag = ''
    if (config.localBuild) {
      await this.saveLocalDockerImage()
      const loadToWorkers = [this.loadLocalDockerImageToSwarm(managerName)]
      /*
      for (let i = 0; i < config.machines.num - 1; i++) {
        const workerName = `${configName}-worker-${ i+1 }`
        loadToWorkers.push(this.loadLocalDockerImageToSwarm(workerName))
      }
      */
      await Promise.all(loadToWorkers)
      locTag = `sudo docker tag lpnode:latest localhost:5000/lpnode:latest && sudo docker push localhost:5000/lpnode:latest `
      await utils.remotelyExec(managerName, config.machines.zone, locTag)
    }

    /*
    await utils.remotelyExec(managerName, config.machines.zone,
       locTag + `sudo docker pull darkdragon/test-streamer:latest &&
       sudo docker tag darkdragon/test-streamer:latest localhost:5000/streamer:latest &&
       sudo docker push localhost:5000/streamer:latest
      `)
    */
    console.log('docker image pushed')
    try {
    await this.swarm.deployComposeFile(this.getDockerComposePath(config), 'livepeer', managerName)
    const results = await this.fundAccounts(config)
    return results
    } catch(e) {
      console.log('Error finishing setup')
      console.error(e)
      process.exit(11)
    }
  }

  async saveLocalDockerImage() {
    return new Promise((resolve, reject) => {
      // exec(`docker save -o /tmp/lpnodeimage.tar lpnode:latest`, (err, stdout) =>
      const cmd = 'docker save  lpnode:latest | gzip -9 > /tmp/lpnodeimage.tar.gz'
      exec(cmd, (err, stdout) => {
        if (err) return reject(err)
        console.log('lpnode image saved')
        resolve()
      })
    })
  }

  async loadLocalDockerImageToSwarm(managerName) {
    let err = null
    for (let i = 0; i < 10; i++) {
      try {
        await this._loadLocalDockerImageToSwarm(managerName)
        return
      } catch(e) {
        console.log(e)
        err = e
      }
    }
    throw err
  }

  async _loadLocalDockerImageToSwarm(managerName) {
    console.log('Loading lpnode docker image into swarm ' + managerName)
    return new Promise((resolve, reject) => {
      this.swarm.setEnv(managerName, (err, env) => {
        if (err) return reject(err)
        exec(`docker load -i /tmp/lpnodeimage.tar.gz`, {env}, (err, stdout) => {
          if (err) return reject(err)
          console.log('lpnode image loaded into swarm ' + managerName)
          resolve()
        })
      })
    })
  }

  async fundAccounts(config) {
    await wait(10000)
    // fund accounts here.
    const parsedCompose = parseComposeAndGetAddresses(config.name)
    // console.log('=========== GOT RESULTS ', parsedCompose)
    await this.fundAccountsList(config, parsedCompose.addresses)
    console.log('funding secured!!')
    const pubIP = await this.swarm.getPubIP(`${config.name}-manager`)
    await wait(10000)
    return {
      parsedCompose,
      config,
      baseUrl: pubIP
    }
  }

  fundAccountsList(config, addresses) {
    return new Promise((resolve, reject) => {
      eachLimit(addresses, 10, (address, cb) => {
        utils.fundRemoteAccount(config, address, '1', `livepeer_geth`, cb)
      }, (err) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }
}

function handleError (err) {
  // TODO handle errors gracefully
  throw err
}

module.exports = TestHarness
