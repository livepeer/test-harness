#!/usr/bin/env node

const program = require('commander')
const fs = require('fs')
const path = require('path')
const NetworkCreator = require('../networkcreator')

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

program.parse(process.argv)
