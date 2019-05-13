'use strict'

const TestHarness = require('../src/index')
let th = new TestHarness()

th.run({
  local: false,
  localBuild: false,
  publicImage: true, // if true will be used 'livepeer/go-livepeer:edge' or can be set
                     //  to any other publicly available image
  standardSetup: true, // request token, register orchestartors, etc...
  metrics: true,
  loki: true,
  constrainResources: true,
  name: 'y-100streams',
  livepeerBinaryPath: null,
  discordUserId: null, // id of Discord user to send alert from Prometheus to (use `Copy ID` on profile to get)
                       // should be string
  blockchain: {
    name: 'lpTestNet',
    networkId: 54321,
    controllerAddress: '0xA1fe753Fe65002C22dDc7eab29A308f73C7B6982',
  },

  machines: {
    num: 25,
    zone: 'us-east1-b',
    // zone: 'europe-west3-b',
    machineType: 'n1-highcpu-8',
    managerMachineType: 'n1-highmem-2',
    // machineType: 'n1-standard-2'
    orchestartorsMachines: 15,
    broadcastersMachines: 6,
    // zone: 'europe-west3-c',
    broadcasterMachineType: 'n1-highcpu-8',
    // streamerMachineType: 'n1-standard-2'
    streamerMachineType: 'n1-highcpu-8'
  },
  nodes: {
    t_a: {
      type: 'transcoder',
      instances: 0,
      // these are the livepeer binary flags, add them as you wish.
      // the test-harness overrides flags that has to do with directories or
      // ip/port bindings, these are automated.
      flags: '-v 5 -orchSecret=deepsecret'
    },
    o_a: {
      type: 'orchestrator',
      instances: 15,
      orchSecret: 'deepsecret',
      // TODO these are not complete, try adding the right orchestrator flags :)
      flags: `-v 5 -initializeRound=true -gasPrice 20 -gasLimit 20000000 \
      -currentManifest=true  -maxSessions 8 -transcoder`
    },
    b_a: {
      type: 'broadcaster',
      // googleStorage: {
      //   bucket: 'lptest-fran',
      //   key: 'examples/test-harness-226018-e3a05729b733.json'
      // },
      instances: 15,
      flags: `-v 5 -gasPrice 20 -gasLimit 20000000  -currentManifest=true`
    }
  }
}, (err, experiment) => {
  if (err) throw err
  console.log('done!')
})
