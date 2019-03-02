var utils = require('./utils')

module.exports = ClusterAdmin

function ClusterAdmin (username, password, connection) {
  this.username = username
  this.password = password
  this.connection = connection
}

ClusterAdmin.prototype.save = function (fn) {
  var req = utils.request({
    method: 'POST'
    , url: utils.url(this.connection, 'cluster_admins')
    , qs: utils.qs(this.connection)
    , json: {
      username: this.username
      , password: this.password
    }
  })

  return utils.maybeCall(fn, req)
}

ClusterAdmin.prototype.setPassword = function (password, fn) {
  this.password = password

  var req = utils.request({
    method: 'POST'
    , url: utils.url(this, 'cluster_admins/' + this.username)
    , qs: utils.qs(this)
    , json: {
      password: password
    }
  })

  return utils.maybeCall(fn, req)
}

ClusterAdmin.prototype.delete = function (fn) {
  var req = utils.request({
    method: 'DELETE'
    , url: utils.url(this, 'cluster_admins/' + this.username)
    , qs: utils.qs(this)
    , json: true
  })

  return utils.maybeCall(fn, req)
}
