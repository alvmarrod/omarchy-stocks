const test = require('node:test')
const assert = require('node:assert/strict')
const S = require('../Selection.js')
const series = [{t: 100, c: 100}, {t: 200, c: 110}, {t: 300, c: 90}]
test('gain and loss use chronological endpoints in either drag direction', () => {
  assert.equal(S.measurement(series, 0, 1).percent, 10)
  assert.equal(S.measurement(series, 0, 2).change, -10)
  assert.deepEqual(S.measurement(series, 2, 0), S.measurement(series, 0, 2))
})
test('empty, single point, stale indices and zero starting price', () => {
  assert.equal(S.measurement([], 0, 1), null)
  assert.equal(S.measurement(series, 1, 1), null)
  assert.equal(S.measurement(series, -1, 1), null)
  assert.equal(S.measurement(series, 0, 4), null)
  assert.equal(S.measurement([{t: 0,c: 0},{t: 1,c: 5}],0,1).percent,null)
})
test('selection snaps to rendered samples and clamps beyond data', () => {
  const points = [{x:4},{x:24},{x:44}]
  assert.equal(S.nearestIndex(points, -100), 0)
  assert.equal(S.nearestIndex(points, 29), 1)
  assert.equal(S.nearestIndex(points, 250), 2)
  assert.equal(S.nearestIndex([], 1), -1)
})
