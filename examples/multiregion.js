'use strict'

const TestHarness = require('../src/index')
let th = new TestHarness()

th.run({
  local: false,
  localBuild: true,
  standardSetup: true, // request token, register orchestartors, etc...
  metrics: true,
  name: 'mregion', // specify unique config name here
  email: null, // email to send alerts to
  livepeerBinaryPath: null, // this will use the livepeer binary in the GCP bucket.
  discordUserId: null, // id of Discord user to send alert from Prometheus to (use `Copy ID` on profile to get)
                       // should be string
  blockchain: {
    name: 'lpTestNet',
    networkId: 54321,
    controllerAddress: '0x77A0865438f2EfD65667362D4a8937537CA7a5EF',
  },
  machines: {
    // total VM instances number
    num: 6,
    orchestartorsMachines: 3,
    broadcastersMachines: 1,
    // zone: 'europe-west3-c',
    zone: 'us-east1-b',
    zones: ['us-east1-b', 'europe-west3-c', 'asia-east2-b'],
    // machineType: 'n1-highcpu-2',
    machineType: 'n1-highcpu-4',
    // machineType: 'n1-highmem-4',
    // managerMachineType: 'n1-standard-2'
    managerMachineType: 'n1-standard-1',
    // managerMachineType: 'n1-highmem-2'
    // managerMachineType: 'n1-highcpu-2',
    // machineType: 'n1-standard-2'
    broadcasterMachineType: 'n1-highcpu-4',
    // streamerMachineType: 'n1-standard-2'
    streamerMachineType: 'n1-highcpu-4'
  },
  nodes: {
    transcoders: {
      // how many containers to run as transcoders.
      instances: 0,
      // these are the livepeer binary flags, add them as you wish.
      // the test-harness overrides flags that has to do with directories or
      // ip/port bindings, these are automated.
      type: 'transcoder',
      flags: '-v 5 -orchSecret=deepsecret'
    },
    orchestrators: {
      instances: 3,
      // TODO these are not complete, try adding the right orchestrator flags :)
      type: 'orchestrator',
      flags: `-v 5 -initializeRound=true -gasPrice 20 -gasLimit 20000000 \
      -currentManifest=true  -orchSecret=deepsecret -maxSessions 4 -transcoder`
    },
    broadcasters: {
      // googleStorage: {
      //   bucket: 'lptest-fran',
      //   key: 'examples/test-harness-226018-e3a05729b733.json'
      // },
      type: 'broadcaster',
      instances: 2,
      flags: `-v 5 -gasPrice 20 -gasLimit 20000000  -currentManifest=true`
    }
  }
}, (err, experiment) => {
  if (err) throw err
  console.log('done!')
})
