const test = require("node:test")
const assert = require("node:assert/strict")
const Search = require("../Search.js")

test("searchUrl: encodes the query and asks for quotes only", () => {
  const url = Search.searchUrl("berkshire hathaway")
  assert.ok(url.startsWith(Search.SEARCH_URL + "?q=berkshire%20hathaway"))
  assert.ok(url.includes("quotesCount=12"))
  assert.ok(url.includes("newsCount=0"))
  assert.equal(Search.searchUrl("   "), "")
})

test("searchCommand: capped curl argv ends with the search URL", () => {
  const command = Search.searchCommand("AAPL", "ua")
  assert.deepEqual(command.slice(0, 4), [
    "bash",
    "-c",
    `set -o pipefail; curl "$@" | head -c ${Search.MAX_RESPONSE_BYTES}`,
    "curl"
  ])
  assert.equal(command[command.length - 1], Search.searchUrl("AAPL"))
  assert.ok(command.includes("ua"))
  assert.ok(command.includes("--max-filesize"))
})

test("parseSearch: keeps name, exchange and type, de-duplicates, upper-cases symbols", () => {
  const rows = Search.parseSearch(
    JSON.stringify({
      quotes: [
        { symbol: "aapl", shortname: "Apple Inc.", exchDisp: "NASDAQ", quoteType: "EQUITY" },
        { symbol: "AAPL", longname: "Duplicate", exchDisp: "OTHER" },
        { symbol: "APLE", longname: "Apple Hospitality", exchange: "NYQ", quoteType: "EQUITY" },
        { shortname: "No symbol" },
        null
      ]
    })
  )
  assert.deepEqual(rows, [
    { symbol: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", type: "EQUITY" },
    { symbol: "APLE", name: "Apple Hospitality", exchange: "NYQ", type: "EQUITY" }
  ])
})

test("parseSearch: empty, junk and quote-less responses return an empty list", () => {
  assert.deepEqual(Search.parseSearch(""), [])
  assert.deepEqual(Search.parseSearch("not json"), [])
  assert.deepEqual(Search.parseSearch("{}"), [])
  assert.deepEqual(Search.parseSearch('{"quotes":null}'), [])
})
