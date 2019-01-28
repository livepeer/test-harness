#!/usr/bin/env node

const program = require('commander')
const path = require('path')
const fs = require('fs')
const Streamer = require('../streamer')
const Swarm = require('../swarm')
const Api = require('../api')
const utils = require('../utils/helpers')
const { wait } = require('../utils/helpers')
const { parseConfigFromCommandLine } = require('./helpers.js')

const DIST_DIR = '../../dist'

program
  .option('-r --remote', 'remote streamer mode. used with GCP test-harness')
  .option('-d --dir [DIR]', 'asset dir, must be absolute dir')
  .option('-f --file [FILE]', 'test mp4 file in the asset dir')
  .option('-t --to-cloud', 'streams from local machine to cloud')
  .option('-s --streams <n>', 'maximum number of streams to stream', parseInt)
  .description('starts stream simulator to deployed broadcasters. [WIP]')

program.parse(process.argv)

const { configName, parsedCompose } = parseConfigFromCommandLine(program.args)
// console.log('parsedCompose', parsedCompose.services)
let servicesNames = Object.keys(parsedCompose.services)

const broadcasters = servicesNames.filter((service) => {
  return (service.match(/broadcaster_*/g))
})

const st = new Streamer({})
const swarm = new Swarm(configName)


async function local2cloudStream() {
  const api = new Api(parsedCompose)
  const bPorts = await api.getPortsArray(['broadcasters'])
  if (program.streams && program.streams < bPorts.length) {
    bPorts.splice(program.streams, bPorts.length - program.streams)
  }
  console.log(`Streaming ${program.file} to ${bPorts.length} broadcasters in cloud, config ${configName}`)

  const worker1IP = await swarm.getPubIP(`${configName}-worker-1`)
  console.log(`Worker 1 public ip is "${worker1IP}"`)
  console.log('Check sreams here:')
  const m = bPorts.map(po => `curl http://${worker1IP}:${po['8935']}/stream/current.m3u8`)
  console.log(m.join('\n'))
  await wait(2000, true)

  await Promise.all(bPorts.map(po => {
      return st.stream(program.dir, program.file, `rtmp://${worker1IP}:${po['1935']}/anything`)
  }))
  console.log('DONE streaming')
}

// let baseUrl = 'localhost'
if (!program.dir) {
  program.file = 'BigBuckBunny.mp4'
  program.dir = path.resolve(__dirname, `../../assets`)
  if (!fs.existsSync(path.join(program.dir, program.file))) {
    program.dir = `/tmp/assets`
  }
  const ffn = path.join(program.dir, program.file)
  if (!fs.existsSync(ffn)) {
    console.error(`File ${ffn} doesn not exists!`)
    process.exit(2)
  }
}

  // console.log(`streams: "${program.streams}"`)
// if (program.streams) {
//   console.log(`streams: "${program.streams}"`)
//   const s = parseInt(program.streams)
//   if (isNaN) {
//     console.log('--streams options should be integer')
//     process.exit(3)
//   }
//   program.streams = s
// }

if (program.remote) {
  // swarm.getPubIP(`${configName}-manager`, (err, ip) => {
  //   if (err) throw err
  //   baseUrl = ip.trim()
  //
  //   swarm.setEnv(`${configName}-manager`, (err, env) => {
  //     if (err) throw err
  //     broadcasters.forEach((broadcaster) => {
  //       // let broadcaster = `lp_broadcaster_0`
  //       let rtmpPort = getForwardedPort(broadcaster, '1935')
  //       if (rtmpPort) {
  //         st.rStream(broadcaster, env, program.dir, program.file, `rtmp://${baseUrl}:${rtmpPort}`)
  //       }
  //     })
  //   })
  // })
  console.log('generating compose')
  st.generateComposeFile(broadcasters, program.dir, program.file, path.resolve(__dirname, `../../dist/${configName}`), (err, result) => {
    if (err) throw err
    console.log('done', result)
    swarm.scp(
      path.resolve(__dirname, `../../dist/${configName}/stream-stack.yml`),
      `${configName}-manager:/tmp/config/stream-stack.yml`, ``,
      (err, output) => {
        if (err) throw err
        console.log('uploaded stream-stack.yml')
        // TODO find and use proper zone
        const zone = undefined
        utils.remotelyExec(
          `${configName}-manager`, zone,
          `cd /tmp/config && sudo docker stack deploy -c stream-stack.yml streamer`,
          (err, outputBuf) => {
            if (err) throw err
            console.log('stack deployed', (outputBuf) ? outputBuf.toString() : null)
          })
      }
    )
  })
} else if (program.toCloud) {
  local2cloudStream().catch(console.error)
} else {
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
