
const Swarm = require('./swarm')
const Api = require('./api')
const { getNames, getServiceConstraints } = require('./utils/helpers')

async function prettyPrintDeploymentInfo(workers, configName, parsedCompose) {
  const swarm = new Swarm(configName)
  const managerIP = await swarm.getPubIP(`${configName}-manager`)
  const workersIPS = await Promise.all(workers.map(wn => swarm.getPubIP(wn)))
  // console.log(`Workers public ips is "${workersIPS}"`)
  const worker2IP = workers.reduce((a, v, i) => a.set(v, workersIPS[i]), new Map())
  // console.log(worker2IP)
  const worker1IP = workersIPS[0]
  // console.log(JSON.stringify(parsedCompose, null, 2))

  const api = new Api(parsedCompose)
  const oPorts = await api.getPortsArray(['orchestrators'])
  const bPorts = await api.getPortsArray(['broadcasters'])
  // console.log('==== ports for orchestrators:', oPorts)
  const getIp = sn => {
    return worker2IP.get(getConstrain(parsedCompose.services[sn])) || worker1IP
  }
  console.log('==================================================================================')
  oPorts.forEach(po => {
    // console.log(`${worker1IP}`)
    console.log(`===== ${po.name}:`)
    console.log(`./livepeer_cli -host ${getIp(po.name)} -http ${po['7935']}`)
  })

  // console.log('==== ports for broadcasters:', bPorts)
  bPorts.forEach(po => {
    // console.log(`${worker1IP}`)
    const ip = getIp(po.name)
    console.log(`===== ${po.name}:`)
    console.log(`./livepeer_cli -host ${ip} -http ${po['7935']}`)
    console.log(`curl http://${ip}:${po['7935']}/status`)
    console.log(`curl http://${ip}:${po['8935']}/stream/current.m3u8`)
    console.log(`curl http://${ip}:${po['8935']}/stream/customManifestID.m3u8`)
    console.log(`RTMP ingest point: rtmp://${ip}:${po['1935']}/anything?manifestID=customManifestID`)
  })
  console.log(`\nMetrics server: http://${managerIP}:3000`)
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
  prettyPrintDeploymentInfo
}
