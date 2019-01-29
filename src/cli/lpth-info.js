#!/usr/bin/env node

const program = require('commander')
const { parseConfigFromCommandLine } = require('./helpers.js')
const { prettyPrintDeploymentInfo } = require('../helpers')
const Swarm = require('../swarm')

async function run(parsedCompose) {
  await prettyPrintDeploymentInfo(parsedCompose)
}

program
  .parse(process.argv)

const { parsedCompose } = parseConfigFromCommandLine(program.args)

run(parsedCompose).catch(console.error)
