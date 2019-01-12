#!/usr/bin/env node

const program = require('commander')
const path = require('path')
const dockercompose = require('docker-compose')
const {exec} = require('child_process')
const fs = require('fs')
const YAML = require('yaml')
const {mapValues, each, map, filter} = require('async')
program
  .option('-s, --swarm [SWARM]', 'deploy using docker swarm [NOT THERE YET]')

program.parse(process.argv)

let configFile = program.args
if (!configFile) {
  console.error('dockercompose file required')
  process.exit(1)
} else {
  configFile = configFile[0]
}

if (program.swarm) {
  // ----------------[eth funding]--------------------------------------------
  let parsedCompose = null
  try {
    let file = fs.readFileSync(path.resolve(`${configFile}/docker-compose.yml`), 'utf-8')
    parsedCompose = YAML.parse(file)
  } catch (e) {
    throw e
  }

  // console.log('parsedCompose', parsedCompose.services)
  map(parsedCompose.services, (service, next) => {
    console.log('service.environment = ', service.environment)
    if (service.environment && service.environment.JSON_KEY) {
      let addressObj = JSON.parse(service.environment.JSON_KEY)
      console.log('address to fund: ', addressObj.address)
      next(null, addressObj.address)
    } else {
      next()
    }
  }, (err, addressesToFund) => {
    if (err) throw err
    // clear out the undefined
    filter(addressesToFund, (address, cb) => {
      cb(null, !!address) // bang bang
    }, (err, results) => {
      if (err) throw err
      console.log('results: ', results)
      // get geth containerId
      exec(`docker ps -q -f name=${program.swarm}`, (err, containerId) => {
        if (err) throw err
        console.log('geth containerId: ', containerId)
        each(results, (address, cb) => {
          // NOTE, the slice is to get rid of the \n in the end.
          fundAccount(address, '1', containerId.slice(0, containerId.length - 1), cb)
        }, (err) => {
          if (err) throw err
          console.log('accounts funded!!')
        })
      })
    })
  })
  // -------------------------------------------------------------------------
} else {
  dockercompose.upAll({
    cwd: path.join(configFile),
    log: true
  }).then(
    (logs) => {
      console.log('done', logs)
      // TODO : ping testing SDK to indicate that the network is up and running.
      // or start another command here.

      // ----------------[eth funding]--------------------------------------------
      let parsedCompose = null
      try {
        let file = fs.readFileSync(path.resolve(`${configFile}/docker-compose.yml`), 'utf-8')
        parsedCompose = YAML.parse(file)
      } catch (e) {
        throw e
      }

      // console.log('parsedCompose', parsedCompose.services)
      map(parsedCompose.services, (service, next) => {
        console.log('service.environment = ', service.environment)
        if (service.environment && service.environment.JSON_KEY) {
          let addressObj = JSON.parse(service.environment.JSON_KEY)
          console.log('address to fund: ', addressObj.address)
          next(null, addressObj.address)
        } else {
          next()
        }
      }, (err, addressesToFund) => {
        if (err) throw err
        // clear out the undefined
        filter(addressesToFund, (address, cb) => {
          cb(null, !!address) // bang bang
        }, (err, results) => {
          if (err) throw err
          console.log('results: ', results)

          each(results, (address, cb) => {
            fundAccount(address, '1', 'lp_geth', cb)
          }, (err) => {
            if (err) throw err
            console.log('accounts funded!!')
          })
        })
      })
      // -------------------------------------------------------------------------
    }).catch((err) => {
      console.log('something went wrong:', err.message)
    })
}

function fundAccount (address, valueInEth, containerId, cb) {
  // NOTE: this requires the geth container to be running and account[0] to be unlocked.
  exec(`docker exec ${containerId} geth --exec 'eth.sendTransaction({from: eth.accounts[0], to: "${address}", value: web3.toHex(web3.toWei("${valueInEth}", "ether"))})' attach`,
  (err, stdout, stderr) => {
    if (err) throw err
    console.log('stdout: ', stdout)
    console.log('stderr: ', stderr)
    cb(null, stdout)
  })
}
