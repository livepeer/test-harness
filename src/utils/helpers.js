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
      if (data) {
        const trimmed = String.prototype.trim.call(data)

        console.log(`stdout: ${trimmed}`)
      
        output += data
      }
    })

    builder.stderr.on('data', (data) => {
      if (data) {
        if (data == '.') return
        const trimmed = String.prototype.trim.call(data)
        console.log(`stderr: ${trimmed}`)
      }
    })

    builder.on('message', (msg, sendHandle) => {
      console.log(`[remotelyExec] msg: ${JSON.stringify(msg)}`)
    })

    builder.on('close', (code, signal) => {
      console.log(`[remotelyExec] child process exited with code ${code} , signal: ${signal}`)
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

/**
 * copy a file between your machine and any docker-machine provisioned instance.
 * @param {string} origin source_machine:path
 * @param {string} destination destination_machine:path
 * @param {string} opts scp flags, check docker-machine scp -h for more info
 */
async function scp (origin, destination, opts) {
  return new Promise((resolve, reject) => {
    if (!opts) {
      opts = ''
    }

    exec(`docker-machine scp ${opts} ${origin} ${destination}`, (err, res) => {
      if (err) {
        reject(err)
      } else {
        resolve(res)
      }
    })
  })
}

function getSubnet (ip, range) {
  let ipArr = ip.split('.')
  if (ipArr.length !== 4) {
    throw new Error(`bad IP : ${ip} , ip.length: ${ipArr.length}`)
  }

  ipArr[3] = 0
  return `${ipArr.join('.')}/${range}`
}

/**
 * 
 * @param {string} machine docker-machine hostname
 * @param {string} zone gcp zone name
 * @param {string} interface network interface to get IP for , for example tun0
 */
async function getInterfaceIP (machine, zone, interface, cb) {
  return new Promise((resolve, reject) => {
    remotelyExec(machine, zone,
      // `ip addr show ${interface} | grep "inet\b" | awk '{print $2}' | cut -d/ -f1`
      // `ip -f inet addr show ${interface} | grep "inet\b" | awk '{print $2}' | cut -d/ -f1 `, 
      `ip -f inet addr show ${interface} | grep "inet" | awk '{$1=""; print $2}'`, 
      (err, res) => {
        if (err) {
          reject(err)
        } else {
          if (res.startsWith('undefined')) {
            res = res.slice(9, res.length - 1)
          }
          resolve(res)
        }
        console.log('-------------------------------------------------------------------------------')
        console.log('getInterfaceIP : ', res)
        console.log('-------------------------------------------------------------------------------')
        if (cb) {
          cb(err, res)
        }
      })

  })
}

function setDockerEnv (machineName, cb) {
  console.log(`executing d-m env ${machineName}`)
    exec(`docker-machine env ${machineName}`, (err, stdout) => {
      console.log(`done exec d-m env`, err, stdout)
      console.log('===')
      // if (err) throw err
      if (err) {
        console.error(err, `\nRetrying setEnv ${machineName}`)
        setDockerEnv(machineName, cb)
      } else {
        // get all the values in the double quotes
        // example env output
        // export DOCKER_TLS_VERIFY="1"
        // export DOCKER_HOST="tcp://12.345.678.90:2376"
        // export DOCKER_CERT_PATH="/machine/machines/swarm-manager"
        // export DOCKER_MACHINE_NAME="swarm-manager"
        // # Run this command to configure your shell:
        // # eval $(docker-machine env swarm-manager)

        let parsed = stdout.match(/(["'])(?:(?=(\\?))\2.)*?\1/g)
        if (parsed.length !== 4) {
          throw new Error('env parsing mismatch!')
        }
        let env = {
          DOCKER_TLS_VERIFY: parsed[0].substr(1,parsed[0].length -2),
          DOCKER_HOST: parsed[1].substr(1, parsed[1].length-2),
          DOCKER_CERT_PATH: parsed[2].substr(1, parsed[2].length-2),
          DOCKER_MACHINE_NAME: parsed[3].substr(1, parsed[3].length-2)
        }

        cb(null, env)
      }
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

function needToCreateGeth (config) {
    switch ((config.blockchain||{}).name) {
      case 'rinkeby':
      case 'mainnet':
      case 'offchain':
          // no need to run a node.
        break
      case 'lpTestNet2':
      case 'lpTestNet':
      default:
        return true
    }
    return false
}

function needToCreateGethFaucet(config) {
    if (needToCreateGeth(config) ) {
      return (config.blockchain||{}).faucet
    }
}

function needToCreateGethTxFiller(config) {
  if (needToCreateGeth(config )) {
    return (config.blockchain||{}).txFiller
  }
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
  parsedCompose.isLocalBuild =  Object.keys(parsedCompose.services).some(s => parsedCompose.services[s].image === 'localhost:5000/lpnode:latest')
  parsedCompose.hasGeth = !!parsedCompose.services.geth
  // console.log('is local:', parsedCompose.isLocal)
  parsedCompose.configName = configName
  parsedCompose.machines = {num: Object.keys(parsedCompose.services).length}
  const lsn = Object.keys(parsedCompose.services).find(sn => {
    const s = parsedCompose.services[sn]
    return !!(s && s.labels && s.labels.zone)
  })
  if (lsn) {
    const s = parsedCompose.services[lsn]
    if (s && s.labels && s.labels.zone) {
      parsedCompose.zone = s.labels.zone
      parsedCompose.machines.zone = parsedCompose.zone
    }
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

async function saveLocalDockerImage() {
  console.log('Saving locally built image to file')
  return new Promise((resolve, reject) => {
    // exec(`docker save -o /tmp/lpnodeimage.tar lpnode:latest`, (err, stdout) =>
    const cmd = 'docker save  lpnode:latest | gzip -9 > /tmp/lpnodeimage.tar.gz'
    exec(cmd, (err, stdout) => {
      if (err) return reject(err)
      console.log('lpnode image saved')
      resolve()
    })
  })
}

async function pushDockerImageToSwarmRegistry(managerName, zone) {
  console.log('Pushing image to swarm registry')
  const locTag = `sudo docker tag lpnode:latest localhost:5000/lpnode:latest && sudo docker push localhost:5000/lpnode:latest `
  await remotelyExec(managerName, zone, locTag)
}

async function loadLocalDockerImageToSwarm(swarm, managerName) {
  let err = null
  for (let i = 0; i < 10; i++) {
    try {
      await _loadLocalDockerImageToSwarm(swarm, managerName)
      return
    } catch(e) {
      console.log(e)
      err = e
    }
  }
  throw err
}

async function _loadLocalDockerImageToSwarm(swarm, managerName) {
  console.log('Loading lpnode docker image into swarm ' + managerName)
  return new Promise((resolve, reject) => {
    swarm.setEnv(managerName, (err, env) => {
      if (err) return reject(err)
      exec(`docker load -i /tmp/lpnodeimage.tar.gz`, {env}, (err, stdout) => {
        if (err) return reject(err)
        console.log('lpnode image loaded into swarm ' + managerName)
        resolve()
      })
    })
  })
}

function getRandomPort (origin) {
  let usedPorts = [8545, 8546, 30303, 8080, 3000, 3001, 3333, 9090]
  // TODO, ugh, fix this terrible recursive logic, use an incrementer like a gentleman
  let port = origin + Math.floor(Math.random() * 999)
  if (usedPorts.indexOf(port) === -1) {
    usedPorts.push(port)
    return port
  } else {
    return getRandomPort(origin)
  }
}

module.exports = {contractId, functionSig, functionEncodedABI, remotelyExec, fundAccount, fundRemoteAccount,
  getNames, spread, wait, parseComposeAndGetAddresses,
  getIds, getConstrain, needToCreateGeth, needToCreateGethFaucet, needToCreateGethTxFiller, saveLocalDockerImage, loadLocalDockerImageToSwarm, pushDockerImageToSwarmRegistry,
  scp, getInterfaceIP, getSubnet, setDockerEnv, getRandomPort
}
