
const { parseComposeAndGetAddresses } = require('../utils/helpers')

module.exports.parseConfigFromCommandLine = function (args) {
  if (!args || !args.length) {
    console.error('config name required')
    process.exit(1)
  }
  const configName = args[0]
  const parsedCompose = parseComposeAndGetAddresses(configName)
  return {
    configName,
    parsedCompose
  }
}
