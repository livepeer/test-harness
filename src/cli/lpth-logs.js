
const program = require('commander')
const chalk = require('chalk')
const { parseConfigFromCommandLine } = require('./helpers.js')
const Swarm = require('../swarm')
const fs = require('fs')


program
  .description('Save logs for all services to files')

program
  .parse(process.argv)

const { configName, parsedCompose } = parseConfigFromCommandLine(program)

async function run() {
  if (parsedCompose.isLocal) {
    console.log('This command only works for cloud deployments')
    return
  }
  console.log(chalk.magentaBright('Saving logs for ' + chalk.green(configName)))

  const managerName = `${configName}-manager`
  const swarm = new Swarm(configName)

  for (let [serviceName, machine] of parsedCompose.service2Machine) {
    console.log(`Saving logs for ${chalk.yellowBright(serviceName)} from ${chalk.green(machine)}`)
    const outfn = `${configName}.${serviceName}.stdout.txt`
    const errfn = `${configName}.${serviceName}.stderr.txt`
    const outfd = fs.openSync(outfn, 'w');
    const errfd = fs.openSync(errfn, 'w');
    await swarm.saveLogs('livepeer_' + serviceName, managerName, outfd, errfd)
    if (fs.statSync(outfn).size) {
      console.log(`Stdout for ${chalk.yellowBright(serviceName)} saved to ${chalk.green(outfn)}`)
    } else {
      fs.unlinkSync(outfn)
    }
    if (fs.statSync(errfn).size) {
      console.log(`Stderr for ${chalk.yellowBright(serviceName)} saved to ${chalk.green(errfn)}`)
    } else {
      fs.unlinkSync(errfn)
    }
  }
}

run().catch(console.error)
