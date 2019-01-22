'use strict'

const { exec, spawn } = require('child_process')
const Swarm = require('../src/swarm')

const swarm = new Swarm({})
//
// swarm.createMachine({
//   name: 'swarm-worker-3',
//   tags: 'swarm-cluster',
//   driver: 'google'
// }, (err) => {
//   if (err) throw err
//
//   console.log(`machine successfully created and provisioned`)
// })
//
//
// exec('gcloud compute ssh swarm-worker-3 --zone us-east1-b && mkdir /tmp/remotedir', (err, stdout) => {
//   if (err) throw err
//   console.log('stdout', stdout)
// })
//
// function remotelyExec (machineName, command, cb) {
//   let args = [
//     'compute',
//     'ssh',
//     machineName,
//     '--zone',
//     'us-east1-b',
//     '--',
//   ]
//
//   args.push(command)
//
//   let builder = spawn('gcloud', args)
//   let output
//
//   builder.stdout.on('data', (data) => {
//     console.log(`stdout: ${data}`)
//     output = data
//   })
//
//   builder.stderr.on('data', (data) => {
//     console.log(`stderr: ${data}`)
//   })
//
//   builder.on('close', (code) => {
//     console.log(`child process exited with code ${code}`)
//     setTimeout(() => { cb(null, output)}, 1)
//   })
// }
//
// remotelyExec('swarm-manager', 'sudo docker service ps -q -f name=th_geth -f desired-state=running th_geth',
// (err, output) => {
//   if (err) throw err
//   console.log('got output: ', output.toString())
//   console.log((output.toString('utf-8').trim() === 'w8ckygsd5sumre51xuqkvlcsc'))
// })

const TestHarness = require('../src/index')
let th = new TestHarness()

th.run({
  local: false,
  name: 'test321',
  livepeerBinaryPath: null, // this will use the livepeer binary in the GCP bucket.
  blockchain: {
    name: 'lpTestNet',
    networkId: 54321,
    controllerAddress: '0xA1fe753Fe65002C22dDc7eab29A308f73C7B6982',
  },
  nodes: {
    transcoders: {
      // how many containers to run as transcoders.
      instances: 1,
      // these are the livepeer binary flags, add them as you wish.
      // the test-harness overrides flags that has to do with directories or
      // ip/port bindings, these are automated.
      flags: '--v 4 -transcoder -initializeRound=true'
    },
    orchestrators: {
      instances: 1,
      // TODO these are not complete, try adding the right orchestrator flags :)
      flags: `--v 4 -initializeRound=true \
      -monitor=false -currentManifest=true -orchestrator`
    },
    broadcasters: {
      instances: 3,
      flags: `--v 99 \
      -monitor=false -currentManifest=true`
    }
  }
}, (err) => {
  if (err) throw err
  console.log('so far so good')
})
