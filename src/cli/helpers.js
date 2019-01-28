const fs = require('fs')
const YAML = require('yaml')
const path = require('path')

module.exports.parseConfigFromCommandLine = function (args) {
  if (!args || !args.length) {
    console.error('config name required')
    process.exit(1)
  }
  const configName = args[0]

  let parsedCompose = null
  try {
    let file = fs.readFileSync(path.resolve(__dirname, `../../dist/${configName}/docker-compose.yml`), 'utf-8')
    parsedCompose = YAML.parse(file)
  } catch (e) {
    throw e
  }
  return {
    configName,
    parsedCompose
  }
}
