'use strict'

const { series } = require('async')
const TestHarness = require('../src/index')
const Api = require('../src/api')

let th = new TestHarness()

th.run({
  local: true,
  localBuild: true,
  metrics: true,
  discordUserId: null, // id of Discord user to send alert from Prometheus to (use `Copy ID` on profile to get)
  standardSetup: true, // request token, register orchestartors, etc...
  name: 'test123',
  email: null, // email to send alerts to
  blockchain: {
    // keep these to run a private testnet.
    name: 'lpTestNet',
    networkId: 54321,
    controllerAddress: '0x77A0865438f2EfD65667362D4a8937537CA7a5EF', // streamflow
    faucet: true,
    txFiller: true,
    minGasPrice: '10',
    maxGasPrice: '1000'
  },
  nodes: {
    streamers: {
      instances: 1,
      type: 'streamer',
    },
    
    transcoders: {
      // how many containers to run as transcoders.
      instances: 0,
      // these are the livepeer binary flags, add them as you wish.
      // the test-harness overrides flags that has to do with directories or
      // ip/port bindings, these are automated.
      type: 'transcoder',
      flags: '-v 5 '
    },
    orchestrators: {
      instances: 2,
      orchSecret: 'aapp',
      type: 'orchestrator',
      flags: `-v 99 -initializeRound=true -transcoder\
      -currentManifest=true -maxSessions 8 -pricePerUnit 50000 -blockPollingInterval 1`
    },
    broadcasters: {
      instances: 1,
      type: 'broadcaster',
      flags: `-v 99 -currentManifest=true -transcodingOptions P240p30fps16x9 -blockPollingInterval 1`
    }
  }
}, (err, experiment) => {
  // experiment is a parsed compose file.
  if (err) throw err
  console.log('so far so good')
  return
})