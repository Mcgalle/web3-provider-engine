const xhr = process.browser ? require('xhr') : require('request')
const inherits = require('util').inherits
const createPayload = require('../util/create-payload.js')
const Subprovider = require('./subprovider.js')
const { errors: rpcErrors } = require('eth-json-rpc-errors')


module.exports = RpcSource

inherits(RpcSource, Subprovider)

function RpcSource(opts) {
  const self = this
  self.rpcUrl = opts.rpcUrl
}

RpcSource.prototype.handleRequest = function(payload, next, end){
  const self = this
  const targetUrl = self.rpcUrl

  // overwrite id to conflict with other concurrent users
  let newPayload = createPayload(payload)

  xhr({
    uri: targetUrl,
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(newPayload),
    rejectUnauthorized: false,
    timeout: 20000,
  }, function(err, res, body) {
    if (err) return end(rpcErrors.internal(err))

    // check for error code
    switch (res.statusCode) {
      case 405:
        return end(rpcErrors.methodNotFound())
      case 504: // Gateway timeout
        return (function(){
          let msg = `Gateway timeout. The request took too long to process. `
          msg += `This can happen when querying logs over too wide a block range.`
          return end(rpcErrors.internal(msg))
        })()
      case 429: // Too many requests (rate limiting)
        return (function(){
          const err = new Error(`Too Many Requests`)
          return end(rpcErrors.internal(err))
        })()
      default:
        if (res.statusCode != 200) {
          return end(rpcErrors.internal(res.body))
        }
    }

    // parse response
    let data
    try {
      data = JSON.parse(body)
    } catch (err) {
      console.error(err.stack)
      return end(rpcErrors.internal(err))
    }
    if (data.error) return end(data.error)

    end(null, data.result)
  })
}
