
const chalk = require('chalk')
const Swarm = require('./swarm')
const Api = require('./api')


async function prettyPrintDeploymentInfo(parsedCompose) {
  const api = new Api(parsedCompose)
  const swarm = new Swarm(parsedCompose.configName, parsedCompose.config)
  const oPorts = await api.getPortsArray(['orchestrators'])
  const bPorts = await api.getPortsArray(['broadcasters'])
  const tPorts = await api.getPortsArray(['transcoders'])
  const sPorts = await api.getPortsArray(['streamers'])
  const c = chalk.cyan
  console.log('==================================================================================')
  for (let po of oPorts) {
    const { ip, machine } = await Swarm.getPublicIPOfService(parsedCompose, po.name)
    console.log(`===== ${chalk.green(po.name)} on (${chalk.green(machine)}):`)
    console.log(`./livepeer_cli -host ${ip} -http ${po['7935']}`)
  }

  for (let po of tPorts) {
    const { ip, machine } = await Swarm.getPublicIPOfService(parsedCompose, po.name)
    console.log(`===== ${chalk.green(po.name)} on (${chalk.green(machine)}):`)
    console.log(`./livepeer_cli -host ${ip} -http ${po['7935']}`)
  }

  for (let po of bPorts) {
    const { ip, machine } = await Swarm.getPublicIPOfService(parsedCompose, po.name)
    console.log(`===== ${chalk.green(po.name)} on (${chalk.green(machine)}):`)
    console.log(`./livepeer_cli -host ${ip} -http ${po['7935']}`)
    console.log(`curl ` + c(`http://${ip}:${po['7935']}/status`))
    console.log(`curl ` + c(`http://${ip}:${po['8935']}/stream/current.m3u8`))
    console.log(`curl ` + c(`http://${ip}:${po['8935']}/stream/customManifestID.m3u8`))
    console.log(`RTMP ingest point: ` + c(`rtmp://${ip}:${po['1935']}/stream/customManifestID`))
  }

  for (let po of sPorts) {
    const { ip, machine } = await Swarm.getPublicIPOfService(parsedCompose, po.name)
    console.log(`===== ${chalk.green(po.name)} on (${chalk.green(machine)}):`)
    console.log(`curl ` + c(`http://${ip}:${po['7934']}/stats`))
  }

  if (parsedCompose.hasMetrics) {
    const { ip } = await Swarm.getPublicIPOfService(parsedCompose, 'prometheus')
    if (ip) {
      console.log(`\nPrometheus (Grafana): ` + c(`http://${ip}:3001`))
    }
  }

  if (parsedCompose.hasGeth) {
    const ethRpc = await Swarm.getPublicIPOfService(parsedCompose, 'geth')
    const ethFaucet = await Swarm.getPublicIPOfService(parsedCompose, 'gethFaucet')
    console.log(`===== ${chalk.green('Blockchain')}:`)
    console.log(`Geth JSON-RPC:  ${c(`http://${ethRpc.ip}:8545`)}`)
    console.log(`ETH Faucet:  ${c(`http://${ethFaucet.ip}:3333`)}`)
  }
}

module.exports = {
  prettyPrintDeploymentInfo
}
