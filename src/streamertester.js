
const chalk = require('chalk')
const axios = require('axios')

const Microsecond = 1000
const Millisecond = 1000 * Microsecond
const Second = 1000 * Millisecond

function fn(pad, number) {
  return number.toLocaleString('en').padStart(pad, ' ')
}

function formatDuration(dur) {
  if (typeof dur !== 'number') {
    return '#Empty'
  }
  if (dur < Second) {
    return (dur/Millisecond) + 'ms'
  }
  return (dur/Second) +'s'
}

function formatLatencies(latencies) {
  if (!latencies) {
    return ''
  }
  return `Avg: ${formatDuration(latencies.avg)} P50: ${formatDuration(latencies.p_50)} P95: ${formatDuration(latencies.p_95)} P99: ${formatDuration(latencies.p_99)}`
}

function addObjects(objA, objB) {
  // console.log(objA, objB)
  const c = {}
  for (prop in objA) {
    const av = objA[prop]
    const bv = objB[prop]
    c[prop] = av
    switch (typeof av) {
      case 'object':
        if (Array.isArray(av) && Array.isArray(bv)) {
          c[prop] = av.concat(bv)
        } else if (typeof bv === 'object' && !Array.isArray(av)) {
          c[prop] = addObjects(av, bv)
        }
        break
      case 'number':
        c[prop] += bv
        break
      case 'boolean':
        c[prop] = c[prop] && bv
        break
    }
  }
  return c
}

function getPercentile(values, percentile) {
  let per
	let findex = values.length * percentile / 100.0
	if (Math.ceil(findex) == Math.floor(findex)) {
		let index = findex - 1
		// console.log(`== whole getPercentile of ${percentile} findex ${findex} index ${index} len ${values.length}`)
		per = (values[index] + values[index+1]) / 2
	} else {
		let index = Math.round(findex) - 1
		// console.log(`==       getPercentile of ${percentile} findex ${findex} index ${index} len ${values.length}`)
		per = values[index]
  }
  return per
}

class StreamerTester {

  constructor(name, cfg, host, port, profiles) {
    // console.log(`new StreamerTester(${host}, ${port}, ${profiles})`)
    this.name = name
    this.version = cfg.version
    this.transcodingOptions = cfg.transcodingOptions
    this.host = host
    this.port = port
    this.profiles = profiles || 2
  }

  async StartStreaming(hostToStream, sim, repeat, threeMin, duration, latency) {
    console.log(`host to stream: ${hostToStream} streams number: ${sim} repeat: ${repeat} duration: ${duration} latency: ${latency}`)
    try {
      const data = {
        'file_name': threeMin ? 'official_test_source_2s_keys_24pfs_3min.mp4' : 'official_test_source_2s_keys_24pfs.mp4',
        'host': hostToStream,
        'rtmp': 1935,
        'media': 8935,
        'repeat': repeat,
        'simultaneous': sim,
        'time': duration || '',
        'profiles_num': this.profiles,
        'measure_latency': !!latency,
      }
      // console.log('== sending ', data)
      const res = await axios.post(`http://${this.host}:${this.port}/start_streams`, data)
      if (res.status !== 200) {
        console.log(`Error ${res.status} starting streams: `, res.data)
        process.exit(12)
      }
      // console.log('== response:' ,res.data)
      return res
    }
    catch (err) {
      if (err && err.response && err.response.status !== 200) {
        console.log(`${chalk.red('Error')} ${err.response.status} starting streams: `, chalk.red(err.response.data))
      } else {
        console.error(err)
      }
      process.exit(11)
    }
  }

  async Stats(returnRawLatencies = false) {
    try {
      const res = await axios.get(`http://${this.host}:${this.port}/stats${returnRawLatencies ? '?latencies' : ''}`)
      // console.log(res)
      return res.data
    } catch (err) {
      if (err && err.response && err.response.status !== 200) {
        console.log(`${chalk.red('Error')} ${err.response.status} getting stats: `, chalk.red(err.response.data))
      } else {
        console.error(err)
      }
      process.exit(12)
    }
  }

  static async StatsForMany(streamers) {
    const res = await Promise.all(streamers.map(st => st.Stats(streamers.length > 1)))
    return res
  }

