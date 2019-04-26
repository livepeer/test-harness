'use strict'

const { exec, spawn } = require('child_process')
const Swarm = require('../src/swarm')
const { series, eachLimit, parallel } = require('async')
const Api = require('../src/api')
const TestHarness = require('../src/index')
let th = new TestHarness()

th.run({
  name: 'week5s',
  discordUserId: null, // id of Discord user to send alert from Prometheus to (use `Copy ID` on profile to get)
                       // should be string

  local: false,
  localBuild: false,
  publicImage: true, // if true will be used 'livepeer/go-livepeer:edge' or can be set
                     //  to any other publicly available image
  standardSetup: true, // request token, register orchestartors, etc...
  metrics: true,
  discordUserId: null, // id of Discord user to send alert from Prometheus to (use `Copy ID` on profile to get)
                       // should be string
  // email: 'ivan@livepeer.org', // email to send alerts to
  livepeerBinaryPath: null, // this will use the livepeer binary in the GCP bucket.
  // constrainResources: true,
  blockchain: {
    name: 'lpTestNet',
    networkId: 54321,
    controllerAddress: '0xA1fe753Fe65002C22dDc7eab29A308f73C7B6982',
  },
  machines: {
    // total VM instances number
    num: 5,
    orchestartorsMachines: 2,
    broadcastersMachines: 1,
    zone: 'europe-west3-c',
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
      instances: 2,
      type: 'orchestrator',
      flags: `-v 5 -initializeRound=true -gasPrice 20 -gasLimit 20000000 \
      -currentManifest=true  -orchSecret=deepsecret -maxSessions 4 -transcoder`
    },
    broadcasters: {
      // googleStorage: {
      //   bucket: 'lptest-fran',
      //   key: 'examples/test-harness-226018-e3a05729b733.json'
      // },
      instances: 2,
      type: 'broadcaster',
      flags: `-v 5 -gasPrice 20 -gasLimit 20000000  -currentManifest=true`
    }
  }
}, (err, experiment) => {
  if (err) throw err
  // console.log('experiment:', experiment)
  console.log('so far so good, manager IP: ', experiment.baseUrl)
  // return
  // let api = new Api(experiment.parsedCompose, experiment.baseUrl)
  // const swarm = new Swarm(experiment.config.name)
  console.log('done!')
})
