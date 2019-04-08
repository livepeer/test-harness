'use strict'

const TestHarness = require('../src/index')
let th = new TestHarness()

th.run({
  local: false,
  localBuild: false,
  publicImage: true, // if true will be used 'livepeer/go-livepeer:edge' or can be set
                     //  to any other publicly available image
  standardSetup: true, // request token, register orchestartors, etc...
  startMetricsServer: true,
  prometheus: true,
  name: '', // specify unique config name here
  email: null, // email to send alerts to
  livepeerBinaryPath: null, // this will use the livepeer binary in the GCP bucket.
  // constrainResources: true,
  noGCPLogging: false,
  blockchain: {
    name: 'lpTestNet',
    networkId: 54321,
    controllerAddress: '0xA1fe753Fe65002C22dDc7eab29A308f73C7B6982',
  },
  machines: {
    // total VM instances number
    num: 4,
    orchestartorsMachines: 2,
    broadcastersMachines: 1,
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
    transcoders_a: {
      type: 'transcoder',
      instances: 0,
      // these are the livepeer binary flags, add them as you wish.
      // the test-harness overrides flags that has to do with directories or
      // ip/port bindings, these are automated.
      flags: '-v 5 -orchSecret=deepsecret'
    },
    t_group_2: {
      type: 'transcoder',
      instances: 0,
      // these are the livepeer binary flags, add them as you wish.
      // the test-harness overrides flags that has to do with directories or
      // ip/port bindings, these are automated.
      flags: '-v 5 -orchSecret=deepsecret2'
    },
    orchestrators: {
      type: 'orchestrator',
      instances: 2,
      // TODO these are not complete, try adding the right orchestrator flags :)
      flags: `-v 5 -initializeRound=true -gasPrice 20 -gasLimit 20000000 \
      -currentManifest=true  -orchSecret=deepsecret -maxSessions 4 -transcoder`
    },
    orchestrators2: {
      type: 'orchestrator',
      instances: 2,
      // TODO these are not complete, try adding the right orchestrator flags :)
      flags: `-v 5 -initializeRound=true -gasPrice 20 -gasLimit 20000000 \
      -currentManifest=true  -orchSecret=deepsecret2 -maxSessions 4 -transcoder`
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
