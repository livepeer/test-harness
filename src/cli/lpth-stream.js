#!/usr/bin/env node

const program = require('commander')
const path = require('path')
const fs = require('fs')
const YAML = require('yaml')
const Streamer = require('../streamer')
const Swarm = require('../swarm')

program
  .option('-r --remote', 'remote streamer mode. used with GCP test-harness')
  .option('-d --dir [DIR]', 'asset dir, must be absolute dir')
  .option('-f --file [FILE]', 'test mp4 file in the asset dir')
  .description('starts stream simulator to deployed broadcasters. [WIP]')

program.parse(process.argv)

let configName = program.args
if (!configName) {
  console.error('dockercompose file required')
  process.exit(1)
} else {
  configName = configName[0]
}

let parsedCompose = null
try {
  let file = fs.readFileSync(path.resolve(__dirname, `../../dist/${configName}/docker-compose.yml`), 'utf-8')
  parsedCompose = YAML.parse(file)
} catch (e) {
  throw e
}

// console.log('parsedCompose', parsedCompose.services)
let servicesNames = Object.keys(parsedCompose.services)

let broadcasters = servicesNames.filter((service) => {
  return (service.match(/lp_b_*/g))
})

const st = new Streamer({})
const swarm = new Swarm(configName)

let baseUrl = 'localhost'
if (program.remote) {
  if (!program.dir) {
    program.dir = `/tmp/assets`
    program.file = 'BigBuckBunny.mp4'
  }
  swarm.getPubIP(`${configName}-manager`, (err, ip) => {
    if (err) throw err
    baseUrl = ip.trim()

    swarm.setEnv(`${configName}-manager`, (err, env) => {
      if (err) throw err
      broadcasters.forEach((broadcaster) => {
        // let broadcaster = `lp_broadcaster_0`
        let rtmpPort = getForwardedPort(broadcaster, '1935')
        if (rtmpPort) {
          st.rStream(broadcaster, env, program.dir, program.file, `rtmp://${baseUrl}:${rtmpPort}`)
        }
      })
    })
  })
} else {
  if (!program.dir) {
    program.dir = path.resolve('./assets')
    program.file = 'BigBuckBunny.mp4'
  }

  broadcasters.forEach((broadcaster) => {
    let rtmpPort = getForwardedPort(broadcaster, '1935')
    if (rtmpPort) {
      st.stream(program.dir, program.file, `rtmp://localhost:${rtmpPort}`)
    }
  })
}

//
//
// if (!program.dir) {
//   program.dir = path.resolve('./assets')
//   program.file = 'BigBuckBunny.mp4'
// }
//
// broadcasters.forEach((broadcaster) => {
//   let rtmpPort = getForwardedPort(broadcaster, '1935')
//   if (rtmpPort) {
//     st.stream(program.dir, program.file, `rtmp://localhost:${rtmpPort}`)
//   }
// })

// let p = getForwardedPort('lp_b_0', '7935')
// console.log(p)








function getForwardedPort (service, origin) {
  if (!parsedCompose.services[service]) {
    throw new Error(`container ${service} isn't in the compose file`)
  }

  let portPair = parsedCompose.services[service].ports.filter((port) => {
    return (port.match(new RegExp(`:${origin}`, 'g')))
  })

  console.log('portPair', portPair)
  if (portPair.length > 0) {
    return parseInt(portPair[0].match(/(.*)?:/g)[0].slice(0, -1))
  } else {
    return null
  }
}
