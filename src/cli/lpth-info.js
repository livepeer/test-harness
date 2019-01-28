#!/usr/bin/env node

const program = require('commander')
const { parseConfigFromCommandLine } = require('./helpers.js')
const { prettyPrintDeploymentInfo } = require('../helpers')

async function run(configName, parsedCompose) {
    await prettyPrintDeploymentInfo(configName, parsedCompose)
}

program
  .parse(process.argv)

const { configName, parsedCompose } = parseConfigFromCommandLine(program.args)

run(configName, parsedCompose).catch(console.error)
