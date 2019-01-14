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
  livepeerBinaryPath: './containers/lpnode/livepeer_linux/livepeer',
  blockchain: {
    name: 'lpTestNet',
    networkId: 54321,
    controllerAddress: '0x93ad00a63b14492386df9f1cc123d785705bdf99',
  },
  nodes: {
    transcoders: {
      instances: 1,
      flags: '--v 4 -transcoder -initializeRound'
    },
    orchestrators: {
      instances: 1,
      flags: '--v 4 -initializeRound'
    },
    broadcasters: {
      instances: 1,
      flags: '--v 4'
    }
  }
}, (err) => {
  if (err) throw err
  console.log('so far so good')
})
