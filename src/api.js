'use strict'

const request = require('request')
const { map, each, eachLimit, filter } = require('async')
const NODE_TYPES = ['broadcasters', 'transcoders', 'orchestrators']
const NODE_REGEX = {
  broadcasters: /_broadcaster_/g,
  orchestrators: /_orchestrator_/g,
  transcoders: /_transcoder_/g
}

const BASE_URL = 'localhost'
class Api {
  constructor (opts) {
    this._config = opts || {}
  }

  requestTokens (nodes, cb) {
    let endpoint = `requestTokens`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }
    this._getUrlArray(nodes, (err, urls) => {
      if (err) throw err
      eachLimit(urls, 1, (url, next) => {
        this._httpGet(`${url}/${endpoint}`, {}, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  fundDeposit (nodes, amount, cb) {
    let endpoint = `fundDeposit`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }
    let params = {
      amount: amount
    }

    this._getUrlArray(nodes, (err, urls) => {
      if (err) throw err
      eachLimit(urls, 1, (url, next) => {
        this._httpPostWithParams(`${url}/${endpoint}`, params, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  initializeRound (nodes, cb) {
    let endpoint = `initializeRound`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }

    this._getUrlArray(nodes, (err, urls) => {
      if (err) throw err
      eachLimit(urls, 1, (url, next) => {
        this._httpPost(`${url}/${endpoint}`, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  _getUrlArray (nodes, cb) {
    map(nodes, (node, n) => {
      if (node === 'all') {
        map(this._config.services, (service, next) => {
          if (service.image.startsWith('darkdragon/geth')) {
            return next()
          }
          let port = this._getPort(service.ports)
          next(null, `http://${BASE_URL}:${port}`)
        }, (err, results) => {
          if (err) throw err
          // concat this to output.
          n(null, results)
        })
      } else if (NODE_TYPES.indexOf(node) !== -1) {
        console.log('filtering out ', node)
        filter(Object.keys(this._config.services), (service, next) => {
          next(null, service.match(NODE_REGEX[node]))
        }, (err, servicesNames) => {
          if (err) throw err
          map(servicesNames, (nodeName, next) => {
            let port = this._getPort(this._config.services[nodeName].ports)
            next(null, `http://${BASE_URL}:${port}`)
          }, (err, results) => {
            if (err) throw err
            n(null, results)
          })
        })
      } else {
        let port = this._getPort(this._config.services[node].ports)
        n(null, [`http://${BASE_URL}:${port}`])
      }
    }, (err, output) => {
      if (err) throw err
      // flatten this array of arrays
      // let flattened = output.flat(1) // this is experimental.
      let flattened = [].concat.apply([], output)
      filter(flattened, (url, next) => {
        next(null, !!url)
      }, (err, trimmed) => {
        if (err) throw err
        cb(null, trimmed)
      })
    })
  }

  _getPort (portsArray) {
    return portsArray.filter((portMapping) => {
      return (portMapping.match(/:7935/g))
    })[0].split(':')[0]
  }

  _httpPostWithParams (url, params, cb) {
    request({
      headers: {
        'Content-Length': params.length,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      uri: url,
      form: params,
      method: 'POST'
    }, cb)
  }

  _httpPost (url, params, cb) {
    request({
      uri: url,
      method: 'POST'
    }, cb)
  }

  _httpGet (url, params, cb) {
    request({
      uri: url,
      method: 'GET'
    }, cb)
  }
}

module.exports = Api
