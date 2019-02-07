#!/usr/bin/env node

const program = require('commander')
const { parseConfigFromCommandLine } = require('./helpers.js')
const { prettyPrintDeploymentInfo } = require('../helpers')

async function run(parsedCompose) {
  await prettyPrintDeploymentInfo(parsedCompose)
}

program
  .parse(process.argv)

const { parsedCompose } = parseConfigFromCommandLine(program)

run(parsedCompose).catch(console.error)
