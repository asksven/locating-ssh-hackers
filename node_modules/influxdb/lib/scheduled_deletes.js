var utils = require('./utils')

module.exports = ScheduledDelete

function ScheduledDelete (options, database) {
  options = options || {}
  this.database = database

  if (typeof options === 'number') {
    this.id = options
  } else {
    this.id = options.id
    this.regex = options.regex
    this.olderThan = options.olderThan
    this.runAt = options.runAt
  }
}

ScheduledDelete.prototype.save = function (fn) {
  var db = this.database

  var req = utils.request({
    method: 'POST'
    , uri: utils.url(db.connection, 'db/' + db.name + '/scheduled_deletes')
    , qs: utils.qs(db.connection)
    , json: {
      regex: this.regex
      , olderThan: this.olderThan
      , runAt: this.runAt
    }
  })

  return utils.maybeCall(fn, req)
}

ScheduledDelete.prototype.delete = function (fn) {
  var db = this.database

  if ( ! this.id) {
    return utils.maybeCall(fn, function (fn) {
      fn(new Error('No id set'))
    })
  }

  var req = utils.request({
    method: 'DELETE'
    , uri: utils.url(db.connection, 'db/' + db.name + '/scheduled_deletes/' + this.id)
    , qs: utils.qs(db.connection)
    , json: true
  })

  return utils.maybeCall(fn, req)
}


ScheduledDelete.all = function (db, fn) {
  var req = utils.request({
    method: 'GET'
    , uri: utils.url(db.connection, 'db/' + db.name + '/scheduled_deletes')
    , qs: utils.qs(db.connection)
    , json: true
  })

  return utils.maybeCall(fn, function (fn) {
    return req(function (err, res) {
      if (err) {
        fn(err, res.body)
        return
      }

      fn(err, res.body.map(function (scheduledDelete) {
        return new ScheduledDelete(scheduledDelete)
      }))
    })
  })
}
