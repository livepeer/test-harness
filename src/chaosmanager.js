const chalk = require('chalk')
const axios = require('axios')
const axe = axios.create({ timeout: 2000 })

const chaosPort = 7933

class ChaosManager {
  constructor(managerIP, chaosTasks) {
    // console.log(`new ChaosManager(${managerIP}`, chaosTasks)
    this._managereIP = managerIP
    this._chaosTasks = chaosTasks
  }

  // schedules tasks
  async schedule() {
    for (let task of this._chaosTasks) {
      await this._scheduleTask(task)
    }
  }

  async _scheduleTask(task) {
    console.log(`scheduling task `, task)
    return this.doRequest('schedule_task', 'scheduling task', task)
  }

  // starts scheduled tasks
  async start(duration = '') {
    console.log(`starting chaos tasks`)
    return await this.doRequest('start', 'starting tasks', { duration })
  }

  // starts scheduled tasks
  async clear() {
    console.log(`clearing chaos tasks`)
    return await this.doRequest('clear', 'clearing tasks')
  }

  // get stats
  async stats(raw = false) {
    const stats = await this.doRequest('stats', 'getting stats')
    if (raw) {
      return stats
    }
    // console.log('fuck got stats', stats)
    return this.formatStatsForConsole(stats)
  }

  formatStatsForConsole(stats) {
    const by_task = stats.by_task || []
    if (by_task.length == 0) {
      return chalk.yellowBright('No chaos tasks in stats.\n')
    } else if (by_task.length == 1) {
      return chalk.green('Containers removed') + ' ' + chalk.green(stats.by_task[0].containers_removed) + '\n'
    }
    let res = ''
    for (const [index, task] of by_task.entries()) {
      res += `Task ${chalk.green(index)} removed ${chalk.green(task.containers_removed)} containers\n`
    }
    res += `Totally ${chalk.green(stats.total.containers_removed)} containers removed\n`
    return res
  }

  async doRequest(endpoint, desc = '', data) {
    try {
      const method = data ? 'post' : 'get'
      const url = `http://${this._managereIP}:${chaosPort}/${endpoint}`
      const res = await axe({ method, url, data })
      if (res.status !== 200) {
        console.log(`Error ${res.status} ${desc}: `, res.data)
        process.exit(45)
      }
      // console.log('== response:' ,res.data)
      return res.data
    }
    catch (err) {
      if (err && err.response && err.response.status !== 200) {
        console.log(`${chalk.red('Error')} ${err.response.status} ${desc}`, chalk.red(err.response.data))
      } else {
        console.error(err)
      }
      process.exit(46)
    }
  }

}

module.exports = {
  ChaosManager
}
