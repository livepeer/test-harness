#!/home/op/.nvm/versions/node/v10.14.1/bin/node

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
  (logs) => { console.log('done', logs) },
  err => { console.log('something went wrong:', err.message)}
)
