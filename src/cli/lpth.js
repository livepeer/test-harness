#!/usr/bin/env node

const program = require('commander')
const fs = require('fs')
const path = require('path')
const NetworkCreator = require('../networkcreator')
const dockercompose = require('docker-compose')

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
  .command('stream <file>', 'starts ffmpeg stream to broadcasters specified in <file>')
  .command('utils [options]', 'various utils for quick debugging')

program
  .command('down [name]')
  .description('stops and removes docker-compose services.')
  .action((name) => {
    fs.access(path.resolve(__dirname, `../../dist/${name}/docker-compose.yml`), (err) => {
      if (err) {
        console.log(`experiment ${name} doesn't exist in the ./dist folder`)
      }

      dockercompose.down({
        cwd: path.resolve(__dirname, `../../dist/${name}/`),
        logs: true
      }).then((logs) => {
        console.log(logs)
        console.log(`experiment ${name} services stopped.`)
      })
    })
  })
program.parse(process.argv)
