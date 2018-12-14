'use strict'

const { EventEmitter } = require('events')
const { exec, spawn } = require('child_process')
const { URL } = require('url')
const path = require('path')

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

  stream (dir, input, output) {
    let args = [
      'run',
      '-v',
      `${dir}:/temp/`,
      '--net=host',
      'jrottenberg/ffmpeg:4.0-ubuntu',
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
    this.streams[output] = spawn('docker', args)

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
