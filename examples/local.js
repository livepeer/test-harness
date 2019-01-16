'use strict'

const TestHarness = require('../src/index')

let th = new TestHarness()

th.run({
  local: true,
  name: 'test123',
  livepeerBinaryPath: '../containers/lpnode/livepeer_linux/livepeer',
  blockchain: {
    // keep these to run a private testnet.
    name: 'lpTestNet',
    networkId: 54321,
    controllerAddress: '0xA1fe753Fe65002C22dDc7eab29A308f73C7B6982' //pm
  },
  nodes: {
    transcoders: {
      instances: 1,
      flags: '--v 4 -transcoder -initializeRound=true'
    },
    orchestrators: {
      instances: 1,
      flags: '--v 4 -initializeRound'
    },
    broadcasters: {
      instances: 2,
      flags: '--v 4'
    }
  }
}, (err) => {
  if (err) throw err
  console.log('so far so good')
})
