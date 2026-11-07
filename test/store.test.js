const test = require("node:test")
const assert = require("node:assert/strict")
const Store = require("../Store.js")

function seeded() {
  return Store.emptyState(1000, () => 0.5)
}

test("emptyState: one empty watchlist, no selection, 1d range", () => {
  const state = seeded()
  assert.equal(state.version, 1)
  assert.equal(state.watchlists.length, 1)
  assert.deepEqual(state.watchlists[0].symbols, [])
  assert.equal(state.watchlists[0].name, "My Stocks")
  assert.equal(state.activeWatchlist, state.watchlists[0].id)
  assert.equal(state.selectedSymbol, "")
  assert.equal(state.chartRange, "1d")
  assert.equal(state.currency, "")
})

test("normalizeSymbols: arrays and comma strings are upper-cased and de-duplicated", () => {
  assert.deepEqual(Store.normalizeSymbols([" aapl", "NVDA", "aapl", "", null]), ["AAPL", "NVDA"])
  assert.deepEqual(Store.normalizeSymbols("aapl, nvda;btc-usd"), ["AAPL", "NVDA", "BTC-USD"])
  assert.deepEqual(Store.normalizeSymbols(null), [])
})

test("parseState: empty, junk and non-object input fall back to a default watchlist", () => {
  for (const raw of ["", "   ", "not json", "[]", "{}", "null"]) {
    const state = Store.parseState(raw, 1000, () => 0.5)
    assert.equal(state.watchlists.length, 1)
    assert.deepEqual(state.watchlists[0].symbols, [])
  }
})

test("normalizeState: repairs missing ids, active list, selection, range and currency", () => {
  const state = Store.normalizeState(
    {
      watchlists: [
        { name: "One", symbols: ["aapl", "AAPL", "msft"] },
        { id: "two", name: "Two", symbols: ["NVDA"] }
      ],
      activeWatchlist: "missing",
      selectedSymbol: "TSLA",
      chartRange: "10y",
      currency: "usd"
    },
    1000,
    () => 0.5
  )
  assert.equal(state.watchlists.length, 2)
  assert.ok(state.watchlists[0].id)
  assert.deepEqual(state.watchlists[0].symbols, ["AAPL", "MSFT"])
  assert.equal(state.activeWatchlist, state.watchlists[0].id)
  assert.equal(state.selectedSymbol, "AAPL")
  assert.equal(state.chartRange, "1d")
  assert.equal(state.currency, "USD")
})

test("normalizeState: a selected symbol outside the active list is dropped", () => {
  const state = Store.normalizeState(
    {
      watchlists: [{ id: "one", name: "One", symbols: ["AAPL"] }],
      activeWatchlist: "one",
      selectedSymbol: "NVDA"
    },
    1000,
    () => 0.5
  )
  assert.equal(state.selectedSymbol, "AAPL")
})

test("addSymbol: adds once, selects it, and never mutates the old state", () => {
  const before = seeded()
  const added = Store.addSymbol(before, " aapl ")
  assert.deepEqual(added.watchlists[0].symbols, ["AAPL"])
  assert.equal(added.selectedSymbol, "AAPL")
  assert.deepEqual(before.watchlists[0].symbols, [])
  const again = Store.addSymbol(added, "AAPL")
  assert.deepEqual(again.watchlists[0].symbols, ["AAPL"])
  assert.equal(again.selectedSymbol, "AAPL")
})

test("addSymbol: stops at MAX_SYMBOLS; duplicates still select", () => {
  const Model = require("../Model.js")
  assert.equal(Store.MAX_SYMBOLS, 30)
  assert.equal(Store.MAX_SYMBOLS, Model.MAX_FETCH_SYMBOLS)
  let state = seeded()
  for (let index = 0; index < Store.MAX_SYMBOLS; index++) state = Store.addSymbol(state, "S" + index)
  assert.equal(Store.activeSymbols(state).length, Store.MAX_SYMBOLS)
  const rejected = Store.addSymbol(state, "EXTRA")
  assert.equal(rejected, state)
  assert.equal(Store.activeSymbols(rejected).length, Store.MAX_SYMBOLS)
  const duplicate = Store.addSymbol(state, "S0")
  assert.equal(duplicate.selectedSymbol, "S0")
  assert.equal(Store.activeSymbols(duplicate).length, Store.MAX_SYMBOLS)
})

