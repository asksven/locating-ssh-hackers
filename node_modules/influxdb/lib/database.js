var Connection = require('./connection')
var Series = require('./series')
var utils = require('./utils')
var User = require('./user')
var url = require('url')

module.exports = Database

function Database (name, connection) {
  this.name = name
  this.connection = connection || new Connection
}

Database.prototype.series = function (name) {
  return new Series(name, this)
}

Database.prototype.save = function (options, fn) {
  var database = this
  
  if (typeof options !== 'object') {
    fn = options
    options = {}
  }

  var req = utils.request({
    method: 'POST'
    , url: utils.url(this.connection, 'db')
    , qs: utils.qs(this.connection, options)
    , json: {
      name: this.name
    }
  })

  return utils.maybeCall(fn, function (fn) {
    return req(function (err, res) {
      if (err) {
        fn(err)
        return
      }

      fn(null, database)
    })
  })
}

Database.prototype.drop = function (fn) {
  var req = utils.request({
    method: 'DELETE'
    , url: utils.url(this.connection, 'db/' + this.name)
    , qs: utils.qs(this.connection)
  })

  return utils.maybeCall(fn, req)
}

/**
 * Users
 */

Database.prototype.user = function (username, password) {
  return new User(username, password, this)
}

/**
 * Points
 */

Database.prototype.writePoints = function (points, options, fn) {
  if (typeof options !== 'object') {
    fn = options
    options = {}
  }

  var req = utils.request({
    method: 'POST'
    , uri: utils.url(this.connection, 'db/' + this.name + '/series')
    , qs: utils.qs(this.connection, options)
    , json: points
  })

  return utils.maybeCall(fn, req)
}

Database.prototype.writePoint = function (point, options, fn) {
  return this.writePoints([point], options, fn)
}

Database.prototype.deletePoints = function (options, fn) {
  var req = utils.request({
    method: 'DELETE'
    , uri: utils.url(this.connection, 'db/' + this.name + '/series')
    , qs: utils.qs(this.connection, options)
    , json: true
  })

  return utils.maybeCall(fn, req)
}

/**
 * Scheduled deletes
 */

Database.prototype.scheduledDelete = function (options) {
  return new ScheduledDelete(options, this)
}

Database.prototype.getScheduledDeletes = function (fn) {
  return ScheduledDelete.all(this, fn)
}

/**
 * Querying
 */

Database.prototype.query = function (query, options, fn) {
  if (typeof options !== 'object') {
    fn = options
    options = {}
  }

  options.q = query

  var req = utils.request({
    url: utils.url(this, 'db/' + this.name + '/series')
    , qs: utils.qs(this.connection, options)
    , json: true
  })

  return utils.maybeCall(fn, req)
}

/**
 * Find all databases
 */

Database.all = function (connection, fn) {
  var req = utils.request({
    url: utils.url(connection, 'dbs')
    , qs: utils.qs(connection)
    , json: true
  })

  return utils.maybeCall(fn, function (fn) {
    return req(function (err, res) {
      if (err) {
        fn(err, res.body)
        return
      }

      fn(err, res.body.map(function (db) {
        return new Database(db.name)
      }))
    })
  })
}
