
const { parseComposeAndGetAddresses } = require('../utils/helpers')

module.exports.parseConfigFromCommandLine = function (program) {
  if (program.endPoint) {
    const epp = program.endPoint.split(':')
    if (epp.length !== 3 && epp.length != 1) {
      console.error('Endpoint should consist of three parts: host, rtmp port, media port.')
      process.exit(1)
    }
    if (epp.length === 1) {
      epp.push('1935', '8935')
    }
    // make fake parsedCompose
    const parsedCompose = {
      overrideBroadcasterHost: epp[0],
      services: {
        'broadcaster_0': {
          image: '',
          ports: [
            `${epp[2]}:8935`,
            `${epp[1]}:1935`,
            '7935:7935'
          ],
          environment: {
            type: 'broadcaster'
          }
        }
      },
      isLocal: true,
      isFake: true
    }
    return {
      configName: 'fake',
      parsedCompose
    }
  }
  const args = program.args
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
