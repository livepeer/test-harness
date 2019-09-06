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
  name: '', // specify unique config name here
  deployStreamers: true, // creates streamer's instances - one per broadcaster
  email: null, // email to send alerts to
  discordUserId: null, // id of Discord user to send alert from Prometheus to (use `Copy ID` on profile to get)
  livepeerBinaryPath: null, // this will use the livepeer binary in the GCP bucket.
  // constrainResources: true,
  blockchain: {
    name: 'lpTestNet',
    networkId: 54321,
    controllerAddress: '0x77A0865438f2EfD65667362D4a8937537CA7a5EF',
  },
  machines: {
    // zone: 'europe-west3-c',
    zone: 'us-east1-b',
    // machineType: 'n1-highcpu-2',
    machineType: 'n1-highcpu-4',
    // machineType: 'n1-highmem-4',
    // managerMachineType: 'n1-standard-2'
    managerMachineType: 'n1-standard-1',
    // managerMachineType: 'n1-highmem-2'
    // managerMachineType: 'n1-highcpu-2',
    // machineType: 'n1-standard-2'
    broadcasterMachineType: 'n1-standard-1',
    // streamerMachineType: 'n1-standard-2'
    streamerMachineType: 'n1-highcpu-4',
  },
  nodes: {
    t_a: {
      type: 'transcoder',
      instances: 2,
      // these are the livepeer binary flags, add them as you wish.
      // the test-harness overrides flags that has to do with directories or
      // ip/port bindings, these are automated.
      flags: '-v 5'
    },
    t_b: {
      type: 'transcoder',
      instances: 2,
      // these are the livepeer binary flags, add them as you wish.
      // the test-harness overrides flags that has to do with directories or
      // ip/port bindings, these are automated.
      flags: '-v 5'
    },
    o_a: {
      type: 'orchestrator',
      instances: 1,
      orchSecret: 'o1',
      // TODO these are not complete, try adding the right orchestrator flags :)
      flags: `-v 5 -initializeRound=true -gasPrice 20 -gasLimit 20000000 \
      -currentManifest=true -maxSessions 4`
    },
    o_b: {
      type: 'orchestrator',
      instances: 1,
      orchSecret: 'o2',
      // TODO these are not complete, try adding the right orchestrator flags :)
      flags: `-v 5 -initializeRound=true -gasPrice 20 -gasLimit 20000000 \
      -currentManifest=true -maxSessions 4`
    },
    b_a: {
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
