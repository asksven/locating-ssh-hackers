var request = require('request')
var url = require('url')

exports.request = function (opts) {
  return function (done) {
    request(opts, function (err, res, body) {
      if (err) return done(err)

      if (res.statusCode < 200 || res.statusCode >= 300) {
        return callback(new Error(body))
      }

      res.body = body
      done(err, res)
    })
  }
}

exports.url = function (connection, database) {
  return url.format({
    protocol: 'http:'
    , hostname: connection.host
    , port: connection.port
    , pathname: database
  })
}

exports.qs = function (connection, query) {
  query = query || {}
  query.u = query.u || connection.username
  query.p = query.p || connection.password
  return query
}

exports.maybeCall = function (expected, callback) {
  if (typeof expected === 'function') {
    callback(expected)
  } else {
    return callback
  }
}
