#!/usr/bin/env node

const program = require('commander')
const path = require('path')
const dockercompose = require('docker-compose')

program
  .option('-s, --swarm', 'deploy using docker swarm [NOT THERE YET]')

program.parse(process.argv)

let configFile = program.args
if (!configFile) {
  console.error('dockercompose file required')
  process.exit(1)
} else {
  configFile = configFile[0]
}

dockercompose.upAll({
  cwd: path.join(configFile),
  log: true
}).then(
  (logs) => {
    console.log('done', logs)
    // TODO : ping testing SDK to indicate that the network is up and running.
    // or start another command here.
  },
  err => { console.log('something went wrong:', err.message)}
)
