// import ethUtil from 'ethereumjs-util'
// import ethAbi from 'ethereumjs-abi'
const { spawn } = require('child_process')
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

module.exports = {contractId, functionSig, functionEncodedABI, remotelyExec}
