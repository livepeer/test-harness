#!/usr/bin/env node

const program = require('commander')
const path = require('path')
const fs = require('fs')
const chalk = require('chalk')
const Streamer = require('../streamer')
const Swarm = require('../swarm')
const Api = require('../api')
const utils = require('../utils/helpers')
const { wait } = require('../utils/helpers')
const { parseConfigFromCommandLine,  } = require('./helpers')
const { getPublicIPOfService } = require('../helpers')
const CloudChecker = require('../cloudchecker')

// const DIST_DIR = '../../dist'

program
  .option('-m --multiplier <n>', 'number of streams per broadcaster to simulate')
  .option('-r --remote', 'remote streamer mode. used with GCP test-harness')
  .option('-d --dir [DIR]', 'asset dir, must be absolute dir')
  .option('-f --file [FILE]', 'test mp4 file in the asset dir')
  // .option('-t --to-cloud', 'streams from local machine to cloud')
  .option('-s --streams <n>', 'maximum number of streams to stream', parseInt)
  .option('-t --time <n>', 'stream length, seconds', parseInt)
  .option('-e --end-point [host:rtmpPort:mediaPort]', 'End point to stream to instead of streaming in config')
  .option('-g --google-check', 'check transcoded files in google cloud and print success rate')
  .description('starts stream simulator to deployed broadcasters. [WIP]')

program.parse(process.argv)

const { configName, parsedCompose } = parseConfigFromCommandLine(program)
// console.log('parsedCompose', parsedCompose.services)
let servicesNames = Object.keys(parsedCompose.services)

const broadcasters = servicesNames.filter((service) => {
  return (service.match(/broadcaster_*/g))
})

const st = new Streamer({})
const swarm = new Swarm(configName)

async function getIP(name) {
  return parsedCompose.overrideBroadcasterHost ? parsedCompose.overrideBroadcasterHost :
    parsedCompose.isLocal ? 'localhost' : await getPublicIPOfService(parsedCompose, name)
}

async function fromLocalStream() {
  const api = new Api(parsedCompose)
  const bPorts = await api.getPortsArray(['broadcasters'])
  if (program.streams && program.streams < bPorts.length) {
    bPorts.splice(program.streams, bPorts.length - program.streams)
  }
  const lm = parsedCompose.isLocal ? 'on localhost' : 'in cloud'
  console.log(`Streaming ${program.file} to ${bPorts.length} broadcasters ${lm}, config ${configName}`)

  const ids = getIds(configName, bPorts.length)
  const checkURLs = []
  const checkURLsMsg = []
  for (let i = 0; i < bPorts.length; i++) {
    const po = bPorts[i]
    const id = ids[i]
    const ip = await getIP(po.name)
    // const m = `curl http://${ip}:${po['8935']}/stream/current.m3u8`
    const u = `http://${ip}:${po['8935']}/stream/${id}.m3u8`
    checkURLs.push(u)
    const m = `curl ${u}`
    checkURLsMsg.push(m)
  }
  console.log('Check streams here:')
  console.log(checkURLsMsg.join('\n'))
  console.log(ids)
  const cloudChecker = program.googleCheck ? new CloudChecker(configName, checkURLs) : null
  await wait(2000, true)

  const tasks = []
  for (let i = 0; i < bPorts.length; i++) {
    const po = bPorts[i]
    const id = ids[i]
    const ip = await getIP(po.name)
    const task = st.stream(program.dir, program.file, `rtmp://${ip}:${po['1935']}/anything?manifestID=${id}`, program.time)
    tasks.push(task)
  }

  if (cloudChecker) {
    for (let rn = 0; rn < 10; rn++) {
      // need to wait till manifest at broadcaster will be available
      await wait(1000, true)
      try {
        await cloudChecker.getAndParseManifest()
        break
      } catch(e) {
        const status = e && e.response && e.response.status
        console.log('Got error', status)
        // check error
        if (status && status === 404) {
          // manifest not here yet, waiting
        } else if (e.message.startsWith('No access:')) {
          // stop streams
          console.log('Killing streams')
          st.stopAll()
          const bucket = e.message.split(':')[1]
          // console.warn(`No access to bucket ${bucket}`)
          console.warn(chalk.green('Please login using ') + chalk.inverse('gcloud auth application-default login') + ' or')
          console.warn(chalk.green('Please run ') + chalk.inverse(`gsutil iam ch allUsers:objectViewer gs://${bucket}`) +
            ' to give anonymous user read access to bucket')
          process.exit(11)
        } else {
          // unknown error, aborting
          console.log(chalk.red('Unknow error, aborting'), e)
          console.log('Killing streams')
          st.stopAll()
          process.exit(12)
        }
      }
    }
  }

  await Promise.all(tasks)

  console.log('DONE streaming')
  if (cloudChecker) {
    const res = await cloudChecker.doChecks()
    cloudChecker.printResults(res)
  }
}

function getIds(configName, num) {
  let u = process.env.USER
  if (u) {
    u += '-'
  }
  const d = (+new Date() - 1500000000000)/1000|0
  return Array.from({length: num}, (_, i) => `${u}${configName}-${d}-${i}`)
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
  console.log('program.multiplier', program.multiplier)
  program.multiplier = program.multiplier || 1
  console.log('program.multiplier', program.multiplier)
  console.log('generating compose')
  st.generateComposeFile(broadcasters, program.dir, program.file, path.resolve(__dirname, `../../dist/${configName}`), program.multiplier, (err, result) => {
    if (err) throw err
    // console.log('done', result)
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
} else {
  fromLocalStream().catch(console.error)
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

/*
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
*/
