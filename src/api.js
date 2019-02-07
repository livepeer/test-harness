'use strict'

const request = require('request')
const axios = require('axios')
const { map, each, eachLimit, filter } = require('async')
const { wait } = require('./utils/helpers')

const NODE_TYPES = ['broadcasters', 'transcoders', 'orchestrators']
const NODE_REGEX = {
  broadcasters: /broadcaster_/g,
  orchestrators: /orchestrator_/g,
  transcoders: /transcoder_/g
}
const MAX_CONCURRENCY = 3

const BASE_URL = 'localhost'
class Api {
  constructor (opts, baseUrl) {
    this._config = opts || {}
    this._baseUrl = baseUrl || BASE_URL
  }

  requestTokens (nodes, cb) {
    return new Promise((resolve, reject) => {
      let endpoint = `requestTokens`
      if (!nodes) {
        const e = new Error(`nodes array is required`)
        reject(e)
        if (cb) {
          cb(e)
        }
        return
      }

      if (!Array.isArray(nodes)) {
        nodes = [nodes]
      }
      this._getPortsArray(nodes, (err, ports) => {
        if (err) throw err
        eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
          this._httpPost(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, (err, res, body) => {
            next(err, res)
          })
        }, (e, r) => {
          if (e) {
            reject(e)
          } else {
            resolve(r)
          }
          if (cb) {
            cb(e, r)
          }
        })
      })
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
      eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
        this._httpPostWithParams(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  initializeRound (nodes, cb) {
    return new Promise((resolve, reject) => {
      if (!nodes) {
        const e = new Error(`nodes array is required`)
        reject(e)
        if (cb) {
          cb(e)
        }
        return
      }
      let endpoint = `initializeRound`

      if (!Array.isArray(nodes)) {
        nodes = [nodes]
      }

      this._getPortsArray(nodes, (err, ports) => {
        if (err) throw err
        eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
          this._httpPost(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, (err, res, body) => {
            next(err, res)
          })
        }, (e, r) => {
          if (e) {
            reject(e)
          } else {
            resolve(r)
          }
          if (cb) {
            cb(e, r)
          }
        })
      })
    })
  }

  activateOrchestrator (nodes, params, cb) {
    return new Promise((resolve, reject) => {
      if (!nodes) {
        const e = new Error(`nodes array is required`)
        reject(e)
        if (cb) {
          cb(e)
        }
        return
      }
      let endpoint = `activateOrchestrator`

      if (!Array.isArray(nodes)) {
        nodes = [nodes]
      }

      this._getPortsArray(nodes, (err, ports) => {
        if (err) throw err
        // TODO, get the service URIs too.
        eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
          // console.log('== artivate for port:', port, params)
          this.initializeRound([port.name], (err) => {
            if (err) throw err
            const p = {...params, serviceURI: `https://${port.name}:8935`}
            this._httpPostWithParams(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, p, (err, res, body) => {
              next(err, res)
            })
          })
        }, (e, r) => {
          if (e) {
            reject(e)
          } else {
            resolve(r)
          }
          if (cb) {
            cb(e, r)
          }
        })
      })
    })
  }

  async waitTillAlive (nodeName) {
    const [port] = await this._getPortsArray([nodeName])
    const url = `http://${this._baseUrl}:${port['7935']}/status`
    for(let i = 0; i < 30; i++) {
      try {
        console.log(`Contacting ${url}`)
        const res = await axios.get(url)
        console.log('== got /status data: ', res.data)
        if (res.data && res.data.Manifests) {
          return true
        }
      } catch (e) {
      }
      await wait(2000)
    }
    return false
  }

  async getOrchestratorsList (nodeName) {
    // resp, err := http.Get(fmt.Sprintf("http://%v:%v/registeredOrchestrators", w.host, w.httpPort))
    try {
      const [port] = await this._getPortsArray([nodeName])
      const url = `http://${this._baseUrl}:${port['7935']}/registeredOrchestrators`
      console.log(`Contacting ${url}`)
      const res = await axios.get(url)
      console.log('== got registeredOrchestrators data: ', res.data)
      return res.data ? res.data : []
    } catch (e) {
      
    }
    return []
  }

  bond (nodes, amountInWei, nodeName, cb) {
    return new Promise((resolve, reject) => {
      if (!nodes) {
        const e = new Error(`nodes array is required`)
        reject(e)
        if (cb) {
          cb(e)
        }
        return
      }
      let endpoint = `bond`

      if (!Array.isArray(nodes)) {
        nodes = [nodes]
      }

      let toAddr = this._getEthAddr(nodeName)
      if (!toAddr) {
        const e = new Error(`couldn't find ${nodeName}'s ETH address'`)
        reject(e)
        if (cb) {
          cb(e)
        }
        return
      }

      console.log(`bonding ${nodes.join(',')} to ${nodeName}: ${toAddr}`)

      let params = {
        amount: amountInWei,
        toAddr: '0x' + toAddr
      }

      this._getPortsArray(nodes, (err, ports) => {
        if (err) throw err
        eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
          this._httpPostWithParams(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
            next(err, res)
          })
        }, (e, r) => {
          if (e) {
            reject(e)
          } else {
            resolve(r)
          }
          if (cb) {
            cb(e, r)
          }
        })
      })
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
      eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
        this._httpPostWithParams(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
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
      eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
        this._httpPostWithParams(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
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
      eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
        this._httpPost(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, (err, res, body) => {
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
      eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
        this._httpPostWithParams(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
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
      eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
        this._httpPostWithParams(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
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
      eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
        this._httpPostWithParams(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
          next(err, res)
        })
      }, cb)
    })
  }

  // tickerbroker
  fundAndApproveSigners (nodes, depositAmountInWei, penaltyEscrowAmount, cb) {
    return new Promise((resolve, reject) => {
      let endpoint = `fundAndApproveSigners`
      if (!nodes) {
        const e = new Error(`nodes array is required`)
        reject(e)
        if (cb) {
          cb(e)
        }
        return
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
        eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
          this._httpPostWithParams(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
            next(err, res)
          })
        }, (e, r) => {
          if (e) {
            reject(e)
          } else {
            resolve(r)
          }
          if (cb) {
            cb(e, r)
          }
        })
      })
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
      eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
        this._httpPost(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, (err, res, body) => {
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
      eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
        this._httpPost(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, (err, res, body) => {
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
      eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
        this._httpPost(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, (err, res, body) => {
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
      eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
        this._httpPostWithParams(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
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
      eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
        this._httpPostWithParams(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, params, (err, res, body) => {
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
      eachLimit(ports, MAX_CONCURRENCY, (port, next) => {
        this._httpGet(`http://${this._baseUrl}:${port['7935']}/${endpoint}`, (err, res, body) => {
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

  getPortsArray (nodes) {
    return this._getPortsArray(nodes)
  }

  _getPortsArray (nodes, cb) {
    return new Promise((resolve, reject) => {
      map(nodes, (node, n) => {
        if (node === 'all') {
          map(this._config.services, (service, next) => {
            if (service.image.startsWith('darkdragon/geth') ||
                service.image.startsWith('darkdragon/livepeermetrics') ||
                service.image.startsWith('mongo'))
            {
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
          // console.log('filtering ', node)
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
          resolve(trimmed)
          if (cb) {
            cb(null, trimmed)
          }
        })
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
    console.log('POST:', url, params)
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
    console.log('POST: ', url)
    request({
      uri: url,
      method: 'POST'
    }, cb)
  }

  _httpGet (url, cb) {
    console.log('GET: ', url)
    request({
      uri: url,
      method: 'GET'
    }, cb)
  }
}

module.exports = Api
