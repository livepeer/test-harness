const chalk = require('chalk')
const axios = require('axios')

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
    // console.log(`host to stream: ${hostToStream} streams number: ${sim} repeat: ${repeat} duration: ${duration} latency: ${latency}`)
    console.log(`scheduling task `, task)
    try {
      const res = await axios.post(`http://${this._managereIP}:${chaosPort}/schedule_task`, task)
      if (res.status !== 200) {
        console.log(`Error ${res.status} scheduling task: `, res.data)
        process.exit(42)
      }
      // console.log('== response:' ,res.data)
      return res
    }
    catch (err) {
      if (err && err.response && err.response.status !== 200) {
        console.log(`${chalk.red('Error')} ${err.response.status} scheduling task: `, chalk.red(err.response.data))
      } else {
        console.error(err)
      }
      process.exit(41)
    }
  }

  // starts scheduled tasks
  async start() {
    console.log(`starting chaos tasks`)
    try {
      const res = await axios.get(`http://${this._managereIP}:${chaosPort}/start`)
      if (res.status !== 200) {
        console.log(`Error ${res.status} starting tasks: `, res.data)
        process.exit(44)
      }
      // console.log('== response:' ,res.data)
      return res
    }
    catch (err) {
      if (err && err.response && err.response.status !== 200) {
        console.log(`${chalk.red('Error')} ${err.response.status} starting tasks: `, chalk.red(err.response.data))
      } else {
        console.error(err)
      }
      process.exit(43)
    }
  }

  // starts scheduled tasks
  async clear() {
    console.log(`clearing chaos tasks`)
    try {
      const res = await axios.get(`http://${this._managereIP}:${chaosPort}/clear`)
      if (res.status !== 200) {
        console.log(`Error ${res.status} clearing tasks: `, res.data)
        process.exit(45)
      }
      // console.log('== response:' ,res.data)
      return res
    }
    catch (err) {
      if (err && err.response && err.response.status !== 200) {
        console.log(`${chalk.red('Error')} ${err.response.status} clearing tasks: `, chalk.red(err.response.data))
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
