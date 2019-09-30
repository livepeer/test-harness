#!/usr/bin/env node

const program = require('commander')
const chalk = require('chalk')
const _cliProgress = require('cli-progress')
const { parseConfigFromCommandLine } = require('./helpers.js')
const Api = require('../api')
const Swarm = require('../swarm')
const { wait } = require('../utils/helpers')
const constants = require('../constants')
const { StreamerTester } = require('../streamertester')
const { ChaosManager } = require('../chaosmanager')


program
  .option('-s --streams <n>', 'total number of streams to stream, will be distributed evenly between all streamers')
  .option('-r --repeat <n>', 'number of times to repeat streaming')
  .option('-t --stop', 'stop running streams')
  .option('-l --latency', 'measure latency')
  .option('-d --duration <s>', 'duration to run stream. should not be used together with `-r`')
  .option('-a --stats', 'just show stats from streamers')
  .option('-c --clear', 'clear chaos tasks')
  .option('-3 --threemin', 'use three minutes video')
  .description('Test deployment by streaming video into it and calculating success rate')

program
  .parse(process.argv)

const { configName, parsedCompose } = parseConfigFromCommandLine(program)

function getServicesByType(type) {
  return Object.keys(parsedCompose.services).filter(key => {
    const serv = parsedCompose.services[key]
    return serv && serv.environment && serv.environment.type === type
  })
}

function mapStreamersToBroadcasters(streamers, broadcasters) {
  const res = new Map()
  let bi = 0
  for (let i = 0; i < streamers.length; i++) {
    res.set(i, bi)
    if (++bi >= broadcasters.length) {
      bi = 0
    }
  }
  return res
}

function printStreamersMap(services, streamers, broadcasters, m, versions, broadcastersConfigs) {
  for (let si of m) {
    console.log(`Streamer ${chalk.green(services[streamers[si[0]]].hostname)} will stream to ${chalk.green(services[broadcasters[si[1]]].hostname)} (version ${chalk.yellowBright(versions[si[1]])}) transcoding ${chalk.yellowBright(broadcastersConfigs[si[1]].TranscodingOptions)}`)
  }
}

function printAllStats(streamers, allStats) {
  allStats.forEach((stats, i) => {
    console.log(`\n============ stats for ${chalk.green(streamers[i].name)} (version ${chalk.yellowBright(streamers[i].version)})  transcoding ${chalk.yellowBright(streamers[i].transcodingOptions)}`)
    console.log(StreamerTester.FormatStatsForConsole(stats))
  })
  combinedStats = StreamerTester.CombineStats(allStats)
  console.log('\n============ combined stats ')
  console.log(StreamerTester.FormatStatsForConsole(combinedStats))
  return combinedStats
}

async function cliProgressMonitorSart(streamers, cm) {
  let allStats
  let chaosStats
  while (true) {
    // console.log('cliProgressMonitorSart streamers: ', streamers)
    allStats = await StreamerTester.StatsForMany(streamers)
    if (!allStats.length) {
      console.error('Something wrong - shouldn\'t be empty array')
      process.exit(14)
    }
    if (allStats[0].total_segments_to_send && !allStats[0].finished) {
      // streaming started
      break
    }
    console.log('Waiting for streams to start')
    await wait(2000, true)
  }

  allStats = await StreamerTester.StatsForMany(streamers)
  if (cm) {
    chaosStats = await cm.stats()
  }
  const printCurrentStats = () => {
    const combined = printAllStats(streamers, allStats)
    if (chaosStats) {
      console.log(chaosStats)
    }
    process.exit(combined.success_rate === 100 ? 0 : 200)
  }
  process.on('SIGTERM', printCurrentStats)
  process.on('SIGINT', printCurrentStats)
  let combinedStats = StreamerTester.CombineStats(allStats)
  const bar = new _cliProgress.Bar({
    format: 'progress [{bar}] {percentage}% | ETA: {eta_formatted} | {value}/{total} | Success rate: {success}%'
  }, _cliProgress.Presets.shades_classic)
  bar.start(combinedStats.total_segments_to_send, 0, { success: 0 })
  while (true) {
    allStats = await StreamerTester.StatsForMany(streamers)
    if (cm) {
      chaosStats = await cm.stats()
    }
    let combinedStats = StreamerTester.CombineStats(allStats)
    // console.log('==== combinedStats:', combinedStats)
    const success = combinedStats.success_rate
    bar.update(combinedStats.sent_segments, { success })
    if (combinedStats.finished) {
      console.log('finished')
      break
    }
    await wait(4000, true)
  }
  bar.stop()
  allStats = await StreamerTester.StatsForMany(streamers)
  // console.log(allStats)
  printCurrentStats()
}

async function getVersions(api, broadcasterServices) {
  // console.log(broadcasterServices)
  // const bPorts = await api.getPortsArray(['broadcasters'])
  const versions = []
  for (let i = 0; i < broadcasterServices.length; i++) {
    const status = await api.status(broadcasterServices[i])
    // console.log(status)
    versions.push(status.Version + ' ' + status.GolangRuntimeVersion)
  }
  return versions
}

