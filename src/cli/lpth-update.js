#!/usr/bin/env node

const program = require('commander')
const path = require('path')
const { parseConfigFromCommandLine } = require('./helpers.js')
const dockercompose = require('docker-compose')
const NetworkCreator = require('../networkcreator')
const Swarm = require('../swarm')
const TestHarness = require('../index')
const chalk = require('chalk')

async function run(parsedCompose) {
  const name = parsedCompose.configName
  if (!parsedCompose.isLocal) {
    // console.log(parsedCompose)
    if (!parsedCompose.services.broadcaster_0.image.startsWith('livepeer/')) {
      console.log(chalk.red('Can be used only for deployments with public image.'))
      process.exit(14)
    }
    const swarm = new Swarm(name)
    const th = new TestHarness()
    console.log(`Redeploying services for ${name}`)
    await swarm.deployComposeFile(th.getDockerComposePath({name}), 'livepeer', `${name}-manager`)
    process.exit(0)
  }
  const networkCreator = new NetworkCreator({name, local: true})
  // console.log('Running docker-compose down...')
  // let logs = await dockercompose.execCompose('down', [], {
  //   cwd: path.resolve(__dirname, `../../dist/${name}/`),
  //   logs: true,
  // })
  // console.log(logs)
  // console.log(`experiment ${name} services stopped.`)
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
