#!/usr/bin/env node

const program = require('commander')
const fs = require('fs')
const path = require('path')
const NetworkCreator = require('../networkcreator')
const dockercompose = require('docker-compose')
const YAML = require('yaml')

function parsePath (val) {
  console.log(`parsing ${path.resolve(val)} config:`)
  return fs.readFileSync(path.resolve(val))
}

function parseOutput (val) {
  return path.resolve(val)
}

program
  .version('0.1.0')
  .command('build <config>', 'generate a docker-compose file based on TOML config', parsePath)
  .command('deploy <file>', 'deploy generated docker compose')
  .command('stream <file>', 'starts ffmpeg stream to broadcasters specified in <file>')
  .command('utils [options]', 'various utils for quick debugging')

program
  .command('down [name]')
  .description('stops and removes docker-compose services.')
  .action((name) => {
    fs.access(path.resolve(__dirname, `../../dist/${name}/docker-compose.yml`), (err) => {
      if (err) {
        console.log(`experiment ${name} doesn't exist in the ./dist folder`)
      }

      dockercompose.down({
        cwd: path.resolve(__dirname, `../../dist/${name}/`),
        logs: true
      }).then((logs) => {
        console.log(logs)
        console.log(`experiment ${name} services stopped.`)
      })
    })
  })

program
  .command('port [name] [lpnode]')
  .description('get forwarded port for a livepeer node')
  .option('-t, --type [type]', 'which port (cli, rtmp, http)?')
  .action((name, lpnode, env) => {
    // console.log(name, lpnode, env.type)
    parseDockerCompose(name, (err, experiment) => {
      if (err) throw err
      let servicesNames = Object.keys(experiment.services)
      let num = lpnode.split('_')[1]
      let port = null
      let serviceName = null
      if (lpnode.startsWith('b_')) {
        serviceName = `broadcaster_${num}`
      } else if (lpnode.startsWith('b_')) {
        serviceName = `transcoder_${num}`
      } else if (lpnode.startsWith('o_')) {
        serviceName = `orchestrator_${num}`
      } else {
        serviceName = lpnode
      }
      // console.log('service name: ', serviceName)
      if (experiment.services[serviceName]) {
        switch (env.type) {
          case 'cli':
            port = getForwardedPort(experiment, serviceName, '7935')
            break
          case 'rtmp':
            port = getForwardedPort(experiment, serviceName, '1935')
            break
          case 'http':
            port = getForwardedPort(experiment, serviceName, '8935')
            break
          default:
        }

        console.log(port)
      } else {
        // console.log(`\n`)
      }
      process.exit()
    })
  })

function parseDockerCompose (name, cb) {
  let parsedCompose = null
  fs.readFile(path.resolve(__dirname, `../../dist/${name}/docker-compose.yml`), 'utf-8', (err, _file) => {
    if (err) throw err
    try {
      parsedCompose = YAML.parse(_file)
    } catch (e) {
      throw e
    }

    cb(null, parsedCompose)
  })
}

function getForwardedPort (parsedCompose, service, origin) {
  if (!parsedCompose.services[service]) {
    throw new Error(`container ${service} isn't in the compose file`)
  }

  let portPair = parsedCompose.services[service].ports.filter((port) => {
    return (port.match(new RegExp(`:${origin}`, 'g')))
  })

  if (portPair.length > 0) {
    return parseInt(portPair[0].match(/(.*)?:/g)[0].slice(0, -1))
  } else {
    return null
  }
}


program.parse(process.argv)
