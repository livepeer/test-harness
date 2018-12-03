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
  .option('-c, --config [file]', 'path for specified LP TOML config', parsePath)
  .option('-o, --output [file]', 'path for docker-compose.yml file', parseOutput)
  .parse(process.argv)

console.log('---------------------')
console.log('Livepeer test-harness')
console.log('---------------------')
console.log(program.config.toString())
console.log('---------------------')

const nc = new NetworkCreator(program.config)
nc.generateComposeFile(program.output, (err) => {
  if (err) throw err
  console.log('all good...')
  process.exit()
})