async function run() {
  console.log(chalk.magentaBright('Starting streaming to ' + chalk.green(configName)))

  const services = parsedCompose.services
  // console.log(services)
  const streamersServices = getServicesByType('streamer')
  if (!streamersServices.length) {
    console.log(chalk.red('No streamer services in config, can\'t do testing'))
  }
  // console.log('streamers services:', streamersServices)
  const broadcasterServices = getServicesByType('broadcaster')
  if (!broadcasterServices.length) {
    console.log(chalk.red('No broadcaster services in config, can\'t do testing'))
  }
  // console.log('broadcasters services:', broadcasterServices)
  const streamsNumber = program.streams | 0 || streamersServices.length
  const repeat = program.repeat | 0 || 1
  // console.log('repeat:', repeat, 'sim', simulteneous, 'program', program)
  // process.exit(11)
  const streamsPerStreamer = new Map() // streamerIndex:numberOfStreams
  streamersServices.forEach((_s, i) => {
    streamsPerStreamer.set(i, (streamsNumber / streamersServices.length | 0) + ((i + 1) <= (streamsNumber % streamersServices.length)) | 0)
  })
  console.log('streamsPerStreamer:', streamsPerStreamer)

  let managerIP = 'localhost'
  if (!parsedCompose.isLocal) {
    managerIP = await Swarm.getManagerIP(configName)
  }
  const api = new Api(parsedCompose, managerIP)
  const versions = await getVersions(api, broadcasterServices)
  const sm = mapStreamersToBroadcasters(streamersServices, broadcasterServices)
  const broadcastersConfigs = await api.getBroadcastConfig('broadcasters')
  const broadcastersProfilesNums = broadcastersConfigs.map(cfg => cfg.TranscodingOptions.split(',').length)
  printStreamersMap(services, streamersServices, broadcasterServices, sm, versions, broadcastersConfigs)

  const sPorts = await api.getPortsArray(['streamers'])
  // console.log(sPorts)
  const streamers = streamersServices.map((sn, i) => {
    // const host = parsedCompose.isLocal ? 'localhost' : services[sn].hostname
    const cfg = { version: versions[sm.get(i)], transcodingOptions: broadcastersConfigs[sm.get(i)].TranscodingOptions }
    return new StreamerTester(sn, cfg, managerIP, sPorts[i][constants.ports.STREAMER_PORT], broadcastersProfilesNums[sm.get(i)])
  })
  const cm = new ChaosManager(managerIP, [])

  const allStats = await StreamerTester.StatsForMany(streamers)
  const hasActiveStreams = allStats.some(st => st.rtmp_active_streams)
  if (program.clear) {
    console.log(`Clearing chaos tasks`)
    await cm.clear()
    return
  }
  if (program.stop) {
    if (hasActiveStreams) {
      if (parsedCompose.config.chaos) {
        await cm.clear()
      }
      // do stop
      await StreamerTester.StopForMany(streamers)
      console.log(chalk.cyan('Streams stopped, if was running'))
      await wait(2500)
      const allStats = await StreamerTester.StatsForMany(streamers)
      const combinedStats = StreamerTester.CombineStats(allStats)
      console.log(StreamerTester.FormatStatsForConsole(combinedStats))
    } else {
      console.log('No active streams running')
    }
    return
  }
  if (program.stats) {
    const allStats = await StreamerTester.StatsForMany(streamers)
    // console.log(allStats)
    const combinedStats = StreamerTester.CombineStats(allStats)
    console.log(StreamerTester.FormatStatsForConsole(combinedStats))
    if (parsedCompose.config.chaos) {
      const stats = await cm.stats()
      console.log(stats)
    }
    return
  }
  if (!hasActiveStreams) {
    // start chaos
    if (parsedCompose.config.chaos) {
      const chaosTasks = parsedCompose.config.chaosTasks || []
      if (chaosTasks.length) {
        const cm = new ChaosManager(managerIP, parsedCompose.config.chaosTasks)
        await cm.clear()
        await cm.schedule()
        const duration = program.duration || ((program.repeat || 1) * 600) + 's'
        await cm.start(duration)
      } else {
        consol.log('No chaos tasks defined, not running chaos.')
      }
    }
    const streams = streamers.map((streamer, i) => {
      const hostToStream = services[broadcasterServices[sm.get(i)]].hostname
      const numberOfStreams = streamsPerStreamer.get(i)
      // console.log(`numberOfStreams for ${i} streamer: ${numberOfStreams}`)
      return numberOfStreams ? streamer.StartStreaming(hostToStream, numberOfStreams, repeat, program.threemin, program.duration, program.latency) : null
    })
    await Promise.all(streams)
  } else {
    console.log(chalk.cyan('There is already running streams, showing them instead of running new ones'))
  }
  await cliProgressMonitorSart(streamers, parsedCompose.config.chaos ? cm : undefined)
}

run().catch(console.error)