test("addSymbol: the limit is per watchlist", () => {
  let state = seeded()
  for (let index = 0; index < Store.MAX_SYMBOLS; index++) state = Store.addSymbol(state, "S" + index)
  state = Store.addWatchlist(state, "Second")
  assert.deepEqual(Store.activeSymbols(Store.addSymbol(state, "EXTRA")), ["EXTRA"])
})

test("removeSymbol: picks the next symbol, or none when the list empties", () => {
  let state = Store.addSymbol(Store.addSymbol(seeded(), "AAPL"), "NVDA")
  state = Store.selectSymbol(state, "AAPL")
  state = Store.removeSymbol(state, "AAPL")
  assert.deepEqual(state.watchlists[0].symbols, ["NVDA"])
  assert.equal(state.selectedSymbol, "NVDA")
  state = Store.removeSymbol(state, "NVDA")
  assert.deepEqual(state.watchlists[0].symbols, [])
  assert.equal(state.selectedSymbol, "")
})

test("selectSymbol: only accepts a symbol in the active watchlist", () => {
  const state = Store.addSymbol(seeded(), "AAPL")
  assert.equal(Store.selectSymbol(state, "NVDA"), state)
  assert.equal(Store.selectSymbol(state, "aapl"), state)
})

test("watchlists: add, rename, switch and delete", () => {
  let state = Store.addWatchlist(seeded(), "Tech")
  const tech = state.activeWatchlist
  assert.equal(state.watchlists.length, 2)
  assert.equal(state.watchlists[1].name, "Tech")
  assert.equal(state.selectedSymbol, "")

  state = Store.renameWatchlist(state, tech, "  Big   Tech ")
  assert.equal(Store.findWatchlist(state, tech).name, "Big Tech")

  state = Store.addSymbol(state, "NVDA")
  assert.equal(state.selectedSymbol, "NVDA")

  state = Store.setActiveWatchlist(state, state.watchlists[0].id)
  assert.equal(state.activeWatchlist, state.watchlists[0].id)
  assert.equal(state.selectedSymbol, "")

  state = Store.setActiveWatchlist(state, tech)
  assert.equal(state.selectedSymbol, "NVDA")

  state = Store.deleteWatchlist(state, tech)
  assert.equal(state.watchlists.length, 1)
  assert.equal(state.activeWatchlist, state.watchlists[0].id)
  assert.equal(state.selectedSymbol, "")
})

test("deleteWatchlist: the last watchlist cannot be removed", () => {
  const state = seeded()
  assert.equal(Store.deleteWatchlist(state, state.activeWatchlist), state)
})

test("renameWatchlist: an empty name is ignored", () => {
  const state = seeded()
  assert.equal(Store.renameWatchlist(state, state.activeWatchlist, "   "), state)
})

test("chartRange and currency normalize before saving", () => {
  let state = Store.setChartRange(seeded(), "6MO")
  assert.equal(state.chartRange, "6mo")
  assert.equal(Store.setChartRange(state, "3d").chartRange, "6mo")
  state = Store.setCurrency(state, "eur")
  assert.equal(state.currency, "EUR")
  state = Store.setCurrency(state, "native")
  assert.equal(state.currency, "")
})

test("serializeState / parseState round-trip", () => {
  let state = Store.addWatchlist(seeded(), "Tech")
  state = Store.addSymbol(state, "NVDA")
  state = Store.renameWatchlist(state, state.activeWatchlist, "Semis")
  const restored = Store.parseState(Store.serializeState(state))
  assert.deepEqual(restored, state)
  assert.ok(Store.serializeState(state).endsWith("\n"))
})

test("statePath honors XDG_STATE_HOME and falls back to HOME", () => {
  assert.equal(Store.statePath("/home/me", "/state"), "/state/omarchy/stocks/state.json")
  assert.equal(Store.statePath("/home/me", ""), "/home/me/.local/state/omarchy/stocks/state.json")
})
