
const chalk = require('chalk')
const axios = require('axios')

function fn(pad, number) {
  return number.toLocaleString('en').padStart(pad, ' ')
}

function addObjects(objA, objB) {
  const c = {}
  for (prop in objA) {
    const av = objA[prop]
    const bv = objB[prop]
    c[prop] = av
    switch (typeof av) {
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

  async StartStreaming(hostToStream, sim, repeat) {
    console.log('host to stream:', hostToStream)
    try {
      const res = await axios.post(`http://${this.host}:${this.port}/start_streams`, {
        'file_name': 'official_test_source_2s_keys_24pfs.mp4',
        'host': hostToStream,
        'rtmp': 1935,
        'media': 8935,
        'repeat': repeat,
        'simultaneous': sim,
        'profiles_num': this.profiles,
      })
      if (res.status !== 200) {
        console.log(`Error ${res.status} starting streams: `, res.data)
        process.exit(12)
      }
      // console.log(res.data)
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

  async Stats() {
    try {
      const res = await axios.get(`http://${this.host}:${this.port}/stats`)
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
    const res = await Promise.all(streamers.map(st => st.Stats()))
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
    combined.success_rate /= stats.length
    return combined
  }

  static FormatStatsForConsole(stats) {
    const f7 = fn.bind(null, 7)
    const succ = stats.success_rate > 95 ? stats.success_rate > 99.9999 ? chalk.green : chalk.yellowBright : chalk.red
    return `    Number of RTMP streams:                       ${f7(stats.rtm_pstreams)}
    Number of media streams:                      ${f7(stats.media_streams)}
    Total number of segments sent to be sent:     ${f7(stats.total_segments_to_send)}
    Total number of segments sent to broadcaster: ${f7(stats.sent_segments)}
    Total number of segments read back:           ${f7(stats.downloaded_segments)}
    Total number of segments should read back:    ${f7(stats.should_have_downloaded_segments)}
    Success rate:                                     ${succ(stats.success_rate)}%
    Lost connection to broadcaster:               ${f7(stats.connection_lost)}
    Bytes dowloaded:                      ${fn(15, stats.bytes_downloaded)}`
  }
}

module.exports = {
  StreamerTester
}
