// Pick actual rendered samples, including charts with unused session slots.
function nearestIndex(points, x) {
  if (!points || !points.length || !isFinite(x)) return -1
  var nearest = 0
  for (var i = 1; i < points.length; i++) {
    if (Math.abs(points[i].x - x) < Math.abs(points[nearest].x - x)) nearest = i
  }
  return nearest
}

function measurement(series, a, b) {
  if (!series || a < 0 || b < 0 || a >= series.length || b >= series.length || a === b) return null
  var start = series[Math.min(a, b)]
  var end = series[Math.max(a, b)]
  if (typeof start.c !== 'number' || typeof end.c !== 'number' || !isFinite(start.c) || !isFinite(end.c)) return null
  var change = end.c - start.c
  return { start: start, end: end, change: change, percent: start.c !== 0 ? change / start.c * 100 : null }
}

if (typeof module !== 'undefined') module.exports = { nearestIndex: nearestIndex, measurement: measurement }
