// Yahoo Finance symbol search (no API key, same host the quote fetches use).

var SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search"

function trimString(value) {
  return value === undefined || value === null ? "" : String(value).trim()
}

function searchUrl(query) {
  var q = trimString(query)
  if (q === "") return ""
  return SEARCH_URL + "?q=" + encodeURIComponent(q) + "&quotesCount=12&newsCount=0&listsCount=0"
}

// Same 1 MiB stdout cap as the quote fetch: search responses are ~3 KB, but
// a hostile body must not be buffered in the shell.
var MAX_RESPONSE_BYTES = 1024 * 1024

function searchCommand(query, userAgent) {
  var args = [
    "-sS",
    "--max-time",
    "10",
    "--max-filesize",
    String(MAX_RESPONSE_BYTES),
    "-A",
    String(userAgent || "omarchy-stocks"),
    "-w",
    "\n",
    searchUrl(query)
  ]
  return ["bash", "-c", 'set -o pipefail; curl "$@" | head -c ' + MAX_RESPONSE_BYTES, "curl"].concat(args)
}

function parseSearch(text) {
  var raw = trimString(text)
  if (raw === "") return []
  var data
  try {
    data = JSON.parse(raw)
  } catch (error) {
    return []
  }
  var quotes = data && Array.isArray(data.quotes) ? data.quotes : []
  var seen = {}
  var out = []
  for (var i = 0; i < quotes.length; i++) {
    var quote = quotes[i] || {}
    var symbol = trimString(quote.symbol).toUpperCase()
    if (!symbol || seen[symbol]) continue
    seen[symbol] = true
    out.push({
      symbol: symbol,
      name: trimString(quote.shortname || quote.longname || quote.symbol),
      exchange: trimString(quote.exchDisp || quote.exchange),
      type: trimString(quote.quoteType)
    })
  }
  return out
}

if (typeof module !== "undefined") {
  module.exports = {
    SEARCH_URL: SEARCH_URL,
    MAX_RESPONSE_BYTES: MAX_RESPONSE_BYTES,
    searchUrl: searchUrl,
    searchCommand: searchCommand,
    parseSearch: parseSearch
  }
}
