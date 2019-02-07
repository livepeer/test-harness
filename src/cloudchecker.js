'use strict'

const axios = require('axios')
const m3u8Parser = require('m3u8-parser')
const { URL } = require('url')
const path = require('path')
// Imports the Google Cloud client library
const {Storage} = require('@google-cloud/storage')
const chalk = require('chalk')


const mtext = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:PROGRAM-ID=0,BANDWIDTH=4000000,RESOLUTION=1120x700
customManifestID/source.m3u8`

const idMatch = new RegExp('.*\/stream\/(.*)[.]m3u8')
/**
 *  Checks transcoded data in cloud (Google Cloud Storage currently)
 *  Currently checks:
 *    - if transcoded segments are present
 *    - if transcoded segments size greater than zero
 *    - if number of transcoded segments match to number of source segments
 *    - if source segments are continiously numbered, without gaps
*/
class CloudChecker {
  constructor(configName, urls2check) {
    this.configName = configName
    this.urls2check = urls2check
    this.bucketName = null
    this.v = false
  }

  /**
   *  Requests manifest from first url (must be called when stream still running,
   *  so manifest is availbale) and parse cloud storage location from it.
   */
  async getAndParseManifest() {
    const mainUrl = this.urls2check[0]

    const urlBase = path.dirname(mainUrl)
    if (this.v) {
      // console.log(`Requesting ${mainUrl}`)
    }
      console.log(`Requesting ${mainUrl}`)
    const resp = await axios.get(mainUrl)
    const parsedMainManifest = this._parsePanifest(resp.data)
    if (!parsedMainManifest.playlists.length) {
      throw new Error('Manifest doesn\'t contain media playlists!')
    }
    const mpuri = urlBase +'/' + parsedMainManifest.playlists[0].uri
    if (this.v) {
      console.log(`Requesting ${mpuri}`)
    }
    const mresp = await axios.get(mpuri)
    if (this.v) {
      console.log(mresp.data)
    }
    const parsedMediaManifest = this._parsePanifest(mresp.data)
    if (!parsedMediaManifest.segments.length) {
      throw new Error(`No segmen ts in source media playlist ${mpuri}`)
    }
    const segUri = parsedMediaManifest.segments[0].uri
    const parsedSegURL = new URL(segUri)
    if (this.v) {
      console.log(parsedSegURL)
    }
    if (parsedSegURL.protocol !== 'https:') {
      throw new Error(`Looks like not cloud storage URL: ${segUri}`)
    }
    if (!parsedSegURL.host.endsWith('.storage.googleapis.com')) {
      return new Error(`Segment's url ${segUri} doesn't point to Google Cloud Storage`)
    }
    const bucket = parsedSegURL.host.replace('.storage.googleapis.com', '')
    console.log(`Bucket is ${chalk.green(bucket)}`)
    const hasAccess = await this._checkAccess(bucket)
    if (!hasAccess) {
      console.log(chalk.red('No access to bucket ') + chalk.green(bucket))
      console.log(chalk.green('Please run ')  + chalk.inverse(`gsutil iam ch allUsers:objectViewer gs://${bucket}`) +
      ' to give anonymous user read access to bucket')
      throw new Error('No access:'+bucket)
    }
    this.bucketName = bucket
  }

  async _checkAccessOld(bucket) {
    // try to get list of objects in bucket, see if we have access
    let hasAccess = false
    try {
      await axios.get(`https://www.googleapis.com/storage/v1/b/${bucket}/o`)
      hasAccess = true
    } catch (e) {
      // console.warn('===== ', e.response.status)
    }
    return hasAccess
  }

  async _checkAccess (bucketName) {
    const storage = new Storage()
    const bucket = storage.bucket(bucketName)
    try {
      await bucket.getFiles('/somthinglong')
    } catch (e) {
      if (e.code === 401) {
        return false
      }
      console.log(`Unknown error accessing GCS`)
      console.error(e)
      throw e
    }
    return true
  }

  // https://lptest-fran.storage.googleapis.com/customManifestID/source/0.ts
  // curl https://www.googleapis.com/storage/v1/b/lptest-fran/o

  async doChecks(bucketName) {
    if (bucketName) {
      this.bucketName = bucketName
    }
    const ids = this._parseIDsFromURLs()
    if (ids.length != this.urls2check.length) {
      throw new Error('Can\'t parse ids from stream urls')
    }
    const results = await Promise.all(ids.map(id => {
      return this._doChecksOne(id)
    }))
    // console.log('===== results:')
    // console.log(results)
    return this._calcAverageResults(results)
  }

  _calcAverageResults (results) {
    const res = {
      id: 'all',
      success: results.reduce((a, v) => a + v.success, 0) / results.length, // overall success, percents
      badSize: results.reduce((a, v) => a + v.badSize, 0) / results.length, // segments with bad size (zero), percents
      results
    }
    return res
  }

  printResults (results) {
    results.results.forEach(this._printOne)
    console.log(chalk.bold.underline.blue('\nOverall results:'))
    this._printOne(results)
  }

  _printOne (res) {
    const c = chalk.cyan
    const cs = res.success > 95 ? chalk.green : chalk.red
    console.log(c('Results for stream ') + chalk.yellow.bold(res.id) + ' ' + c(' is ') +
      cs(res.success + '%') + c(' success rate'))
    const cb = res.badSize > 0 ? chalk.red : chalk.green
    console.log(c('It has ') + cb(res.badSize + '%') + c(' of bad segments.'))
  }

  _parseIDsFromURLs() {
    // http://localhost:9179/stream/customManifestID.m3u8
    // todo
    return this.urls2check.map(u => {
      const res = idMatch.exec(this.urls2check[0])
      return res ? res[1] : null
    }).filter(v => !!v)
    // console.log(res)
    // process.exit(1)
    // return ['customManifestID']
  }

  async _doChecksOne(id) {
    const storage = new Storage()
    const bucket = storage.bucket(this.bucketName)
    if (this.v) {
      console.log(`Loading files list from bucket ${this.bucketName} for id ${id}`)
    }
    const [files] = await bucket.getFiles({ prefix: id+'/' })
    const fn2f = new Map()
    // console.log('-=== got filest:')
    // console.log(files)
    files.forEach(file => {
      // console.log(file.name, file.metadata)
      if (this.v) {
        console.log(file.name)
      }
      fn2f.set(file.name, file)
    })
    const sourceFiles = files.filter(f => f.name.startsWith(`${id}/source/`))
    const profiles = new Set()
    files.forEach(f => {
      const fnp = f.name.split('/')
      if (fnp[1] !== 'source') {
        profiles.add(fnp[1])
      }
    })
    const result = {
      id,
      success: 0, // overall success, percents
      badSize: 0, // segments with bad size (zero), percents
    }
    console.log(`Got ${sourceFiles.length} source segments`)
    console.log(`Found ${profiles.size} transcoded profiles`, profiles)
    if (profiles.size === 0) {
      console.log(chalk.red(`Zero success - no transcoded data for ${chalk.green(id)} at all`))
      return result
    }
    let transcodedFilesNum = 0
    let badSizeNum = 0
    for (let profile of profiles.keys()) {
      const profileFiles = files.filter(f => f.name.startsWith(`${id}/${profile}/`))
      transcodedFilesNum += profileFiles.length
      const badSizeFiles = files.filter(f => f.name.startsWith(`${id}/${profile}/`) && !+f.metadata.size)
      badSizeNum += badSizeFiles.length
    }
    result.success = transcodedFilesNum / (profiles.size * sourceFiles.length) * 100
    result.badSize = badSizeNum / transcodedFilesNum * 100
    return result
  }

  _parsePanifest(mText) {
    const parser = new m3u8Parser.Parser()
    parser.push(mText)
    parser.end()

    const parsedManifest = parser.manifest
    // console.log('========= parsed manifest:', parsedManifest)
    return parsedManifest
  }

}

function test() {
  const bucket = 'lp-rfe'
  console.log(chalk.red('No access to bucket ') + chalk.green(bucket))
  console.log(chalk.green('Please run ')  + chalk.inverse(`gsutil iam ch allUsers:objectViewer gs://${bucket}`) +
    ' to give anonymous user read access to bucket')
  return
  // const cc = new CloudChecker('test', ['http://localhost:9813/stream/customManifestID.m3u8'])
  const cc = new CloudChecker('test', ['http://localhost:9813/stream/customManifestID.m3u8'])
  // cc._parsePanifest(mtext)
  // cc.getAndParseManifest().then(console.log, console.error)
  cc.checkAccess('lptest-fran').then(console.log, console.error)
  // cc.doChecks('lptest-fran').then(console.log, console.error)
}

// test()

module.exports = CloudChecker
