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
    controllerAddress: '0x93ad00a63b14492386df9f1cc123d785705bdf99'
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
