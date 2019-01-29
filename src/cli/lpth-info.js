#!/usr/bin/env node

const program = require('commander')
const { parseConfigFromCommandLine } = require('./helpers.js')
const { prettyPrintDeploymentInfo } = require('../helpers')
const Swarm = require('../swarm')

async function run(configName, parsedCompose) {
    const swarm = new Swarm(configName)
    const ri = await swarm.getRunningMachinesList(configName)
    console.log(`running machines: "${ri}"`)
    ri.sort()
    ri.splice(0, 1)
    await prettyPrintDeploymentInfo(ri, configName, parsedCompose)
}

program
  .parse(process.argv)

const { configName, parsedCompose } = parseConfigFromCommandLine(program.args)

run(configName, parsedCompose).catch(console.error)
