
const chalk = require('chalk')
const Swarm = require('./swarm')
const Api = require('./api')


async function prettyPrintDeploymentInfo(parsedCompose) {
  const api = new Api(parsedCompose)
  const oPorts = await api.getPortsArray(['orchestrators'])
  const bPorts = await api.getPortsArray(['broadcasters'])
  const c = chalk.cyan
  console.log('==================================================================================')
  for (let po of oPorts) {
    const ip = parsedCompose.isLocal ? 'localhost' : await Swarm.getPublicIPOfService(parsedCompose, po.name)
    console.log(`===== ${chalk.green(po.name)}:`)
    console.log(`./livepeer_cli -host ${ip} -http ${po['7935']}`)
  }

  for (let po of bPorts) {
    const ip = parsedCompose.isLocal ? 'localhost' : await Swarm.getPublicIPOfService(parsedCompose, po.name)
    console.log(`===== ${chalk.green(po.name)}:`)
    console.log(`./livepeer_cli -host ${ip} -http ${po['7935']}`)
    console.log(`curl ` + c(`http://${ip}:${po['7935']}/status`))
    console.log(`curl ` + c(`http://${ip}:${po['8935']}/stream/current.m3u8`))
    console.log(`curl ` + c(`http://${ip}:${po['8935']}/stream/customManifestID.m3u8`))
    console.log(`RTMP ingest point: ` + c(`rtmp://${ip}:${po['1935']}/anything?manifestID=customManifestID`))
  }
  const metricsIP = parsedCompose.isLocal ? 'localhost' : await Swarm.getPublicIPOfService(parsedCompose, 'metrics')
  console.log(`\nMetrics server: ` + c(`http://${metricsIP}:3000`))
}

module.exports = {
  prettyPrintDeploymentInfo
}
