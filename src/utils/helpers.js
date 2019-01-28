// import ethUtil from 'ethereumjs-util'
// import ethAbi from 'ethereumjs-abi'
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

function remotelyExec (machineName, command, cb) {
  // reference : https://stackoverflow.com/a/39104844
  let args = [
    'compute',
    'ssh',
    machineName,
    '--zone',
    'us-east1-b',
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
  exec(`docker exec ${containerId} geth --exec 'eth.sendTransaction({from: eth.accounts[0], to: "${address}", value: web3.toHex(web3.toWei("${valueInEth}", "ether"))})' attach`,
  (err, stdout, stderr) => {
    if (err) throw err
    console.log('stdout: ', stdout)
    console.log('stderr: ', stderr)
    cb(null, stdout)
  })
}

function fundRemoteAccount (name, address, valueInEth, serviceName, cb) {
  // NOTE: this requires the geth container to be running and account[0] to be unlocked.
  remotelyExec(
    `${name}-manager`,
    `sudo docker exec livepeer_geth.1.$(sudo docker service ps -q livepeer_geth) geth --exec 'eth.sendTransaction({from: eth.accounts[0], to: "${address}", value: web3.toHex(web3.toWei("${valueInEth}", "ether"))})' attach`,
  (err, stdout, stderr) => {
    if (err) throw err
    console.log('stdout: ', stdout)
    console.log('stderr: ', stderr)
    cb(null, stdout)
  })
}
module.exports = {contractId, functionSig, functionEncodedABI, remotelyExec, fundAccount, fundRemoteAccount}
