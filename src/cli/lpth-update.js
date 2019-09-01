#!/usr/bin/env node

const program = require('commander')
const path = require('path')
const { parseConfigFromCommandLine } = require('./helpers.js')
const { saveLocalDockerImage, loadLocalDockerImageToSwarm, pushDockerImageToSwarmRegistry } = require('../utils/helpers')
const dockercompose = require('docker-compose')
const NetworkCreator = require('../networkcreator')
const Swarm = require('../swarm')
const TestHarness = require('../index')
const chalk = require('chalk')

async function run(parsedCompose) {
  const name = parsedCompose.configName
  const swarm = new Swarm(name)
  const managerName = name + '-manager'
  const config = {name, local: parsedCompose.isLocal, nodes: {}, machines: parsedCompose.machines}
  const networkCreator = new NetworkCreator(config)
  if (!parsedCompose.isLocal) {
    // console.log(parsedCompose)
    if (parsedCompose.isLocalBuild) {
      await networkCreator.buildLocalLpImage()
      await saveLocalDockerImage()
      await loadLocalDockerImageToSwarm(swarm, managerName)
      await pushDockerImageToSwarmRegistry(managerName, config.machines.zone)
      console.log('docker image pushed')
    }
    const th = new TestHarness()
    console.log(`Redeploying services for ${name}`)
    await swarm.deployComposeFile(th.getDockerComposePath({name}), 'livepeer')
    process.exit(0)
  }
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
