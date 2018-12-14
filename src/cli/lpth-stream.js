#!/usr/bin/env node

const program = require('commander')
const path = require('path')
const fs = require('fs')
const YAML = require('yaml')
const Streamer = require('../streamer')

program
  .option('-d --dir [DIR]', 'asset dir, must be absolute dir')
  .option('-f --file [FILE]', 'test mp4 file in the asset dir')
  .description('starts stream simulator to deployed broadcasters. [WIP]')

program.parse(process.argv)

let configFilePath = program.args
if (!configFilePath) {
  console.error('dockercompose file required')
  process.exit(1)
} else {
  configFilePath = configFilePath[0]
}

let parsedCompose = null
try {
  let file = fs.readFileSync(path.resolve(configFilePath), 'utf-8')
  parsedCompose = YAML.parse(file)
} catch (e) {
  throw e
}

console.log('parsedCompose', parsedCompose.services)

let servicesNames = Object.keys(parsedCompose.services)

let broadcasters = servicesNames.filter((service) => {
  return (service.match(/lp_b_*/g))
})

const st = new Streamer({})

if (!program.dir) {
  program.dir = '/home/op/Videos'
  program.file = 'Heat.1995.mp4'
}

broadcasters.forEach((broadcaster) => {
  let rtmpPort = getForwardedPort(broadcaster, '1935')
  if (rtmpPort) {
    st.stream(program.dir, program.file, `rtmp://localhost:${rtmpPort}`)
  }
})

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
