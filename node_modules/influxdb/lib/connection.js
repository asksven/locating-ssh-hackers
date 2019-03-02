var ClusterAdmin = require('./cluster_admin')
var Database = require('./database')
var utils = require('./utils')

module.exports = Connection

function Connection (host, port) {
  if ( ! (this instanceof Connection)) {
    return new Connection(host, port)
  }

  this.host = host || 'localhost'
  this.port = port || 8086
  this.auth()
}

Connection.prototype.auth = function (username, password) {
  this.username = username || 'root'
  this.password = password || 'root'
  return this
}

/**
 * Cluster admins
 */

Connection.prototype.clusterAdmin = function (username, password) {
  return new ClusterAdmin(username, password, this)
}

/**
 * Databases
 */

Connection.prototype.database = function (name) {
  return new Database(name, this)
}

Connection.prototype.databases = function (fn) {
  return Database.all(this, fn)
}
