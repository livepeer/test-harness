#!/usr/bin/env node

const program = require('commander')
const chalk = require('chalk')
const { parseConfigFromCommandLine } = require('./helpers.js')
const { prettyPrintDeploymentInfo } = require('../helpers')
const { spawn, exec, spawnSync } = require('child_process')
const Swarm = require('../swarm')

/*
./test-harness ssh dzones manager
./test-harness ssh dzones worker-1
./test-harness ssh dzones dzones-worker-1
./test-harness ssh dzones o_a_0
./test-harness ssh dzones o_b_0
./test-harness ssh dzones broadcasters_0
./test-harness ssh dzones streamer_broadcasters_1
*/

async function run(program, parsedCompose) {
  const configName = parsedCompose.configName
  if (parsedCompose.isLocal) {
    console.log(`Meaningless for local deployments.`)
    process.exit(1)
  }
  if (program.args.length !== 2) {
    console.log(`Invalid usage. Use ./test-harness ssh config_name vm_or_service_name`)
    process.exit(1)
  }
  if (!parsedCompose.config || !parsedCompose.config.context) {
    console.log(`Not working with old deployments. Please redeploy.`)
    process.exit(23)
  }
  const context = parsedCompose.config.context
  let vmName = program.args[1]
  const swarm = new Swarm(configName, parsedCompose.config)
  const machines = await swarm.getRunningMachinesList(configName)
  if (!machines.length) {
    console.log(`No running machines found.`)
    process.exit(22)
  }
  if (!machines.includes(vmName)) {
    let nvm = configName + '-' + vmName
    const workerName = configName + '-' + 'worker-' + vmName
    if (machines.includes(nvm)) {
      vmName = nvm
    } else if (machines.includes(workerName)) {
      vmName = workerName
    } else if (context._serviceConstraints[vmName]) {
      vmName = context._serviceConstraints[vmName]
    } else {
      console.log(`Can't find VM or service with name ${chalk.yellowBright(vmName)}.`)
      process.exit(24)
    }
  }

  console.log(`Connecting to ${chalk.green(vmName)}...`)
  const isInsideCloud = await swarm._cloud.isInsideCloud()
  const managerName = configName + '-manager'
  const managerZone = context.machine2zone[managerName]
  const zone = context.machine2zone[vmName]
  let args
  if (isInsideCloud) {
    args = ['compute', 'ssh', '--zone', zone, '--internal-ip', vmName]
  } else {
    if (context.machine2ip[vmName].hasExternalIP) {
      args = ['compute', 'ssh', '--zone', zone, vmName]
    } else {
      args = ['compute', 'ssh', '--zone', managerZone, managerName, '--', `/snap/bin/gcloud compute ssh --zone ${zone} --internal-ip ${vmName}`]
      console.log(args)
    }
  }
  //   const args = ['compute', 'ssh', '--zone', 'us-central1-b', 'ivan-workstation']
  //   const args = ['compute', 'ssh', '--zone', 'us-central1-b', 'ivan-workstation', '--', '/snap/bin/gcloud compute ssh --zone europe-west1-b --internal-ip d100real-manager']
  // //   const args = ['compute', 'ssh', '--zone', 'europe-west1-b', '--internal-ip', 'd100real-manager']
  // let builder = spawn('gcloud', args, { stdio: 'inherit', detached: true })
  //   let builder = spawnSync('gcloud', ['compute', 'ssh', '--zone', 'us-central1-b', 'ivan-workstation'], { stdio: 'inherit' })
  spawnSync('gcloud', args, { stdio: 'inherit' })
}

program
  .parse(process.argv)

const { parsedCompose } = parseConfigFromCommandLine(program)

run(program, parsedCompose).catch(console.error)
