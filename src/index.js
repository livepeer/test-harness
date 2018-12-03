'use strict'

const fs = require('fs')
const toml = require('toml')
const composefile = require('composefile')
let usedPorts = []


const DEFAULT_CONFIG_PATH = './config.toml'

// fs.readFile('./config.toml', (err, config) => {
//   if (err) throw err
//
//   let parsed = toml.parse(config)
//   console.dir(parsed)
// })


function generateDockerCompose (configPath, cb) {
  const defaults = {
    version: 3,
    outputFolder: __dirname,
    filename: 'docker-compose.yml',
    services: {},
    network_mode: 'host',
    // networks: {
    //   outside: {
    //     external: true,
    //   }
    // }
  }

  let config, configStr
  if (!config) {
    configStr = fs.readFileSync(DEFAULT_CONFIG_PATH)
  }

  try {
    config = toml.parse(configStr)
  } catch (e) {
    console.error("Parsing error on line " + e.line + ", column " + e.column +
    ": " + e.message)
  }

  console.dir(config)
  defaults.services = generateDockerService(config)
  console.log('defaults: ', defaults)

  composefile(defaults,cb)
}

function generateDockerService (config) {
  let output = {}
  if (config.blockchain && config.blockchain.controllerAddress === "") {
    // output.geth = generateGethService()
  }

  for (let i = 0; i < config.nodes.transcoders.instances; i++) {
    // generate separate services with the forwarded ports.
    // append it to output as output.<node_generate_id> = props
    console.log('transcoders: ', i)
    output['lp_transcoder_' + i] = {
      image: 'lpnode:latest',
      ports: [
        `${getRandomPort(8935)}:8935`,
        `127.0.0.1:${getRandomPort(7935)}:7935`,
        `${getRandomPort(1935)}:1935`,
      ],
      command: '-rinkeby -datadir /lpData',
      // networks: [ 'outside']
    }
  }

  return output
}

function generateGethService () {
  return {
    image: 'geth-dev:latest',
    ports: [
      '8545:8545'
    ],
    // networks: ['outside']
  }
}

function getRandomPort(origin) {
  // TODO, ugh, fix this terrible recursive logic, use an incrementer like a gentleman
  let port = origin + Math.floor(Math.random() * 999)
  if (usedPorts.indexOf(port) === -1) {
    usedPorts.push(port)
    return port
  } else {
    return getRandomPort(origin)
  }
}

function generateStreamSimulatorService () {

}

generateDockerCompose({}, (err) => {
  if (err) throw err
  console.log('done')
})
