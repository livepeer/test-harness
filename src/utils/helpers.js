// import ethUtil from 'ethereumjs-util'
// import ethAbi from 'ethereumjs-abi'
const fs = require('fs')
const path = require('path')
const YAML = require('yaml')
const { spawn, exec } = require('child_process')
const ethUtil = require('ethereumjs-util')
const ethAbi = require('ethereumjs-abi')

function contractId (name) {
  return ethUtil.bufferToHex(ethAbi.soliditySHA3(['string'], [name]))
}

function functionSig (name) {
  return ethUtil.bufferToHex(ethUtil.sha3(name).slice(0, 4))
}

function functionEncodedABI (name, params, values) {
  return ethUtil.bufferToHex(Buffer.concat([ethUtil.sha3(name).slice(0, 4), ethAbi.rawEncode(params, values)]))
}

function remotelyExec (machineName, zone, command, cb) {
  // reference : https://stackoverflow.com/a/39104844
  let args = [
    'compute',
    'ssh',
    machineName,
    '--zone',
    zone || 'us-east1-b',
    '--',
  ]

  args.push(command)

  let builder = spawn('gcloud', args)
  let output

  builder.stdout.on('data', (data) => {
    console.log(`stdout: ${data}`)
    output = data
  })

  builder.stderr.on('data', (data) => {
    console.log(`stderr: ${data}`)
  })

  builder.on('close', (code) => {
    console.log(`child process exited with code ${code}`)
    setTimeout(() => { cb(null, output)}, 1)
  })
}


function fundAccount (address, valueInEth, containerId, cb) {
  // NOTE: this requires the geth container to be running and account[0] to be unlocked.
  return new Promise((resolve, reject) => {
    exec(`docker exec ${containerId} geth --exec 'eth.sendTransaction({from: eth.accounts[0], to: "${address}", value: web3.toHex(web3.toWei("${valueInEth}", "ether"))})' attach`,
    (err, stdout, stderr) => {
      console.log('stdout: ', stdout)
      console.log('stderr: ', stderr)
      if (err) throw err
      if (cb) {
        cb(null, stdout)
      }
      resolve(stdout)
    })
  })
}

function fundRemoteAccount (config, address, valueInEth, serviceName, cb) {
  // NOTE: this requires the geth container to be running and account[0] to be unlocked.
  console.log(`funding ${address} with ${valueInEth} ETH`)
  remotelyExec(
    `${config.name}-manager`, config.machines.zone,
    `sudo docker exec livepeer_geth.1.$(sudo docker service ps -q livepeer_geth) geth --exec 'eth.sendTransaction({from: eth.accounts[0], to: "${address}", value: web3.toHex(web3.toWei("${valueInEth}", "ether"))})' attach`,
  (err, stdout, stderr) => {
    if (err) throw err
    console.log('stdout: ', stdout)
    console.log('stderr: ', stderr)
    cb(null, stdout)
  })
}

function getNames (prefix, num, shift = 0) {
  return Array.from({length: num}, (_, i) => `${prefix}${i+shift}`)
}

function spread (items, plts, reverse) {
  const res = new Map()
  const rres = new Map()
  for (let i = 0, oi = 0; i < items.length; i++) {
    const oname = plts[oi]
    const p = res.get(oname) || []
    p.push(items[i])
    res.set(oname, p)
    // const rp = rres.get(items[i]) || new Set()
    // rp.add(oname)
    rres.set(items[i], oname)
    oi = ++oi % plts.length
  }
  return reverse ? rres : res
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

function getServiceConstraints(workers, bs, os, ts) {
    const broadcasters = getNames('broadcaster_', bs)
    const orchestrators = getNames('orchestrator_', os)
    const transcoders = getNames('transcoder_', ts)

    return {
      broadcaster: spread(broadcasters, workers, true),
      orchestrator: spread(orchestrators, workers, true),
      transcoder: spread(transcoders, workers, true),
    }
}

function getDockerComposePath (configName) {
  return path.join(__dirname, '../../dist', configName, 'docker-compose.yml')
}

function parseComposeAndGetAddresses (configName) {
  let parsedCompose = null
  try {
    const file = fs.readFileSync(getDockerComposePath(configName), 'utf-8')
    parsedCompose = YAML.parse(file)
  } catch (e) {
    throw e
  }

  parsedCompose.addresses = Object.keys(parsedCompose.services).map(name => {
    const service = parsedCompose.services[name]
    if (service.environment && service.environment.JSON_KEY) {
      const addressObj = JSON.parse(service.environment.JSON_KEY)
      // console.log('address to fund: ', addressObj.address)
      return addressObj.address
    }
    return null
  }).filter(v => !!v)
  // console.log('addresses results: ', parsedCompose.addresses)
  parsedCompose.isLocal = parsedCompose.networks.testnet.driver === 'bridge'
  // console.log('is local:', parsedCompose.isLocal)
  parsedCompose.configName = configName
  return parsedCompose
}

module.exports = {contractId, functionSig, functionEncodedABI, remotelyExec, fundAccount, fundRemoteAccount,
  getNames, spread, wait, getServiceConstraints, parseComposeAndGetAddresses
}
