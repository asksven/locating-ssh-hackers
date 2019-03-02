module.exports = Series

function Series (name, database) {
  this.database = database
  this.name = name
}

Series.prototype.writePoint = function (point, options, fn) {
  return this.writePoints([point], options, fn)
}

Series.prototype.writePoints = function (points, options, fn) {
  for (var i = 0; i < points.length; i++) {
    points[i].name = this.name
  }

  return this.database.writePoints(points, options, fn)
}

Series.prototype.deletePoints = function (options, fn) {
  options.name = this.name
  delete options.regex
  return this.database.deletePoints(options, fn)
}
