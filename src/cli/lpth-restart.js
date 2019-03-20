#!/usr/bin/env node

const program = require('commander')
const path = require('path')
const { parseConfigFromCommandLine } = require('./helpers.js')
const dockercompose = require('docker-compose')
const NetworkCreator = require('../networkcreator')
const chalk = require('chalk')

async function run(parsedCompose) {
  const name = parsedCompose.configName
  if (!parsedCompose.isLocal) {
      console.log(chalk.red('Can be used only on local deployments'))
      process.exit(14)
  }
  const networkCreator = new NetworkCreator({name, local: true})
  console.log('Running docker-compose down...')
  let logs = await dockercompose.execCompose('down', [], {
    cwd: path.resolve(__dirname, `../../dist/${name}/`),
    logs: true,
  })
  console.log(logs)
  console.log(`experiment ${name} services stopped.`)
  await networkCreator.buildLocalLpImage()
  logs = await dockercompose.upAll({
    cwd: path.resolve(__dirname, `../../dist/${name}/`),
    logs: true,
  })
  console.log(logs)
  console.log(`experiment ${name} services started.`)
  process.exit(0)
}

program
  .parse(process.argv)

const { parsedCompose } = parseConfigFromCommandLine(program)

run(parsedCompose).catch(console.error)
