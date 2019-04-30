'use strict'

const { exec, spawn } = require('child_process')
const Swarm = require('../src/swarm')
const { series, eachLimit, parallel } = require('async')
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
  blockchain: {
    name: 'lpTestNet',
    networkId: 54321,
    controllerAddress: '0xA1fe753Fe65002C22dDc7eab29A308f73C7B6982',
  },
  machines: {
    num: 5,
    zone: 'us-east1-b',
    machineType: 'n1-highcpu-4'
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
      instances: 4,
      // TODO these are not complete, try adding the right orchestrator flags :)
      type: 'orchestrator',
      flags: `--v 99 -initializeRound=true -gasPrice 200 -gasLimit 2000000 \
      -currentManifest=true -orchestrator`
    },
    broadcasters: {
      instances: 12,
      type: 'broadcaster',
      flags: `--v 99 -gasPrice 200 -gasLimit 2000000 \
      -currentManifest=true`
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
      api.fundAndApproveSigners(['all'], '5000000000', '500000000000000000', next)
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
      parallel([
        (done) => {
          api.bond([
            'broadcaster_0', 'broadcaster_1', 'broadcaster_2'
          ], '1000', 'orchestrator_0', done)
        },
        (done) => {
          api.bond([
            'broadcaster_3', 'broadcaster_4', 'broadcaster_5'
          ], '1000', 'orchestrator_1', done)
        },
      ], next)
    },
    (next) => {
      parallel([
        (done) => {
          api.bond([
            'broadcaster_6', 'broadcaster_7', 'broadcaster_8'
          ], '1000', 'orchestrator_2', done)
        },
        (done) => {
          api.bond([
            'broadcaster_9', 'broadcaster_10', 'broadcaster_11'
          ], '1000', 'orchestrator_3', done)
        },
      ], next)
    },
    // (next) => {
    //   api.bond([
    //     'broadcaster_3',
    //     'broadcaster_4',
    //     'broadcaster_5'
    //   ], '5000', 'orchestrator_1', next)
    // },
    (next) => {
      // swarm.restartService('orchestrator_0', (logs) => {
      //   console.log('restarted orchestrator')
      //   next()
      // })

      api._getPortsArray(['orchestrators'], (err, ports) => {
        if (err) throw err
        eachLimit(ports, 3, (port, n) => {
          swarm.restartService(port.name, (logs) => {
            console.log('restarted orchestrator', port.name)
            n()
          })
        }, next)
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
