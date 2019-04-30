#!/usr/bin/env node

const program = require('commander')
const fs = require('fs')
const path = require('path')
const YAML = require('yaml')
const utils = require('../utils/helpers')

function parsePath (val) {
  console.log(`parsing ${path.resolve(val)} config:`)
  return fs.readFileSync(path.resolve(val))
}

program
  .version('0.1.0')
  .command('build <config>', 'generate a docker-compose file based on TOML config', parsePath)
  .command('deploy <file>', 'deploy generated docker compose')
  .command('stream <file>', 'starts ffmpeg stream to broadcasters specified in <file>')
  .command('utils [options]', 'various utils for quick debugging')
  .command('info <config>', 'prints list of endpoints of deployed services')
  .command('down [name]', 'runs `docker-compose down` or removes VMs in cloud')
  .command('update [name]', 'runs `docker-compose down` and `docker-compose up` for local deployments\nor `docker stack deploy` for cloud deployment')

program
  .command('port [name] [lpnode]')
  .description('get forwarded port for a livepeer node')
  .option('-t, --type [type]', 'which port (cli, rtmp, http)?')
  .action((name, lpnode, env) => {
    // console.log(name, lpnode, env.type)
    parseDockerCompose(name, (err, experiment) => {
      if (err) throw err
      let port = null
      let serviceName = lpnode
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

program
  .command('disrupt [name] [group]')
  .description('uses pumba to kill containers in a specified livepeer group randomly')
  .option('-i --interval <interval>', 'recurrent interval for chaos command; use with optional unit suffix: \'ms/s/m/h\'')
  .action((name, group, env) => {
    parseDockerCompose(name, async (err, experiment) => {
      if (err) throw err
      const outputBuf = await utils.remotelyExec(`${name}-manager`, experiment.services.geth.labels.zone || 'us-east-1b',
        `sudo docker service create \
          --name pumba --network testnet \
          --mode global \
          --mount type=bind,source=/var/run/docker.sock,destination=/var/run/docker.sock \
          gaiaadm/pumba:latest \
          --interval ${env.interval || '20s'} \
          --random \
          stop \
          re2:livepeer_${group}_*`)
      console.log('pumba deployed', (outputBuf) ? outputBuf.toString() : null)
      process.exit()
    })
  })
// disrupt orchs in group o_b


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
