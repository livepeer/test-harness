'use strict'

const { EventEmitter } = require('events')
const { exec, spawn } = require('child_process')
const composefile = require('composefile')
const { each, eachOf } = require('async')
const { URL } = require('url')
const path = require('path')
const { getIds } = require('./utils/helpers')

const DEFAULT_ARGS = '-vcodec libx264 -profile:v main -tune zerolatency -preset superfast -r 30 -g 4 -keyint_min 4 -sc_threshold 0 -b:v 2500k -maxrate 2500k -bufsize 2500k -acodec aac -strict -2 -b:a 96k -ar 48000 -ac 2 -f flv'

class Streamer extends EventEmitter {
  constructor (opts) {
    super()
    this.streams = {}
  }

  // streamTesting (input, output) {
  //   let args = DEFAULT_ARGS.split(' ')
  //   args.push(output)
  //   this.streams[output] = spawn('ffmpeg',
  //     args,
  //     {
  //       cwd: process.env.VIDEO_ASSETS
  //     }
  //   )
  //
  //   this.streams[output].stdout.on('data', (data) => {
  //     console.log(`stdout: ${data}`)
  //   })
  //   this.streams[output].stderr.on('data', (data) => {
  //     console.log(`stderr: ${data}`)
  //   })
  //
  //   this.streams[output].on('close', (code) => {
  //     console.log(`child process exited with code ${code}`)
  //   })
  // }
  stopAll() {
    for (let stname of Object.keys(this.streams)) {
      const stream = this.streams[stname]
      stream.kill()
    }
  }

  // @cutByTime - how long to stream, seconds
  // (should be less than movie length)
  stream (dir, input, output, cutByTime = 0) {
    return new Promise((resolve, reject) => {
      let args = [
        'run',
        '--rm',
        '-v',
        `${dir}:/temp/`,
        '--net=host',
        'jrottenberg/ffmpeg:4.0-alpine',
        '-re',
        // path.resolve(input)
      ]
      if (cutByTime) {
        const measuredTime = new Date(null)
        measuredTime.setSeconds(cutByTime) // specify value of SECONDS
        const MHSTime = measuredTime.toISOString().substr(11, 8)
        args.push('-t', MHSTime)
      }
      args.push('-i', `/temp/${input}`)

      args = args.concat(DEFAULT_ARGS.split(' '))

      let parsedOutput = null
      // validate output
      try {
        parsedOutput = new URL(output)
      } catch (e) {
        throw e
      }
      if (parsedOutput.protocol && parsedOutput.protocol !== 'rtmp:') {
        console.log(parsedOutput)
        const e = new Error(`streamer can only output to rtmp endpoints, ${parsedOutput.protocol} is not supported`)
        console.error(e)
        throw e
      }

      args.push(output)
      console.log('running:')
      console.log('docker', args.join(' '))
      this.streams[output] = spawn('docker', args)

      this.streams[output].stdout.on('data', (data) => {
        console.log(`stdout: ${data}`)
      })
      this.streams[output].stderr.on('data', (data) => {
        console.log(`stderr: ${data}`)
      })

      this.streams[output].on('close', (code) => {
        console.log(`${output} child process exited with code ${code}`)
        if (code) {
          reject(code)
        } else {
          resolve(code)
        }
      })
    })
  }

  _generateService (broadcaster, sourceDir, input, destination, cb) {
    let parsedOutput = null
    // validate output
    try {
      parsedOutput = new URL(destination)
    } catch (e) {
      throw e
    }
    if (parsedOutput.protocol && parsedOutput.protocol !== 'rtmp:') {
      console.log(parsedOutput)
      console.error(`streamer can only output to rtmp endpoints, ${parsedOutput.protocol} is not supported`)
      // TODO throw error here.
      return
    }

    let generated = {
      image: 'localhost:5000/streamer:latest',
      networks: {
        testnet: {
          aliases: [`streamer_${broadcaster}`]
        }
      },
      command: `-re -i /temp/${input} ${DEFAULT_ARGS} ${parsedOutput}`,
      // volumes: [`assets:/temp/`]
    }

    generated.logging = {
      driver: 'gcplogs',
      options: {
        'gcp-project': 'test-harness-226018',
        'gcp-log-cmd': 'true'
      }
    }

    generated.deploy = {
      replicas: 1,
      placement: {
        constraints: ['node.role == worker']
      }
    }

    generated.deploy.resources = {
      reservations: {
        cpus: '0.1',
        memory: '100M'
      }
    }

    console.log('generated: ', generated)
    cb(null, generated)
  }

  _generateStreamServices (broadcasters, sourceDir, input, cb) {
    let output = {}
    each(broadcasters, (broadcaster, next) => {
      let ids = getIds(input, 2)
      eachOf(ids, (id, i, n) => {
        this._generateService(`${broadcaster}_${i}`, sourceDir, input, `rtmp://${broadcaster}:1935/stream_${i}?manifestID=${id}`, (err, service) => {
          if (err) return next(err)
          output[`${broadcaster}_${i}`] = service
          n(null, service)
        })
      }, next)
    }, (err, result) => {
      if (err) throw err
      console.log('output ', output)
      cb(null, output)
    })
  }

  generateComposeFile (broadcasters, sourceDir, input, outputPath, cb) {
    let output = {
      version: '3.7',
      outputFolder: path.resolve(__dirname, outputPath),
      filename: 'stream-stack.yml',
      services: {},
      networks: {
        testnet: {
          driver: 'overlay',
          external: true
        }
      },
      // volumes: {
      //   assets: {
      //     driver: 'local',
      //     driver_opts: {
      //       type: 'none',
      //       o: 'bind',
      //       mount: '/tmp/assets'
      //     }
      //   }
      // }
    }

    this._generateStreamServices(broadcasters, sourceDir, input, (err, services) => {
      if (err) throw err
      output.services = services
      console.log('got services: ', services)
      // this.nodes = output.services
      composefile(output, cb)
    })
  }

  rStream (name, env, dir, input, output) {
    let args = [
      'service',
      'create',
      '--name',
      `streamer_${name}`,
      '--network',
      'testnet',
      '--replicas',
      '1',
      '--mount',
      `type=bind,source=${dir},destination=/temp/`,
      'jrottenberg/ffmpeg:4.0-alpine',
      '-re',
      '-i',
      // path.resolve(input)
      `/temp/${input}`
    ]

    args = args.concat(DEFAULT_ARGS.split(' '))

    let parsedOutput = null
    // validate output
    try {
      parsedOutput = new URL(output)
    } catch (e) {
      throw e
    }
    if (parsedOutput.protocol && parsedOutput.protocol !== 'rtmp:') {
      console.log(parsedOutput)
      console.error(`streamer can only output to rtmp endpoints, ${parsedOutput.protocol} is not supported`)
      // TODO throw error here.
      return
    }

    args.push(output)
    this.streams[output] = spawn('docker', args, {env: env})

    this.streams[output].stdout.on('data', (data) => {
      console.log(`stdout: ${data}`)
    })
    this.streams[output].stderr.on('data', (data) => {
      console.log(`stderr: ${data}`)
    })

    this.streams[output].on('close', (code) => {
      console.log(`${output} child process exited with code ${code}`)
    })

    return this.streams[output]
  }
}

// const st = new Streamer({})
// st.streamTesting('test', 'rtmp://localhost:2830/test/video')
module.exports = Streamer
