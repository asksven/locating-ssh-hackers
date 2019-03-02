var utils = require('./utils')

module.exports = User

function User (username, password, database) {
  this.username = username
  this.password = password
  this.database = database
}

User.prototype.save = function (fn) {
  var db = this.database

  var req = utils.request({
    method: 'POST'
    , url: utils.url(db.connection, 'db/' + db.name + '/users')
    , qs: utils.qs(db.connection)
    , json: {
      username: this.username
      , password: this.password
    }
  })

  return utils.maybeCall(fn, req)
}

User.prototype.promote = function (username, fn) {
  return edit(this.database, username, true, fn)
}

User.prototype.demote = function (username, fn) {
  return edit(this.database, username, false, fn)
}

/**************************** HELPER FUNCTIONS ********************************/

function edit (database, username, isAdmin, fn) {
  var db = database

  var req = utils.request({
    method: 'POST'
    , url: utils.url(db.connection, 'db/' + db.name + '/users/' + username)
    , qs: utils.qs(db.connection)
    , json: { admin: isAdmin }
  })

  return utils.maybeCall(fn, req)
}
