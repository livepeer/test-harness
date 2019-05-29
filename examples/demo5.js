'use strict'

const TestHarness = require('../src/index')
let th = new TestHarness()

th.run({
  name: '', // specify unique config name here
  discordUserId: null, // id of Discord user to send alert from Prometheus to (use `Copy ID` on profile to get)
                       // should be string

  publicImage: true, // if true will be used 'livepeer/go-livepeer:edge' or can be set
                     //  to any other publicly available image
  local: false,
  localBuild: false,
  standardSetup: true, // request token, register orchestartors, etc...
  email: null, // email to send alerts to
  metrics: true,
  livepeerBinaryPath: null, // this will use the livepeer binary in the GCP bucket.
  // constrainResources: true,
  blockchain: {
    name: 'lpTestNet',
    networkId: 54321,
    controllerAddress: '0xA1fe753Fe65002C22dDc7eab29A308f73C7B6982',
  },
  machines: {
    zone: 'us-east1-b',
    transcoderMachineType: 'n1-standard-2',
    broadcasterMachineType: 'n1-standard-1',
    orchestratorMachineType: 'n1-highcpu-4',
    streamerMachineType: 'n1-standard-1',

    managerMachineType: 'n1-highmem-2'
  },
  nodes: {
    s_a: {
      instances: 1,
      type: 'streamer',
    },
    transcoders: {
      type: 'transcoder',
      // how many containers to run as transcoders.
      instances: 0,
      flags: '-v 5 '
    },
    orchestrators: {
      instances: 2,
      type: 'orchestrator',
      // TODO these are not complete, try adding the right orchestrator flags :)
      flags: `-v 5 -initializeRound=true -gasPrice 20 -gasLimit 20000000 -maxSessions 4 -transcoder`
    },
    broadcasters: {
      type: 'broadcaster',
      // googleStorage: {
      //   bucket: 'lptest-fran',
      //   key: 'examples/test-harness-226018-e3a05729b733.json'
      // },
      instances: 1,
      flags: `-v 5 -gasPrice 20 -gasLimit 20000000  -currentManifest=true`
    }
  }
}, (err, experiment) => {
  if (err) throw err
  console.log('done!')
})
