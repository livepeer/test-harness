#!/usr/bin/env node

const program = require('commander')
const path = require('path')
const { parseConfigFromCommandLine } = require('./helpers.js')
const Swarm = require('../swarm')
const dockercompose = require('docker-compose')

async function run(parsedCompose) {
  const name = parsedCompose.configName
  if (parsedCompose.isLocal) {
    console.log('Running docker-compose down...')
    const logs = await dockercompose.execCompose('down', ['-v'], {
      cwd: path.resolve(__dirname, `../../dist/${name}/`),
      logs: true,
    })
    console.log(logs)
    console.log(`experiment ${name} services stopped.`)
    process.exit(0)
  } else {
    const swarm = new Swarm(name)
    console.log(`Removing VM instances for ${name}`)
    await swarm.tearDown(name)
    console.log(`experiment ${name} VM instances removed.`)
    // todo: save email in docker compose and find back here
    const config = {
      name
    }
    await swarm.teardownGCEMonitoring(config)
  }
}

program
  .parse(process.argv)

const { parsedCompose } = parseConfigFromCommandLine(program)

run(parsedCompose).catch(console.error)
