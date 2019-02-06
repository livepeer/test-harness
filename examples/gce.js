'use strict'

const Swarm = require('../src/swarm')
const Api = require('../src/api')
const TestHarness = require('../src/index')
let th = new TestHarness()

th.run({
  local: false,
  localBuild: false, // binary will be taken from local image tagged `livepeerbinary:alpine`
  // this image should be built locally using `docker build -t livepeerbinary:alpine -f Dockerfile.alpine .`
  // command in go-livepeer repo
  standardSetup: true, // request token, register orchestartors, etc...
  startMetricsServer: true,
  constrainResources: true,
  name: 'y-gce',
  livepeerBinaryPath: null,
  blockchain: {
    name: 'lpTestNet',
    networkId: 54321,
    controllerAddress: '0xA1fe753Fe65002C22dDc7eab29A308f73C7B6982',
  },
  machines: {
    num: 6,
    zone: 'us-east1-b',
    // zone: 'europe-west3-b',
    machineType: 'n1-highcpu-4',
    managerMachineType: 'n1-highmem-2'
    // machineType: 'n1-standard-2'
  },
  nodes: {
    transcoders: {
      // how many containers to run as transcoders.
      instances: 0,
      // these are the livepeer binary flags, add them as you wish.
      // the test-harness overrides flags that has to do with directories or
      // ip/port bindings, these are automated.
      flags: '-v 5 -transcoder -initializeRound=true -standaloneTranscoder=true \
        -orchAddr https://orchestrator_0:8935 -orchSecret test'
    },
    orchestrators: {
      instances: 4,
      // TODO these are not complete, try adding the right orchestrator flags :)
      flags: `-v 5 -initializeRound=true -gasPrice 200 -gasLimit 2000000 \
      -currentManifest=true -transcoder `
    },
    broadcasters: {
      // uncomment to configure usage of Google Storage
      // googleStorage: {
      //   bucket: 'lptest-fran',
      //   key: 'examples/test-harness-226018-e3a05729b733.json'
      // },
      instances: 4,
      flags: `-v 5 -gasPrice 200 -gasLimit 2000000 \
      -currentManifest=true`
    }
  }
}, (err, experiment) => {
  if (err) throw err
  // console.log('experiment:', experiment)
  console.log('so far so good, manager IP: ', experiment.baseUrl)
  // let api = new Api(experiment.parsedCompose, experiment.baseUrl)
  // const swarm = new Swarm(experiment.config.name)
  console.log('done!')
})
