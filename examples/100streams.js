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
//
// let bondingArr = []
// for (let i = 0; i < 25; i += 2) {
//   bondingArr.push([range(i, i + 2, 'broadcaster_'), '5000', `orchestrator_${(i%2 === 0) ? i : i - 1}`])
// }
//
// eachLimit(bondingArr, 3, (group, done) => {
//   console.log(group[0], group[1], group[2])
//   done()
// }, (err) => {
//   if (err) throw err
//   console.log('done')
// })

th.run({
  local: false,
  name: 'test100',
  livepeerBinaryPath: null, // this will use the livepeer binary in the GCP bucket.
  blockchain: {
    name: 'lpTestNet',
    networkId: 54321,
    controllerAddress: '0xA1fe753Fe65002C22dDc7eab29A308f73C7B6982',
  },
  machines: {
    num: 20,
    zone: 'us-east1-b',
    machineType: 'n1-standard-2'
  },
  nodes: {
    transcoders: {
      // how many containers to run as transcoders.
      instances: 0,
      // these are the livepeer binary flags, add them as you wish.
      // the test-harness overrides flags that has to do with directories or
      // ip/port bindings, these are automated.
      flags: '--v 4 -transcoder -initializeRound=true -standaloneTranscoder=true \
        -orchAddr https://orchestrator_0:8935 -orchSecret test'
    },
    orchestrators: {
      instances: 25,
      // TODO these are not complete, try adding the right orchestrator flags :)
      flags: `--v 4 -initializeRound=true \
      -gasPrice 200 -gasLimit 2000000 \
      -monitor=false -currentManifest=true -transcoder`
    },
    broadcasters: {
      instances: 50,
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
      let bondingArr = []
      for (let i = 0; i < 25; i += 2) {
        bondingArr.push([range(i, i + 2, 'broadcaster_'), '5000', `orchestrator_${i}`])
      }

      eachLimit(bondingArr, 1, (group, done) => {
        api.bond(group[0], group[1], group[2], done)
      }, next)
    },
    (next) => {
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

function range (start, stop, prefix) {
  let arr = []
  for (let i = start; i < stop; i++) {
    arr.push(`${prefix}${i}`)
  }

  return arr
}
