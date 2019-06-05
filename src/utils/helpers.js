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
  return new Promise((resolve, reject) => {
    let args = [
      'compute',
      'ssh',
      machineName,
      '--zone',
      zone || 'us-east1-b',
      '--',
    ]
    args.push(command)

    console.log('gcloud ' + args.join(' '))
    console.log(`Running remote command '${command}'`)
    let builder = spawn('gcloud', args)
    let output

    builder.stdout.on('data', (data) => {
      const trimmed = String.prototype.trim(data)
      if (trimmed) {
        console.log(`stdout: ${trimmed}`)
      }
      output += data
    })

    builder.stderr.on('data', (data) => {
      if (data == '.') return
      const trimmed = String.prototype.trim(data)
      if (trimmed) {
        console.log(`stderr: ${trimmed}`)
      }
    })

    builder.on('close', (code) => {
      console.log(`[remotelyExec] hild process exited with code ${code}`)
      setTimeout(() => {
        if (code) {
          reject(code)
        } else {
          resolve(output)
        }
        if (cb) {
          cb(null, output)
        }
      }, 1)
    })
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
  // without running this first, `gcloud` gives me strange error on some deployments
  remotelyExec(
    `${config.name}-manager`, config.machines.zone,
    `cat /etc/hostname`,
  (err, stdout, stderr) => {

  remotelyExec(
    `${config.name}-manager`, config.machines.zone,
    `sudo docker exec livepeer_geth.1.$(sudo docker service ps -q livepeer_geth) geth --exec 'eth.sendTransaction({from: eth.accounts[0], to: "${address}", value: web3.toHex(web3.toWei("${valueInEth}", "ether"))})' attach`,
  (err, stdout, stderr) => {
    if (err) return cb(err)
    console.log('stdout: ', stdout)
    console.log('stderr: ', stderr)
    cb(null, stdout)
  }).catch(e => console.log(e))
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
  const g = parsedCompose.services.geth
  if (g && g.labels && g.labels.zone) {
    parsedCompose.zone = g.labels.zone
  }
  const usedWorkers = new Set()
  const service2Machine = new Map()
  for (let sn of Object.keys(parsedCompose.services)) {
    if (sn === 'prometheus') {
      parsedCompose.hasMetrics = true
    }
    const cs = getConstrain(parsedCompose.services[sn])
    // console.log('sn:', sn, cs)
    if (cs) {
      usedWorkers.add(cs)
      service2Machine.set(sn, cs)
    }
  }
  parsedCompose.usedWorkers = Array.from(usedWorkers.values())
  parsedCompose.usedWorkers.sort()
  parsedCompose.service2Machine = service2Machine
  return parsedCompose
}

function getConstrain(service) {
  const cs = (((service.deploy||{}).placement||{}).constraints||[])
    .filter(v => v.startsWith('node.hostname'))
  if (cs.length) {
    return cs[0].replace('node.hostname', '').replace('==', '').trim()
  }
  return ''
}


function getIds (configName, num) {
  // livepeer client doesn't like periods and slashes in ids
  const n = configName.replace(new RegExp('[.\/]', 'g'), '')
  let u = process.env.USER
  if (u) {
    u += '-'
  }
  const d = (+new Date() - 1500000000000)/1000|0
  return Array.from({length: num}, (_, i) => `${u}${n}-${d}-${i}`)
}

module.exports = {contractId, functionSig, functionEncodedABI, remotelyExec, fundAccount, fundRemoteAccount,
  getNames, spread, wait, parseComposeAndGetAddresses,
  getIds, getConstrain
}
