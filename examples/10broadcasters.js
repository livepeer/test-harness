'use strict'

const { exec, spawn } = require('child_process')
const Swarm = require('../src/swarm')
const { series, eachLimit } = require('async')
const Api = require('../src/api')
const TestHarness = require('../src/index')
let th = new TestHarness()
// const swarm = new Swarm('test321')
// swarm.doesMachineExist('test321-manager-wrong', (err, machine) => {
//   if (err) throw err
//   console.log('machine: ', machine)
//   swarm.isSwarmActive((err, active) => {
//     if (err) throw err
//     console.log('active: ', active)
//   })
// })
// swarm.stopStack('streamer', (err, output) => {
//   swarm.stopStack('livepeer', (err, output) => {
//     if (err) throw err
//     th.provision('test321', (err, machinesArray) => {
//       if (err) throw err
//       console.log('machines cleared and ready for the next experiment')
//     })
//   })
// })

th.run({
  local: false,
  name: 'test321',
  livepeerBinaryPath: null, // this will use the livepeer binary in the GCP bucket.
  metrics: true,
  discordUserId: null, // id of Discord user to send alert from Prometheus to (use `Copy ID` on profile to get)
                       // should be string
  blockchain: {
    name: 'lpTestNet',
    networkId: 54321,
    controllerAddress: '0x77A0865438f2EfD65667362D4a8937537CA7a5EF',
  },
  machines: {
    num: 4,
    zone: 'us-east1-b',
    machineType: 'n1-standard-2'
  },
  nodes: {
    transcoders: {
      // how many containers to run as transcoders.
      instances: 1,
      // these are the livepeer binary flags, add them as you wish.
      // the test-harness overrides flags that has to do with directories or
      // ip/port bindings, these are automated.
      type: 'transcoder',
      flags: '--v 4 -transcoder -initializeRound=true -standaloneTranscoder=true \
        -orchAddr https://orchestrator_0:8935 -orchSecret test'
    },
    orchestrators: {
      instances: 2,
      // TODO these are not complete, try adding the right orchestrator flags :)
      type: 'orchestrator',
      flags: `--v 4 -initializeRound=true \
      -gasPrice 200 -gasLimit 2000000 \
      -monitor=false -currentManifest=true -orchestrator`
    },
    broadcasters: {
      instances: 10,
      type: 'broadcaster',
      flags: `--v 4 \
      -gasPrice 200 -gasLimit 2000000 \
      -monitor=false -currentManifest=true`
    }
  }
}, (err, experiment) => {
  if (err) throw err
  console.log('so far so good, manager IP: ', experiment.baseUrl)
  let api = new Api(experiment.parsedCompose, experiment.baseUrl)
  const swarm = new Swarm(experiment.config.name)

  series([
    (next) => {
      console.log('requesting tokens')
      api.requestTokens(['all'], next)
    },
    (next) => {
      console.log('Depositing....')
      api.fundDepositAndReserve(['all'], '1', '2', next)
    },
    (next) => { api.initializeRound(['orchestrator_0'], next) },
    (next) => {
      console.log('activating orchestrators...')
      api.activateOrchestrator(['orchestrators'], {
        blockRewardCut: '10',
        feeShare: '5',
        pricePerSegment: '1',
        amount: '500'
        // ServiceURI will be set by the test-harness.
      }, next)
    },
    (next) => {
      api.bond([
        'broadcaster_0',
        'broadcaster_1',
        'broadcaster_2'
      ], '5000', 'orchestrator_0', next)
    },
    // (next) => {
    //   api.bond([
    //     'broadcaster_3',
    //     'broadcaster_4',
    //     'broadcaster_5'
    //   ], '5000', 'orchestrator_1', next)
    // },
    (next) => {
      swarm.restartService('orchestrator_0', (logs) => {
        console.log('restarted orchestrator')
        next()
      })
    },
    (next) => {
      api._getPortsArray(['broadcasters'], (err, ports) => {
        if (err) throw err
        eachLimit(ports, 3, (port, n) => {
          swarm.restartService(port.name, (logs) => {
            console.log('restarted broadcaster', port.name)
            n()
          })
        }, next)
      })
    }
  ], (err, results) => {
    if (err) throw err
    console.log('done!')
  })
})
