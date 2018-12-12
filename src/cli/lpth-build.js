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
  .option('-o, --output [file]', 'path for docker-compose.yml file', parseOutput)
  .parse(process.argv)

let configFile = program.args
if (!configFile) {
  console.error('TOML config file required')
  process.exit(1)
} else {
  configFile = configFile[0]
}

const nc = new NetworkCreator(parsePath(configFile))
nc.generateComposeFile(program.output, (err) => {
  if (err) throw err
  console.log('all good...building LPNODE image')
  nc.loadBinaries((err, stdout) =>{
    if (err) throw err
    nc.buildLpImage((err, stdout) =>{
      if (err) throw err
      console.log('image built')
      process.exit()
    })
  })
})
