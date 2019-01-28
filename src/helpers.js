
const Swarm = require('./swarm')
const Api = require('./api')

async function prettyPrintDeploymentInfo(configName, parsedCompose) {
  const swarm = new Swarm(configName)
  const worker1IP = await swarm.getPubIP(`${configName}-worker-1`)
  console.log(`Worker 1 public ip is "${worker1IP}"`)
  const api = new Api(parsedCompose)
  const oPorts = await api.getPortsArray(['orchestrators'])
  const bPorts = await api.getPortsArray(['broadcasters'])
  // console.log('==== ports for orchestrators:', oPorts)
  console.log('==================================================================================')
  oPorts.forEach(po => {
    // console.log(`${worker1IP}`)
    console.log(`===== ${po.name}:`)
    console.log(`./livepeer_cli -host ${worker1IP} -http ${po['7935']}`)
  })

  // console.log('==== ports for broadcasters:', bPorts)
  bPorts.forEach(po => {
    // console.log(`${worker1IP}`)
    console.log(`===== ${po.name}:`)
    console.log(`./livepeer_cli -host ${worker1IP} -http ${po['7935']}`)
    console.log(`curl http://${worker1IP}:${po['7935']}/status`)
    console.log(`curl http://${worker1IP}:${po['8935']}/stream/current.m3u8`)
    console.log(`curl http://${worker1IP}:${po['8935']}/stream/customManifestID.m3u8`)
    console.log(`RTMP ingest point: rtmp://${worker1IP}:${po['1935']}/anything?manifestID=customManifestID`)
  })
  console.log(`\nMetrics server: http://${worker1IP}:3000`)
}

function wait(pauseTimeMs, suppressLogs) {
  if (!suppressLogs) {
    console.log(`Waiting for ${pauseTimeMs} ms`)
  }
  return new Promise(resolve => {
    setTimeout(() => {
      if (!suppressLogs) {
        console.log('Done waiting.')
      }
      resolve()
    }, pauseTimeMs)
  })
}

module.exports = {
  prettyPrintDeploymentInfo,
  wait
}
