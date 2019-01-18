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
    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpGet(`http://${BASE_URL}:${port['7935']}/${endpoint}`, {}, (err, res, body) => {
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

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpPostWithParams(`http://${BASE_URL}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
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

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpPost(`http://${BASE_URL}:${port['7935']}/${endpoint}`, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  activateOrchestrator (nodes, params, cb) {
    let endpoint = `activateOrchestrator`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      // TODO, get the service URIs too.
      eachLimit(ports, 1, (port, next) => {
        params.serviceURI = `http://${port.name}:8935`
        this._httpPostWithParams(`http://${BASE_URL}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  bond (nodes, amountInWei, nodeName, cb) {
    let endpoint = `bond`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }

    let toAddr = this._getEthAddr(nodeName)
    if (!toAddr) {
      return cb(new Error(`couldn't find ${nodeName}'s ETH address'`))
    }

    console.log('bonding to ', toAddr)

    let params = {
      amount: amountInWei,
      toAddr: '0x' + toAddr
    }

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpPostWithParams(`http://${BASE_URL}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  unbond (nodes, amountInWei, cb) {
    let endpoint = `unbond`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }

    let params = {
      amount: amountInWei
    }

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpPostWithParams(`http://${BASE_URL}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  withdrawStake (nodes, unbondingLockId, cb) {
    let endpoint = `withdrawStake`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }

    let params = {
      unbondingLockId: unbondingLockId
    }

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpPostWithParams(`http://${BASE_URL}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  withdrawFees (nodes, cb) {
    let endpoint = `withdrawFees`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpPost(`http://${BASE_URL}:${port['7935']}/${endpoint}`, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  claimRewardsAndFees (nodes, endRound, cb) {
    let endpoint = `claimEarnings`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }

    let params = {
      endRound: endRound
    }

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpPostWithParams(`http://${BASE_URL}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  setBroadcastConfig (nodes, maxPricePerSegment, transcodingOptions, cb) {
    let endpoint = `setBroadcastConfig`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }

    let params = {
      maxPricePerSegment: maxPricePerSegment,
      transcodingOptions: transcodingOptions
    }

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpPostWithParams(`http://${BASE_URL}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  setGasPrice (nodes, amount, cb) {
    let endpoint = `setGasPrice`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }

    let params = {
      amount: amount
    }

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpPostWithParams(`http://${BASE_URL}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  // tickerbroker
  fundAndApproveSigners (nodes, depositAmountInWei, penaltyEscrowAmount, cb) {
    let endpoint = `fundAndApproveSigners`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }

    let params = {
      depositAmount: depositAmountInWei,
      penaltyEscrowAmount: penaltyEscrowAmount
    }

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpPostWithParams(`http://${BASE_URL}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  unlock (nodes, cb) {
    let endpoint = `unlock`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpPost(`http://${BASE_URL}:${port['7935']}/${endpoint}`, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  cancelUnlock (nodes, cb) {
    let endpoint = `cancelUnlock`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpPost(`http://${BASE_URL}:${port['7935']}/${endpoint}`, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  withdraw (nodes, cb) {
    let endpoint = `withdraw`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpPost(`http://${BASE_URL}:${port['7935']}/${endpoint}`, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  transferTokens (nodes, to, amount, cb) {
    let endpoint = `transferTokens`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }

    let params = {
      to: to,
      amount: amount
    }

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpPostWithParams(`http://${BASE_URL}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  setOrchestratorConfig (nodes, params, cb) {
    let endpoint = `setOrchestratorConfig`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }

    // refer to activateOrchestrator params in the livepeer_cli

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpPostWithParams(`http://${BASE_URL}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  callReward (nodes, cb) {
    let endpoint = `reward`
    if (!nodes) {
      return cb(new Error(`nodes array is required`))
    }

    if (!Array.isArray(nodes)) {
      nodes = [nodes]
    }

    // refer to activateOrchestrator params in the livepeer_cli

    this._getPortsArray(nodes, (err, ports) => {
      if (err) throw err
      eachLimit(ports, 1, (port, next) => {
        this._httpGet(`http://${BASE_URL}:${port['7935']}/${endpoint}`, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  _getEthAddr (serviceName) {
    let service = this._config.services[serviceName]
    if (!service) {
      return null
    }

    let parsedKey = JSON.parse(service.environment.JSON_KEY)
    return parsedKey.address
  }

  _getPortsArray (nodes, cb) {
    map(nodes, (node, n) => {
      if (node === 'all') {
        map(this._config.services, (service, next) => {
          if (service.image.startsWith('darkdragon/geth')) {
            return next()
          }
          let ports = this._getPorts(service.ports)
          next(null, ports)
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
            let ports = this._getPorts(this._config.services[nodeName].ports)
            ports.name = nodeName
            next(null, ports)
          }, (err, results) => {
            if (err) throw err
            n(null, results)
          })
        })
      } else {
        let ports = this._getPorts(this._config.services[node].ports)
        ports.name = node
        n(null, [ports])
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

  _getPorts (portsArray) {
    return {
      '7935': this._getCliPort(portsArray),
      '1935': this._getRtmpPort(portsArray),
      '8935': this._getServicePort(portsArray)
    }
  }

  _getCliPort (portsArray) {
    return portsArray.filter((portMapping) => {
      return (portMapping.match(/:7935/g))
    })[0].split(':')[0]
  }

  _getRtmpPort (portsArray) {
    return portsArray.filter((portMapping) => {
      return (portMapping.match(/:1935/g))
    })[0].split(':')[0]
  }

  _getServicePort (portsArray) {
    return portsArray.filter((portMapping) => {
      return (portMapping.match(/:8935/g))
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

  _httpPost (url, cb) {
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
