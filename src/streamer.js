'use strict'

const { EventEmitter } = require('events')
const { exec, spawn } = require('child_process')
const composefile = require('composefile')
const { each, eachOf } = require('async')
const { URL } = require('url')
const path = require('path')
const { getIds } = require('./utils/helpers')
const { PROJECT_ID } = require('./constants')

const DEFAULT_ARGS = '-vcodec libx264 -profile:v main -tune zerolatency -preset superfast -r 30 -g 4 -keyint_min 4 -sc_threshold 0 -b:v 2500k -maxrate 2500k -bufsize 2500k -acodec aac -strict -2 -b:a 96k -ar 48000 -ac 2 -f flv'
const LIGHT_ARGS = '-c:a copy -c:v copy'
const INFINITE_ARGS = `-f lavfi -i sine=frequency=1000:sample_rate=48000 -f lavfi -i testsrc=size=1280x720:rate=30 -c:a aac -c:v libx264 -g 1 -x264-params keyint=60:min-keyint=60 -f flv`

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
  stream (dir, input, output, cutByTime = 0, infinite = false, useHostFmmpeg = false) {
    return new Promise((resolve, reject) => {
      let argsBase = [
        'run',
        '--rm',
        '-v',
        `${dir}:/temp/`,
        '--net=host',
        'jrottenberg/ffmpeg:4.1-alpine',
        // '-re',
        // path.resolve(input)
      ]
      let args = ['-re']
      if (cutByTime) {
        const measuredTime = new Date(null)
        measuredTime.setSeconds(cutByTime) // specify value of SECONDS
        const MHSTime = measuredTime.toISOString().substr(11, 8)
        args.push('-t', MHSTime)
      }
      if (!infinite) {
        if (useHostFmmpeg) {
          args.push('-i', path.join(dir, input))
        } else {
          args.push('-i', `/temp/${input}`)
        }
        args = args.concat(DEFAULT_ARGS.split(' '))
      } else {
        // ffmpeg -re -f lavfi -i "sine=frequency=1000:sample_rate=48000"  -f lavfi -i "testsrc=size=1280x720:rate=30" -c:a aac -c:v libx264 -g 1 -x264-params "keyint=60:min-keyint=60" -f flv rtmp://localhost:1935/streams/new
        args.push(...INFINITE_ARGS.split(' '))
      }


      let parsedURL = null
      // validate output
      try {
        parsedURL = new URL(output)
      } catch (e) {
        throw e
      }
      if (parsedURL.protocol && parsedURL.protocol !== 'rtmp:') {
        console.log(parsedURL)
        const e = new Error(`streamer can only output to rtmp endpoints, ${parsedURL.protocol} is not supported`)
        console.error(e)
        throw e
      }

      args.push(output)
      console.log('running:')
      console.log('docker', args.join(' '))
      if (useHostFmmpeg) {
        this.streams[output] = spawn('ffmpeg', args)
      } else {
        this.streams[output] = spawn('docker', argsBase.concat(args))
      }

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

  _generateService (broadcaster, sourceDir, input, destination, infinite, machine2use, cb) {
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
      // darkdragon/test-streamer:latest
      networks: {
        testnet: {
          aliases: [`streamer_${broadcaster}`]
        }
      },
      command: infinite ?
        '-re ' + INFINITE_ARGS + ' ' + destination:
        `-re -i /temp/${input} ${DEFAULT_ARGS} ${parsedOutput}`,
      // volumes: [`assets:/temp/`]
      restart: 'unless-stopped',
    }

    generated.logging = {
      driver: 'gcplogs',
      options: {
        'gcp-project': PROJECT_ID,
        'gcp-log-cmd': 'true'
      }
    }

    generated.deploy = {
      // replicas: 1,
      placement: {
        constraints: ['node.role == worker']
      }
    }

    // generated.deploy.resources = {
    //   reservations: {
    //     cpus: '0.2',
    //     memory: '200M'
    //   }
    // }

    let index = broadcaster.split('_')[1]
    // console.log('broadcaster number ', index)
    generated.environment = {
      'DELAY': 0 // (Math.floor(Math.random() * 60)) // * parseInt(index)
    }

    generated.deploy = {
      replicas: 1,
      endpoint_mode: 'dnsrr',
      placement: {
        constraints: [
          'node.role == worker',
          // 'node.hostname == ' + machine2use
        ]
      }
    }
    console.log(`Broadcaster ${broadcaster}, stream ${broadcaster.split('_')[2]}, Delay: ${generated.environment.DELAY}, ingress: ${parsedOutput}`)
    // console.log('generated: ', generated)
    cb(null, generated)
  }

  _generateLightService (sourceDir, input, destinations, cb) {
    let command = `-re -i /temp/${input} ${LIGHT_ARGS}`
    // validate output
    each(destinations, (destination, next) => {
      let parsedOutput = null
      try {
        parsedOutput = new URL(destination)
      } catch (e) {
        next(e)
      }

      if (parsedOutput.protocol && parsedOutput.protocol !== 'rtmp:') {
        console.log(parsedOutput)
        return next(`streamer can only output to rtmp endpoints, ${parsedOutput.protocol} is not supported`)
        // TODO throw error here.
      }

      command += ` -f flv ${parsedOutput.href}`
      next(null, `-f flv ${parsedOutput.href}`)
    }, (err, results) => {
      if (err) throw err
      console.log('command', command)
      // command = `${command} ${results.join(' ')}`

      let generated = {
        image: 'localhost:5000/streamer:latest',
        networks: {
          testnet: {
            aliases: [`streamer_broadcasters`]
          }
        },
        command: command,
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
        // replicas: 1,
        placement: {
          constraints: ['node.role == worker']
        }
      }

      // generated.deploy.resources = {
      //   reservations: {
      //     cpus: '0.5',
      //     memory: '500M'
      //   }
      // }

      // console.log('broadcaster number ', index)
      generated.environment = {
        'DELAY': (Math.floor(Math.random() * 10)) // * parseInt(index)
      }

      generated.deploy = {
        replicas: 1,
        placement: {
          constraints: [
            'node.role == worker'
          ]
        }
      }
      console.log('generated: ', generated)
      cb(null, generated)
    })
  }

  _generateSingleService (broadcasters, sourceDir, input, multiplier, cb) {
    let output = {}
    let destinations = []
    each(broadcasters, (broadcaster, next) => {
      let ids = getIds(input, multiplier)
      eachOf(ids, (id, i, n) => {
        destinations.push(`rtmp://${broadcaster}:1935/${id}`)
        n(null)
      }, next)
    }, (err, result) => {
      if (err) throw err
      // console.log('output ', output)
      console.log('destinations: ', destinations)
      this._generateLightService(sourceDir, input, destinations, (err, service) => {
        if (err) throw err
        output[`streamer`] = service
        cb(null, output)
      })
    })
  }

  _generateStreamServices (broadcasters, machines2use, sourceDir, input, multiplier, infinite, cb) {
    let output = {}
    let mi = 0
    each(broadcasters, (broadcaster, next) => {
      // TODO generate one global list of ids
      let ids = getIds(input, multiplier)
      eachOf(ids, (id, i, n) => {
        const mu = machines2use[mi%machines2use.length]
        mi++
        this._generateService(`${broadcaster}_${i}`, sourceDir, input, `rtmp://${broadcaster}:1935/${id}`,
          infinite ? !!(i%2) : false, mu,
          (err, service) => {
            if (err) return next(err)
            output[`${broadcaster}_${i}`] = service
            n(null, service)
        })
      }, next)
    }, (err, result) => {
      if (err) throw err
      // console.log('output ', output)
      cb(null, output)
    })
  }

  generateComposeFile (broadcasters, machines2use, sourceDir, input, outputPath, multiplier, infinite) {
    return new Promise((resolve, reject) => {
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

      this._generateStreamServices(broadcasters, machines2use, sourceDir, input, multiplier, infinite, (err, services) => {
        if (err) throw err
        output.services = services
        // console.log('got services: ', services)
        // this.nodes = output.services
        composefile(output, (e, r) => {
          if (e) {
            reject(e)
          } else {
            resolve(r)
          }
        })
      })
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
      'jrottenberg/ffmpeg:4.1-alpine',
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
