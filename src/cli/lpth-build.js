#!/usr/bin/env node

const program = require('commander')
const fs = require('fs')
const path = require('path')
const NetworkCreator = require('../networkcreator')

function parsePath (val) {
  console.log('VAL: ', val)
  if (!val) {
    val = path.resolve(__dirname, '../../config.toml')
  }
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
  console.error('TOML config file required, using default config.toml....')
  configFile = path.relative(__dirname, '../../config.toml')
} else {
  configFile = configFile[0]
}

if (!program.output || program.output === '') {
  program.output = '.'
}

const nc = new NetworkCreator(parsePath(configFile), true) // true for toml
nc.generateComposeFile(program.output, (err) => {
  if (err) throw err
  console.log('all good...building LPNODE image')
  nc.loadBinaries('./containers/lpnode/binaries', (err, stdout) =>{
    if (err) throw err
    nc.buildLpImage((err, stdout) =>{
      if (err) throw err
      console.log('image built')
      process.exit()
    })
  })
})
