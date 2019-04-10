'use strict'

const { series } = require('async')
const TestHarness = require('../src/index')
const Api = require('../src/api')

let th = new TestHarness()

th.run({
  local: true,
  localBuild: true,
  prometheus: true,
  loki: true,
  discordUserId: null, // id of Discord user to send alert from Prometheus to (use `Copy ID` on profile to get)
  startMetricsServer: true,
  standardSetup: true, // request token, register orchestartors, etc...
  name: 'dtest',
  livepeerBinaryPath: '../containers/lpnode/livepeer_linux/livepeer',
  email: null, // email to send alerts to
  blockchain: {
    // keep these to run a private testnet.
    name: 'lpTestNet',
    networkId: 54321,
    controllerAddress: '0xA1fe753Fe65002C22dDc7eab29A308f73C7B6982' //pm
  },
  nodes: {
    transcoders: {
      // how many containers to run as transcoders.
      instances: 0,
      // these are the livepeer binary flags, add them as you wish.
      // the test-harness overrides flags that has to do with directories or
      // ip/port bindings, these are automated.
      flags: '-v 5 -orchSecret=deepsecret'
    },
    orchestrators: {
      instances: 1,
      flags: `-v 5 -initializeRound=true -gasPrice 20 -gasLimit 20000000 \
      -currentManifest=true  -orchSecret=deepsecret -maxSessions 4 -transcoder `
    },
    broadcasters: {
      instances: 2,
      flags: `-v 5 -gasPrice 20 -gasLimit 20000000  -currentManifest=true`
    }
  }
}, (err, experiment) => {
  // experiment is a parsed compose file.
  if (err) throw err
  console.log('so far so good')
  return
  // Now we have a running network.
  // lets get some tokens, do some deposits and activate transcoders
  let api = new Api(experiment.parsedCompose)
  // NOTE: all API methods are based on `livepeer_cli`
  // the first parameter is always an array that can be
  // 'all' , all the livepeer nodes.
  // 'broadcasters', 'transcoders', 'orchestrators' : types of nodes.
  // 'lp_broadcaster_0' : a single lp node.
  series([
    (next) => {
      console.log('requesting tokens')
      api.requestTokens(['all'], next)
    },
    (next) => {
      console.log('Depositing....')
      api.fundAndApproveSigners(['all'], '5000000000', '500000000000000000', next)
    },
    (next) => { api.initializeRound(['orchestrator_0'], next) },
    (next) => {
      console.log('activating orchestrators...')
      api.activateOrchestrator(['orchestrators'], {
        blockRewardCut: '10',
        feeShare: '5',
        pricePerSegment: '1',
        amount: '500'
        // ServiceURI will be set by the test-harness.
      }, next)
    },
    (next) => { api.bond(['broadcasters'], '5000', 'orchestrator_0', next) },
    (next) => {
      th.restartService('orchestrator_0', (logs) => {
        console.log('restarted orchestrator')
        next()
      })
    },
    (next) => {
      th.restartService('broadcaster_0', (logs) => {
        console.log('restarted broadcaster')
        next()
      })
    }
  ], (err, results) => {
    if (err) throw err
    console.log('done!')
  })

  // If you like callbacks (lol) , here is the same code without async.series
  // api.requestTokens(['all'], (err, output) => {
  //   if (err) throw err
  //   console.log('requested LPT', output)
  //   api.fundDeposit(['all'], '5000000000', (err, output) => {
  //     console.log('funds deposited')
  //     api.initializeRound(['lp_transcoder_0'], (err, output) => {
  //       if (err) throw err
  //       console.log('round initialized!', output)
  //       api.activateOrchestrator(['orchestrators', 'transcoders'], {
  //         blockRewardCut: '10',
  //         feeShare: '5',
  //         pricePerSegment: '1',
  //         amount: '500'
  //         // ServiceURI will be set by the test-harness.
  //       }, (err, output) => {
  //         if (err) throw err
  //         console.log('we good.', output)
  //         cb()
  //       })
  //     })
  //   })
  // })

})