  async Stop() {
    try {
      const res = await axios.get(`http://${this.host}:${this.port}/stop`)
      // console.log(res)
      return res.data
    } catch (err) {
      if (err && err.response && err.response.status !== 200) {
        console.log(`${chalk.red('Error')} ${err.response.status} stopping streams: `, chalk.red(err.response.data))
      } else {
        console.error(err)
      }
      process.exit(14)
    }
  }

  static async StopForMany(streamers) {
    const res = await Promise.all(streamers.map(st => st.Stop()))
    return res
  }

  static CombineStats(stats) {
    // console.log('=== CombineStats ', stats.length, stats)
    // process.exit(11)
    if (!stats.length) {
      return []
    }
    if (stats.length == 1) {
      return stats[0]
    }
    const tail = stats.slice(1)
    const combined = tail.reduce((ac, cv) => {
      return addObjects(ac, cv)
    }, stats[0])
    // combined.success_rate /= stats.length
    if (combined.source_latencies && typeof combined.source_latencies.avg === 'number') {
      combined.source_latencies.avg /= stats.length
    }
    if (combined.transcoded_latencies && typeof combined.transcoded_latencies.avg === 'number') {
      combined.transcoded_latencies.avg /= stats.length
    }
    if (combined.raw_source_latencies && combined.raw_source_latencies.length) {
      combined.raw_source_latencies.sort()
      combined.source_latencies.p_50 = getPercentile(combined.raw_source_latencies, 50)
      combined.source_latencies.p_95 = getPercentile(combined.raw_source_latencies, 95)
      combined.source_latencies.p_99 = getPercentile(combined.raw_source_latencies, 99)
    }
    if (combined.raw_transcoded_latencies && combined.raw_transcoded_latencies.length) {
      combined.raw_transcoded_latencies.sort()
      combined.transcoded_latencies.p_50 = getPercentile(combined.raw_transcoded_latencies, 50)
      combined.transcoded_latencies.p_95 = getPercentile(combined.raw_transcoded_latencies, 95)
      combined.transcoded_latencies.p_99 = getPercentile(combined.raw_transcoded_latencies, 99)
    }
    // stats.forEach((s, i) => console.log(`separate stats (i: ${i}):`, s))
    // console.log('combined:', combined)
    // process.exit(11)
    combined.success_rate /= stats.length
    combined.profiles_num = stats[0].profiles_num

    // for combined stats, recalc success rate 
    // combined.success_rate = combined.downloaded_segments / ((combined.profiles_num + 1) * combined.total_segments_to_send) * 100
    return combined
  }


  static FormatStatsForConsole(stats) {
    // console.log(stats)
    // stats.ShouldHaveDownloadedSegments = (model.ProfilesNum + 1) * stats.SentSegments
    // stats.SuccessRate = float64(stats.DownloadedSegments) / ((float64(model.ProfilesNum) + 1) * float64(stats.SentSegments)) * 100
    // const successRate2 = stats.downloaded_segments / ((stats.profiles_num + 1) * stats.sent_segments) * 100
    // const succ2 = successRate2 > 95 ? successRate2 > 99.9999 ? chalk.green : chalk.yellowBright : chalk.red
    // stats.total_segments_to_send

    const f7 = fn.bind(null, 7)

    const succ = stats.success_rate > 95 ? stats.success_rate > 99.9999 ? chalk.green : chalk.yellowBright : chalk.red
    return `    Number of RTMP streams:                       ${f7(stats.rtm_pstreams)}
    Number of media streams:                      ${f7(stats.media_streams)}
    Total number of segments sent to be sent:     ${f7(stats.total_segments_to_send)}
    Total number of segments sent to broadcaster: ${f7(stats.sent_segments)}
    Total number of segments read back:           ${f7(stats.downloaded_segments)}
    Total number of segments should read back:    ${f7(stats.should_have_downloaded_segments)}
    Number of retries:                            ${f7(stats.retries)}
    Success rate:                                     ${succ(stats.success_rate)}%
    Source latency:                                     ${formatLatencies(stats.source_latencies)}
    Transcoded latency                                  ${formatLatencies(stats.transcoded_latencies)}
    Lost connection to broadcaster:               ${f7(stats.connection_lost)}
    Bytes dowloaded:                      ${fn(15, stats.bytes_downloaded)}`
  }
}

module.exports = {
  StreamerTester
}
