#!/usr/bin/env node

const program = require('commander')
const chalk = require('chalk')
const axios = require('axios')
const { parseConfigFromCommandLine } = require('./helpers.js')
// const { prettyPrintDeploymentInfo } = require('../helpers')
const Swarm = require('../swarm')
const Api = require('../api')

async function checkAndPrint(typ, name, url) {
  let status = chalk.green('OK')
  try {
    const res = await axios.get(url)
    // console.log(res)
    if (res.status !== 200) {
      chalk.yellowBright(res.statusText)
    }
  } catch (err) {
    // console.log(err.code)
    status = chalk.red(err.code || 'DEAD')
  }
  console.log(`====> ${typ} ${chalk.yellowBright(name)} is ${status}`)
}

function countTranscodersForO(config, oName) {
  let count = 0
  const o2t = config.o2t || {}
  for (let tName in o2t) {
    if (o2t[tName] === oName) {
      count++
    }
  }
  return count
}

async function run(parsedCompose) {
  // await prettyPrintDeploymentInfo(parsedCompose)
  const api = new Api(parsedCompose)
  const swarm = new Swarm(parsedCompose.configName, parsedCompose.config)
  const oPorts = await api.getPortsArray(['orchestrators'])
  const bPorts = await api.getPortsArray(['broadcasters'])
  const tPorts = await api.getPortsArray(['transcoders'])
  const sPorts = await api.getPortsArray(['streamers'])
  const c = chalk.cyan
  // console.log('==================================================================================')
  // console.log(oPorts)
  // console.log(parsedCompose.config)
  for (let po of oPorts) {
    const { ip } = await Swarm.getPublicIPOfService(parsedCompose, po.name)
    const url = `http://${ip}:${po['7935']}/status`
    let status = chalk.green('OK')
    try {
      const res = await axios.get(url)
      // console.log(res)
      if (res.status !== 200) {
        chalk.yellowBright(res.statusText)
      } else {
        const hasTs = res.data.RegisteredTranscoders.length
        const shouldTs = countTranscodersForO(parsedCompose.config, po.name)
        if (hasTs != shouldTs) {
          status = `orchestrator active, but is shoud have ${chalk.yellowBright(shouldTs)} transcoders connected, but has only ${chalk.red(hasTs)}`
        }
      }
    } catch (err) {
      // console.log(err.code)
      status = chalk.red(err.code || 'DEAD')
    }
    console.log(`====> ${chalk.yellowBright(po.name)} is ${status}`)
  }
  for (let po of bPorts) {
    const { ip } = await Swarm.getPublicIPOfService(parsedCompose, po.name)
    const url = `http://${ip}:${po['7935']}/status`
    await checkAndPrint('broadcaster', po.name, url)
  }
  for (let po of sPorts) {
    const { ip } = await Swarm.getPublicIPOfService(parsedCompose, po.name)
    const url = `http://${ip}:${po['7934']}/stats`
    await checkAndPrint('streamer', po.name, url)
  }
}

program
  .parse(process.argv)

const { parsedCompose } = parseConfigFromCommandLine(program)

run(parsedCompose).catch(console.error)
