
const chalk = require('chalk')
const Swarm = require('./swarm')
const Api = require('./api')


// assume for a one run we only work with one config
let service2IP = null
let worker1IP = null

async function getPublicIPOfService (parsedCompose, serviceName) {
  const configName = parsedCompose.configName
  if (!service2IP) {
    const swarm = new Swarm(configName)
    const ri = await swarm.getRunningMachinesList(configName)
    console.log(`running machines: "${ri}"`)
    ri.sort()
    // ri.splice(0, 1)
    const workersIPS = await Promise.all(ri.map(wn => swarm.getPubIP(wn)))
    const worker2IP = ri.reduce((a, v, i) => a.set(v, workersIPS[i]), new Map())
    worker1IP = workersIPS[0]
    service2IP = new Map()
    Object.keys(parsedCompose.services).forEach(sn => {
      service2IP.set(sn, worker2IP.get(getConstrain(parsedCompose.services[sn])) || worker1IP)
    })
  }
  return service2IP.get(serviceName)
}

async function prettyPrintDeploymentInfo(parsedCompose) {
  const api = new Api(parsedCompose)
  const oPorts = await api.getPortsArray(['orchestrators'])
  const bPorts = await api.getPortsArray(['broadcasters'])
  const c = chalk.cyan
  console.log('==================================================================================')
  for (let po of oPorts) {
    const ip = parsedCompose.isLocal ? 'localhost' : await getPublicIPOfService(parsedCompose, po.name)
    console.log(`===== ${chalk.green(po.name)}:`)
    console.log(`./livepeer_cli -host ${ip} -http ${po['7935']}`)
  }

  for (let po of bPorts) {
    const ip = parsedCompose.isLocal ? 'localhost' : await getPublicIPOfService(parsedCompose, po.name)
    console.log(`===== ${chalk.green(po.name)}:`)
    console.log(`./livepeer_cli -host ${ip} -http ${po['7935']}`)
    console.log(`curl ` + c(`http://${ip}:${po['7935']}/status`))
    console.log(`curl ` + c(`http://${ip}:${po['8935']}/stream/current.m3u8`))
    console.log(`curl ` + c(`http://${ip}:${po['8935']}/stream/customManifestID.m3u8`))
    console.log(`RTMP ingest point: ` + c(`rtmp://${ip}:${po['1935']}/anything?manifestID=customManifestID`))
  }
  const metricsIP = parsedCompose.isLocal ? 'localhost' : await getPublicIPOfService(parsedCompose, 'metrics')
  console.log(`\nMetrics server: ` + c(`http://${metricsIP}:3000`))
}

function getConstrain(service) {
  const cs = (((service.deploy||{}).placement||{}).constraints||[])
    .filter(v => v.startsWith('node.hostname'))
  if (cs.length) {
    return cs[0].replace('node.hostname', '').replace('==', '').trim()
  } 
  return ''
}

module.exports = {
  prettyPrintDeploymentInfo,
  getPublicIPOfService
}
