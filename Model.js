// Pure logic for the Stocks bar widget. No QML imports: this file is loaded
// by Panel.qml/BarWidget.qml through `import "Model.js" as Model` and by the
// node test-suite through require(), so it stays ES5-style and ends with a
// module.exports guard (same convention as omarchy.weather's Model.js).

var DEFAULT_SYMBOLS = ["AMZN", "NVDA", "SPCX", "GOOGL"]

function trimString(value) {
  return String(value === undefined || value === null ? "" : value).replace(/^\s+|\s+$/g, "")
}

// Accepts a JSON array (the documented form) or a comma/space/semicolon
// separated string (what `omarchy bar set ... symbols AAPL,NVDA` stores when
// --json is forgotten). Anything else, or an empty result, means the defaults.
function normalizeSymbols(value, fallback) {
  var defaults = fallback || DEFAULT_SYMBOLS
  var list = []
  if (Array.isArray(value)) {
    list = value
  } else if (typeof value === "string") {
    list = value.split(/[\s,;]+/)
  } else if (value && typeof value === "object" && typeof value.length === "number") {
    for (var k = 0; k < value.length; k++) list.push(value[k])
  }

  var out = []
  for (var i = 0; i < list.length; i++) {
    var symbol = trimString(list[i]).toUpperCase()
    if (symbol === "" || out.indexOf(symbol) !== -1) continue
    out.push(symbol)
  }
  return out.length ? out : defaults.slice()
}

function refreshMinutes(value, fallback) {
  var d = fallback === undefined || fallback === null ? 5 : fallback
  var n = parseInt(String(value), 10)
  if (isNaN(n)) return d
  return n < 1 ? 1 : n
}

function cycleSeconds(value, fallback) {
  var d = fallback === undefined || fallback === null ? 10 : fallback
  var n = parseInt(String(value), 10)
  if (isNaN(n) || n < 0) return d
  return n
}

var CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/"

// Panel chart ranges and the Yahoo bar interval that keeps each one at a
// sensible point count (79 / 131 / 21 / 125 / 53 points respectively).
var CHART_RANGES = ["1d", "5d", "1mo", "6mo", "1y"]
var CHART_INTERVALS = { "1d": "5m", "5d": "15m", "1mo": "1d", "6mo": "1d", "1y": "1wk" }

function chartRange(value, fallback) {
  var d = fallback === undefined || fallback === null ? "1d" : fallback
  var r = trimString(value).toLowerCase()
  return CHART_RANGES.indexOf(r) === -1 ? d : r
}

function chartInterval(range) {
  return CHART_INTERVALS[range] || "1d"
}

var INTERVAL_SECONDS = { "5m": 300, "15m": 900, "1d": 86400, "1wk": 604800 }

function intervalSeconds(interval) {
  return INTERVAL_SECONDS[String(interval || "")] || 0
}

// The quote fetch always uses range=1d (previousClose there is the prior
// session's close); other ranges are only used for chart series.
function chartUrl(symbol, range) {
  var r = chartRange(range)
  return CHART_URL + encodeURIComponent(String(symbol)) + "?range=" + r + "&interval=" + chartInterval(r)
}

function tickerWidth(value, fallback) {
  var d = fallback === undefined || fallback === null ? 180 : fallback
  var n = parseInt(String(value), 10)
  if (isNaN(n)) return d
  return n < 80 ? 80 : n
}

function scrollSpeed(value, fallback) {
  var d = fallback === undefined || fallback === null ? 20 : fallback
  var n = parseFloat(String(value))
  if (isNaN(n) || n < 0) return d
  return n
}

// One curl invocation for every symbol so the shell owns a single child
// process per refresh. `-w "\n"` terminates each response, so stdout is one
// JSON document per line in request order. Deliberately no `-f`: a 404 for an
// unknown symbol then still yields Yahoo's error JSON on its own line instead
// of an empty line, which keeps the other symbols' lines aligned.
//
// Every response is capped: a compromised origin could otherwise stream
// hundreds of megabytes into the shell's StdioCollector within the timeout.
var MAX_RESPONSE_BYTES = 1024 * 1024
// Worst measured 1d payload is ~25.6 KB (288-bar FX pairs); 30 symbols keep
// the request under 75% of the cap.
var MAX_FETCH_SYMBOLS = 30

function curlArgs(userAgent) {
  return [
    "-sS",
    "--max-time",
    "10",
    "--max-filesize",
    String(MAX_RESPONSE_BYTES),
    "-A",
    String(userAgent || "omarchy-stocks"),
    "-w",
    "\n"
  ]
}

// `head` closes the pipe at the byte cap, so curl cannot keep feeding the
// collector. pipefail keeps curl failures visible instead of head's success.
function cappedCurl(args) {
  return ["bash", "-c", 'set -o pipefail; curl "$@" | head -c ' + MAX_RESPONSE_BYTES, "curl"].concat(args)
}

function curlCommand(symbols, userAgent, range) {
  var args = curlArgs(userAgent)
  for (var i = 0; i < symbols.length; i++) args.push(chartUrl(symbols[i], range))
  return cappedCurl(args)
}

// Selected symbol first, then the rest, capped so a fetch always fits the
// response budget and the bar never loses its quote to truncation.
function fetchSymbols(symbols, selected, limit) {
  var list = symbols || []
  var max = limit || MAX_FETCH_SYMBOLS
  var out = []
  var value = trimString(selected).toUpperCase()
  if (value && list.indexOf(value) !== -1) out.push(value)
  for (var i = 0; i < list.length && out.length < max; i++) {
    if (out.indexOf(list[i]) === -1) out.push(list[i])
  }
  return out
}

function longTermChartUrl(symbol) {
  return CHART_URL + encodeURIComponent(String(symbol)) + "?range=5y&interval=1wk"
}

function longTermIndicatorCommand(symbols, userAgent) {
  var args = curlArgs(userAgent)
  for (var i = 0; i < symbols.length; i++) args.push(longTermChartUrl(symbols[i]))
  return cappedCurl(args)
}

function tradingViewSymbol(symbol) {
  var value = trimString(symbol).toUpperCase()
  var aliases = { "^GSPC": "SPX", "^DJI": "DJI", "BRK-B": "BRK.B", "BF-B": "BF.B" }
  if (aliases[value]) return aliases[value]
  // Yahoo uses '-' in crypto pairs and '=X' in FX pairs; TradingView's
  // generic symbol pages use the compact form (BTCUSD, EURUSD).
  return value.replace(/=X$/, "").replace(/[^A-Z0-9.]/g, "")
}

function tradingViewUrl(symbol) {
  return "https://www.tradingview.com/symbols/" + encodeURIComponent(tradingViewSymbol(symbol)) + "/"
}

function shellQuote(text) {
  return "'" + String(text).replace(/'/g, "'\\''") + "'"
}

function toNumber(value) {
  if (value === undefined || value === null || value === "") return null
  var n = Number(value)
  return isNaN(n) ? null : n
}

function emptyQuote(symbol, error) {
  return {
    symbol: String(symbol || ""),
    name: "",
    currency: "",
    exchange: "",
    price: null,
    prevClose: null,
    change: null,
    changePct: null,
    dayLow: null,
    dayHigh: null,
    week52Low: null,
    week52High: null,
    marketTime: null,
    open: null,
    volume: null,
    series: [],
    sessionEnd: null,
    error: String(error || "")
  }
}

// timestamp[] + indicators.quote[0].close[] -> [{t, c}], nulls skipped
// (Yahoo leaves the in-progress bar and market holidays as null).
function parseSeries(result) {
  var stamps = result && result.timestamp ? result.timestamp : []
  var quoteBlock = result && result.indicators && result.indicators.quote ? result.indicators.quote[0] : null
  var closes = quoteBlock && quoteBlock.close ? quoteBlock.close : []
  var out = []
  for (var i = 0; i < stamps.length && i < closes.length; i++) {
    var t = toNumber(stamps[i])
    var c = toNumber(closes[i])
    if (t === null || c === null) continue
    out.push({ t: t, c: c })
  }
  return out
}

function firstOpen(result) {
  var quoteBlock = result && result.indicators && result.indicators.quote ? result.indicators.quote[0] : null
  var opens = quoteBlock && quoteBlock.open ? quoteBlock.open : []
  for (var i = 0; i < opens.length; i++) {
    var o = toNumber(opens[i])
    if (o !== null) return o
  }
  return null
}

// One line of curl output -> Quote. Never throws.
function parseChartResponse(line) {
  var raw = trimString(line)
  if (raw === "") return emptyQuote("", "No data")

  var data
  try {
    data = JSON.parse(raw)
  } catch (e) {
    return emptyQuote("", "Bad response")
  }

  var chart = data && data.chart
  if (!chart) return emptyQuote("", "Bad response")

  var result = chart.result && chart.result[0]
  if (!result || !result.meta) {
    var code = chart.error && (chart.error.code || chart.error.description)
    return emptyQuote("", code ? String(code) : "No data")
  }

  var meta = result.meta
  var price = toNumber(meta.regularMarketPrice)
  // previousClose is the prior session's close whenever Yahoo sends it
  // (intraday ranges); chartPreviousClose is the close before the *range*,
  // which only coincides with it for range=1d.
  var prev = toNumber(meta.previousClose)
  if (prev === null) prev = toNumber(meta.chartPreviousClose)
  var change = price !== null && prev !== null ? price - prev : null
  var changePct = change !== null && prev ? (change / prev) * 100 : null

  var quote = emptyQuote(meta.symbol, price === null ? "No data" : "")
  quote.name = trimString(meta.shortName || meta.longName || meta.symbol)
  quote.currency = String(meta.currency || "")
  quote.exchange = String(meta.fullExchangeName || meta.exchangeName || "")
  quote.price = price
  quote.prevClose = prev
  quote.change = change
  quote.changePct = changePct
  quote.dayLow = toNumber(meta.regularMarketDayLow)
  quote.dayHigh = toNumber(meta.regularMarketDayHigh)
  quote.week52Low = toNumber(meta.fiftyTwoWeekLow)
  quote.week52High = toNumber(meta.fiftyTwoWeekHigh)
  quote.marketTime = toNumber(meta.regularMarketTime)
  quote.open = firstOpen(result)
  quote.volume = toNumber(meta.regularMarketVolume)
  quote.series = parseSeries(result)
  quote.sessionEnd = seriesEndTime(quote.series, meta.currentTradingPeriod && meta.currentTradingPeriod.regular)
  return quote
}

// Chart-range fetch -> { series: { SYM: series }, ends: { SYM: sessionEnd } }.
// Reuses parseQuoteLines for the symbol/position matching.
function parseSeriesLines(text, symbols) {
  var quotes = parseQuoteLines(text, symbols)
  var series = {}
  var ends = {}
  for (var i = 0; i < quotes.length; i++) {
    series[quotes[i].symbol] = quotes[i].series || []
    ends[quotes[i].symbol] = quotes[i].sessionEnd
  }
  return { series: series, ends: ends }
}

// Whole curl stdout -> one Quote per requested symbol, in request order.
// Successful lines are matched by symbol; error lines carry no symbol, so
// they are attributed by position when curl produced exactly one line per
// symbol. Anything unmatched becomes a "No data" quote.
function parseQuoteLines(text, symbols) {
  var lines = String(text || "").split("\n")
  if (lines.length && lines[lines.length - 1] === "") lines.pop()

  var positional = lines.length === symbols.length
  var bySymbol = {}
  var byIndex = []
  for (var i = 0; i < lines.length; i++) {
    var parsed = parseChartResponse(lines[i])
    byIndex.push(parsed)
    if (!parsed.error && parsed.symbol) bySymbol[parsed.symbol.toUpperCase()] = parsed
  }

  var out = []
  for (var j = 0; j < symbols.length; j++) {
    var symbol = String(symbols[j]).toUpperCase()
    var quote = bySymbol[symbol]
    if (!quote && positional && byIndex[j] && byIndex[j].error) quote = byIndex[j]
    if (!quote) quote = emptyQuote(symbol, "No data")
    quote.symbol = symbol
    out.push(quote)
  }
  return out
}

function isValid(quote) {
  return !!quote && !quote.error && quote.price !== null && quote.price !== undefined
}

function isDown(quote) {
  return isValid(quote) && quote.change !== null && quote.change !== undefined && quote.change < 0
}

function isUp(quote) {
  return isValid(quote) && quote.change !== null && quote.change !== undefined && quote.change > 0
}

function validCount(quotes) {
  var list = quotes || []
  var n = 0
  for (var i = 0; i < list.length; i++) if (isValid(list[i])) n++
  return n
}

function firstValidIndex(quotes) {
  var list = quotes || []
  for (var i = 0; i < list.length; i++) if (isValid(list[i])) return i
  return -1
}

// Next valid quote index in `step` direction (+1 forward, -1 back), wrapping
// around and skipping failed symbols. -1 when nothing is valid.
function nextIndex(current, quotes, step) {
  var list = quotes || []
  var n = list.length
  if (!n) return -1
  var dir = step < 0 ? -1 : 1
  var hasCurrent = typeof current === "number" && current >= 0 && current < n
  var start = hasCurrent ? current : dir > 0 ? -1 : 0
  for (var k = 1; k <= n; k++) {
    var idx = (((start + dir * k) % n) + n) % n
    if (isValid(list[idx])) return idx
  }
  return -1
}

// "Not Found" is permanent (typo or delisted); everything else may be a
// transient network/rate-limit failure worth a quick retry.
function shouldRetry(quotes) {
  var list = quotes || []
  if (!list.length) return true
  for (var i = 0; i < list.length; i++) {
    if (list[i] && list[i].error && list[i].error !== "Not Found") return true
  }
  return false
}

function screenSymbols(stocks) {
  var list = stocks || []
  var out = []
  for (var i = 0; i < list.length; i++) out.push(String(list[i].symbol || "").toUpperCase())
  return out
}

// Long-term technical signals use five years of weekly closes. MACD compares
// its 12/26-week line with the 9-week signal line; RSI uses the standard
// 14-week Wilder calculation and 30/70 thresholds.
function exponentialMovingAverage(values, period) {
  var list = values || []
  var out = []
  var multiplier = 2 / (period + 1)
  var previous = null
  for (var i = 0; i < list.length; i++) {
    var value = toNumber(list[i])
    if (value === null) continue
    previous = previous === null ? value : (value - previous) * multiplier + previous
    out.push(previous)
  }
  return out
}

function seriesCloses(series) {
  var list = series || []
  var out = []
  for (var i = 0; i < list.length; i++) {
    var close = toNumber(list[i] && list[i].c)
    if (close !== null) out.push(close)
  }
  return out
}

function macdIndicator(series) {
  var closes = seriesCloses(series)
  if (closes.length < 35) return { value: null, signal: null, action: "Neutral" }
  var fast = exponentialMovingAverage(closes, 12)
  var slow = exponentialMovingAverage(closes, 26)
  var line = []
  for (var i = 0; i < closes.length; i++) line.push(fast[i] - slow[i])
  var signalLine = exponentialMovingAverage(line, 9)
  var value = line[line.length - 1]
  var signal = signalLine[signalLine.length - 1]
  return {
    value: value,
    signal: signal,
    action: value > signal ? "Buy" : value < signal ? "Sell" : "Neutral"
  }
}

function rsiIndicator(series) {
  var closes = seriesCloses(series)
  var period = 14
  if (closes.length < period + 1) return { value: null, action: "Neutral" }
  var gains = 0
  var losses = 0
  for (var i = 1; i <= period; i++) {
    var initialChange = closes[i] - closes[i - 1]
    if (initialChange > 0) gains += initialChange
    else losses -= initialChange
  }
  var averageGain = gains / period
  var averageLoss = losses / period
  for (var j = period + 1; j < closes.length; j++) {
    var change = closes[j] - closes[j - 1]
    averageGain = (averageGain * (period - 1) + (change > 0 ? change : 0)) / period
    averageLoss = (averageLoss * (period - 1) + (change < 0 ? -change : 0)) / period
  }
  var value
  if (averageLoss === 0 && averageGain === 0) value = 50
  else if (averageLoss === 0) value = 100
  else {
    var relativeStrength = averageGain / averageLoss
    value = 100 - 100 / (1 + relativeStrength)
  }
  return { value: value, action: value <= 30 ? "Buy" : value >= 70 ? "Sell" : "Neutral" }
}

function longTermIndicators(seriesBySymbol, symbols) {
  var requested = symbols || []
  var source = seriesBySymbol || {}
  var out = {}
  for (var i = 0; i < requested.length; i++) {
    var symbol = String(requested[i]).toUpperCase()
    out[symbol] = {
      macd: macdIndicator(source[symbol] || []),
      rsi: rsiIndicator(source[symbol] || [])
    }
  }
  return out
}

// Normalize dynamic scanner output into the shape consumed by the QML table.
// Optional live quotes remain supported for callers which want to revalue a
// cached row, but the daily scanner normally supplies the current close.
function screenRows(stocks, quotes, indicators) {
  var list = stocks || []
  var quoteList = quotes || []
  var technical = indicators || {}
  var bySymbol = {}
  for (var q = 0; q < quoteList.length; q++) {
    if (quoteList[q] && quoteList[q].symbol) bySymbol[String(quoteList[q].symbol).toUpperCase()] = quoteList[q]
  }

  var out = []
  for (var i = 0; i < list.length; i++) {
    var stock = list[i]
    var symbol = String(stock.symbol || "").toUpperCase()
    var quote = bySymbol[symbol]
    var live = isValid(quote)
    var price = live ? toNumber(quote.price) : toNumber(stock.price)
    var ema200 = toNumber(stock.ema200)
    var ema20d = toNumber(stock.ema20d)
    var ema5y = toNumber(stock.ema5y)
    var target = toNumber(stock.target)
    var aboveEmaPct = price !== null && ema200 ? (price / ema200 - 1) * 100 : null
    var emaTrend20dPct = ema200 !== null && ema20d ? (ema200 / ema20d - 1) * 100 : null
    var emaTrend5yPct = ema200 !== null && ema5y ? (ema200 / ema5y - 1) * 100 : null
    var targetUpsidePct = target !== null && price ? (target / price - 1) * 100 : null
    var aboveEma = aboveEmaPct !== null && aboveEmaPct > 0
    var emaRising = emaTrend20dPct !== null && emaTrend20dPct > 0 && emaTrend5yPct !== null && emaTrend5yPct > 0
    var targetUpside = targetUpsidePct !== null && targetUpsidePct > 20
    var signals = technical[symbol] || stock || {}
    var macd = signals.macd || { value: null, signal: null, action: "Neutral" }
    var rsi = signals.rsi || { value: null, action: "Neutral" }

    out.push({
      symbol: symbol,
      name: String(stock.name || symbol),
      marketCap: toNumber(stock.marketCap),
      price: price,
      ema200: ema200,
      target: target,
      analystCount:
        toNumber(stock.analystCount) !== null
          ? toNumber(stock.analystCount)
          : Number(stock.buy || 0) + Number(stock.hold || 0) + Number(stock.sell || 0),
      aboveEmaPct: aboveEmaPct,
      emaTrend20dPct: emaTrend20dPct,
      emaTrend5yPct: emaTrend5yPct,
      targetUpsidePct: targetUpsidePct,
      macd: macd,
      rsi: rsi,
      aboveEma: aboveEma,
      emaRising: emaRising,
      targetUpside: targetUpside,
      qualifies: aboveEma && emaRising && targetUpside,
      live: live
    })
  }
  return out
}

function screenActionRank(action) {
  if (action === "Buy") return 2
  if (action === "Neutral") return 1
  return 0
}

function screenSortValue(row, key) {
  if (!row) return null
  if (key === "symbol") return String(row.symbol || "")
  if (key === "ema200") return toNumber(row.aboveEmaPct)
  if (key === "price" || key === "analystCount" || key === "targetUpsidePct") return toNumber(row[key])
  if (key === "macd") return screenActionRank(row.macd && row.macd.action)
  if (key === "rsi") return screenActionRank(row.rsi && row.rsi.action)
  return null
}

// Returns a sorted copy, leaving the scanner's default order untouched. Signal
// columns group Buy, Neutral, then Sell when sorted ascending.
function sortScreenRows(rows, key, direction) {
  var list = (rows || []).slice()
  if (!key) return list
  var dir = direction < 0 ? -1 : 1
  return list
    .map(function (row, index) {
      return { row: row, index: index }
    })
    .sort(function (a, b) {
      var left = screenSortValue(a.row, key)
      var right = screenSortValue(b.row, key)
      var leftMissing = left === null || left === undefined
      var rightMissing = right === null || right === undefined
      if (leftMissing || rightMissing) {
        if (leftMissing && rightMissing) return a.index - b.index
        return leftMissing ? 1 : -1
      }
      var result
      if (typeof left === "string") result = left < right ? -1 : left > right ? 1 : 0
      else result = left < right ? -1 : left > right ? 1 : 0
      return result === 0 ? a.index - b.index : result * dir
    })
    .map(function (entry) {
      return entry.row
    })
}

function priceDecimals(price) {
  return Math.abs(price) < 1 ? 4 : 2
}

function withThousands(fixed) {
  var parts = fixed.split(".")
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  return parts.join(".")
}

function formatPrice(price) {
  var n = toNumber(price)
  if (n === null) return ""
  return withThousands(n.toFixed(priceDecimals(n)))
}

function arrowFor(change) {
  if (change < 0) return "▼"
  if (change > 0) return "▲"
  return "•"
}

function formatPercent(changePct) {
  var n = toNumber(changePct)
  return n === null ? "" : Math.abs(n).toFixed(2) + "%"
}

function formatSignedPercent(value) {
  var n = toNumber(value)
  if (n === null) return ""
  return (n < 0 ? "-" : "+") + Math.abs(n).toFixed(1) + "%"
}

// The sidebar badge and detail header want the two decimals Yahoo shows
// ("-0.58%"), not the one-decimal screen score.
function formatSignedPercent2(value) {
  var n = toNumber(value)
  if (n === null) return ""
  return (n < 0 ? "-" : "+") + Math.abs(n).toFixed(2) + "%"
}

// "▲ +1.28 (0.42%)" for the panel's change column; "" when unknown.
function formatChange(quote) {
  if (!quote) return ""
  var change = toNumber(quote.change)
  if (change === null) return ""
  var decimals = quote.price !== null && quote.price !== undefined ? priceDecimals(quote.price) : 2
  var signed = (change < 0 ? "-" : "+") + Math.abs(change).toFixed(decimals)
  var pct = formatPercent(quote.changePct)
  return arrowFor(change) + " " + signed + (pct ? " (" + pct + ")" : "")
}

function formatMarketCap(value) {
  var n = toNumber(value)
  if (n === null || n < 0) return ""
  if (n >= 1000000000000) return Math.round(n / 1000000000000) + "T"
  if (n >= 1000000000) return Math.round(n / 1000000000) + "B"
  if (n >= 1000000) return Math.round(n / 1000000) + "M"
  return Math.round(n / 1000) + "K"
}

// Bar pill text: "AMZN 226.13 ▲0.42%", or "AMZN ▲0.42%" when compact.
function barLabel(quote, compact) {
  if (!quote) return ""
  var symbol = String(quote.symbol || "")
  if (!isValid(quote)) return symbol + " !"
  var parts = [symbol]
  if (!compact) parts.push(formatPrice(quote.price))
  var change = toNumber(quote.change)
  var pct = formatPercent(quote.changePct)
  if (change !== null && pct) parts.push(arrowFor(change) + pct)
  return parts.join(" ")
}

// Vertical bars are only ~28px wide: symbol on one line, direction on the next.
function verticalLabel(quote) {
  if (!quote) return ""
  var symbol = String(quote.symbol || "")
  if (!isValid(quote)) return symbol + "\n!"
  var change = toNumber(quote.change)
  return symbol + "\n" + (change === null ? "•" : arrowFor(change))
}

function loadingLabel(symbol) {
  var s = trimString(symbol)
  return (s ? s + " " : "") + "…"
}

// ---- Chart geometry (pure so Canvas painting stays trivial and testable).

function seriesBounds(series, include) {
  var list = series || []
  if (!list.length) return null
  var min = list[0].c
  var max = list[0].c
  for (var i = 1; i < list.length; i++) {
    if (list[i].c < min) min = list[i].c
    if (list[i].c > max) max = list[i].c
  }
  // Keep a reference line (e.g. previous close) visible even when it sits
  // outside the data's own range.
  var extra = toNumber(include)
  if (extra !== null) {
    if (extra < min) min = extra
    if (extra > max) max = extra
  }
  return { min: min, max: max }
}

function scaleY(value, bounds, height, padding) {
  var span = bounds.max - bounds.min
  var inner = height - padding * 2
  if (span <= 0) return padding + inner / 2
  return padding + ((bounds.max - value) / span) * inner
}

// Right edge for an in-progress intraday chart: the regular session's close
// when the last bar belongs to that session, else null. Yahoo may report the
// next session on a closed market; filling the data is then the safe choice.
function seriesEndTime(series, period) {
  var list = series || []
  var start = period ? toNumber(period.start) : null
  var end = period ? toNumber(period.end) : null
  if (!list.length || start === null || end === null) return null
  var last = list[list.length - 1].t
  return last >= start && last <= end ? end : null
}

// One equal x-slot per bar, so closed-market time (overnight, weekends,
// holidays) takes no width and the line never spans a flat close-to-open gap.
// While a session is open, endTime (its close) and interval (bar seconds) add
// the slots still to come, leaving the rest of the canvas empty.
function seriesSlots(series, endTime, interval) {
  var list = series || []
  if (!list.length) return 0
  var slots = list.length - 1
  var close = toNumber(endTime)
  var step = toNumber(interval)
  var last = list[list.length - 1].t
  if (close !== null && step !== null && step > 0 && close > last) slots += (close - last) / step
  return slots
}

function slotFraction(t, series, slots, interval) {
  var list = series || []
  if (!list.length || slots <= 0) return 0
  var step = toNumber(interval)
  var last = list[list.length - 1].t
  if (t > last)
    return step !== null && step > 0 ? (list.length - 1 + (t - last) / step) / slots : (list.length - 1) / slots
  if (t <= list[0].t) return 0
  for (var i = 1; i < list.length; i++) {
    if (t <= list[i].t) {
      var span = list[i].t - list[i - 1].t
      return (i - 1 + (span > 0 ? (t - list[i - 1].t) / span : 0)) / slots
    }
  }
  return 1
}

// x is one slot per bar (open-market time only); y is scaled between the
// series' min (bottom) and max (top).
function seriesPoints(series, width, height, padding, endTime, boundsValue, interval) {
  var list = series || []
  var bounds = seriesBounds(list, boundsValue)
  var slots = seriesSlots(list, endTime, interval)
  if (!bounds) return []
  var pad = padding || 0
  var out = []
  for (var i = 0; i < list.length; i++) {
    var x = slots > 0 ? pad + (i / slots) * (width - pad * 2) : pad
    out.push({ x: x, y: scaleY(list[i].c, bounds, height, pad) })
  }
  return out
}

// Axis guides as { t, fraction } (fraction along the slot axis): hourly for
// 1D, one per session for 5D, and evenly spaced over the longer ranges.
// UTC boundaries are invisible on an axis without tick labels.
function chartTimeTicks(series, range, endTime, interval) {
  var list = series || []
  var slots = seriesSlots(list, endTime, interval)
  if (!list.length || slots <= 0) return []
  var out = []
  var i
  if (range === "1d") {
    var last = list[list.length - 1].t
    var close = toNumber(endTime)
    var endWall = close !== null && close > last ? close : last
    for (var t = Math.floor(list[0].t / 3600) * 3600 + 3600; t < endWall; t += 3600)
      out.push({ t: t, fraction: slotFraction(t, list, slots, interval) })
    return out
  }
  if (range !== "5d") {
    var count = range === "6mo" ? 6 : 4
    for (i = 1; i < count; i++) {
      var slot = (slots * i) / count
      var lo = Math.floor(slot)
      var hi = lo + 1 < list.length ? lo + 1 : lo
      var inner = slot - lo
      out.push({ t: list[lo].t + (list[hi].t - list[lo].t) * inner, fraction: i / count })
    }
    return out
  }
  var day = null
  for (i = 0; i < list.length; i++) {
    var key = Math.floor(list[i].t / 86400)
    if (day !== null && key !== day) out.push({ t: list[i].t, fraction: i / slots })
    day = key
  }
  return out
}

// y for a reference value (e.g. previous close) or null when it would fall
// outside the plotted bounds.
function valueToY(value, bounds, height, padding) {
  var v = toNumber(value)
  if (v === null || !bounds) return null
  if (v < bounds.min || v > bounds.max) return null
  return scaleY(v, bounds, height, padding || 0)
}

// ---- Ticker tape.

function tapeItems(quotes, compact) {
  var list = quotes || []
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (!isValid(list[i])) continue
    out.push({
      symbol: String(list[i].symbol || ""),
      text: barLabel(list[i], compact),
      up: isUp(list[i]),
      down: isDown(list[i])
    })
  }
  return out
}

function screenSymbolLabel(row) {
  var symbol = String((row && row.symbol) || "")
  var cap = formatMarketCap(row && row.marketCap)
  return symbol + (cap ? "(" + cap + ")" : "")
}

// ---- Colors. Omarchy themes expose their palette in
//      ~/.local/state/omarchy/current/theme/colors.toml (`green = "#a9b665"`);
//      the shell's Color singleton only carries foreground/accent/urgent/muted,
//      so up/down tints are read from that file, with settings overrides.

function normalizeColor(value) {
  var s = trimString(value).toLowerCase()
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(s) ? s : ""
}

function parseThemeColor(tomlText, key) {
  var lines = String(tomlText || "").split("\n")
  var pattern = new RegExp("^\\s*" + key + "\\s*=\\s*[\"']([^\"']*)[\"']")
  for (var i = 0; i < lines.length; i++) {
    var m = lines[i].match(pattern)
    if (m) return normalizeColor(m[1])
  }
  return ""
}

function formatVolume(value) {
  var n = toNumber(value)
  if (n === null) return ""
  var abs = Math.abs(n)
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B"
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M"
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K"
  return String(Math.round(n))
}

// ---- Display currency. Yahoo serves FX pairs through the same chart
//      endpoint ("USDEUR=X" -> 1 USD in EUR), so every quote can be shown in
//      one chosen currency without another data source.

var DEFAULT_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CHF"]

function normalizeCurrency(value) {
  var s = trimString(value).toUpperCase()
  return /^[A-Z]{3}$/.test(s) ? s : ""
}

function normalizeCurrencies(value, fallback) {
  var defaults = fallback || DEFAULT_CURRENCIES
  var list = []
  if (Array.isArray(value)) list = value
  else if (typeof value === "string") list = value.split(/[\s,;]+/)
  else if (value && typeof value === "object" && typeof value.length === "number") {
    for (var k = 0; k < value.length; k++) list.push(value[k])
  }
  var out = []
  for (var i = 0; i < list.length; i++) {
    var code = normalizeCurrency(list[i])
    if (code === "" || out.indexOf(code) !== -1) continue
    out.push(code)
  }
  return out.length ? out : defaults.slice()
}

// Cycle "" (native, each quote in its own currency) -> list[0] -> ... -> "".
function currencyCycle(current, list, step) {
  var ring = [""].concat(list || [])
  var idx = ring.indexOf(normalizeCurrency(current))
  if (idx === -1) idx = 0
  var dir = step < 0 ? -1 : 1
  return ring[(((idx + dir) % ring.length) + ring.length) % ring.length]
}

// Yahoo reports some markets in minor units: London in pence ("GBp"/"GBX"),
// Johannesburg in cents ("ZAc"), Tel Aviv in agorot ("ILA"). Map those to the
// major code plus a factor.
var MINOR_UNITS = { GBp: "GBP", GBX: "GBP", ZAc: "ZAR", ILA: "ILS" }

function quoteCurrency(currency) {
  var raw = trimString(currency)
  if (raw === "") return { code: "", factor: 1 }
  if (MINOR_UNITS[raw]) return { code: MINOR_UNITS[raw], factor: 0.01 }
  return { code: raw.toUpperCase(), factor: 1 }
}

function ratePairs(quotes, display) {
  var target = normalizeCurrency(display)
  if (target === "") return []
  var list = quotes || []
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (!isValid(list[i])) continue
    var from = quoteCurrency(list[i].currency).code
    if (from === "" || from === target) continue
    var pair = from + target + "=X"
    if (out.indexOf(pair) === -1) out.push(pair)
  }
  return out
}

function parseRateLines(text, pairs) {
  var requested = pairs || []
  var lines = String(text || "").split("\n")
  if (lines.length && lines[lines.length - 1] === "") lines.pop()

  var positional = lines.length === requested.length
  var bySymbol = {}
  var byIndex = []
  for (var i = 0; i < lines.length; i++) {
    var quote = parseChartResponse(lines[i])
    byIndex.push(quote)
    if (isValid(quote)) bySymbol[quote.symbol.toUpperCase()] = quote.price
  }

  var out = {}
  for (var j = 0; j < requested.length; j++) {
    var pair = String(requested[j]).toUpperCase()
    var price = bySymbol[pair]
    // Yahoo sometimes normalizes the pair symbol ("USDEUR=X" -> "EUR=X")
    // while keeping response order, so position is a safe fallback.
    if (price === undefined && positional && isValid(byIndex[j])) price = byIndex[j].price
    if (price !== undefined) out[pair] = price
  }
  return out
}

// Multiplier turning a price in `currency` into `display`; 1 when no
// conversion applies, null when the needed rate is not (yet) known.
function rateFor(currency, display, rates) {
  var target = normalizeCurrency(display)
  var from = quoteCurrency(currency)
  if (target === "") return 1
  if (from.code === "") return null
  if (from.code === target) return from.factor
  var rate = rates ? toNumber(rates[from.code + target + "=X"]) : null
  return rate === null ? null : rate * from.factor
}

function convertSeries(series, rate) {
  var list = series || []
  var r = toNumber(rate)
  if (r === null || r === 1) return list
  var out = []
  for (var i = 0; i < list.length; i++) out.push({ t: list[i].t, c: list[i].c * r })
  return out
}

function scaled(value, rate) {
  var n = toNumber(value)
  return n === null ? null : n * rate
}

// Copy of `quote` with money fields and series in `display`. Percentages are
// currency-independent. Falls back to the untouched quote (converted: false)
// when the rate is unknown or no conversion applies.
function convertQuote(quote, display, rates) {
  if (!quote) return quote
  var out = {}
  for (var key in quote) out[key] = quote[key]
  out.nativeCurrency = quote.currency
  out.converted = false
  if (!isValid(quote)) return out
  var target = normalizeCurrency(display)
  var from = quoteCurrency(quote.currency)
  if (target === "" || from.code === target || from.code === "") return out
  var rate = rateFor(quote.currency, display, rates)
  if (rate === null) return out
  out.price = scaled(quote.price, rate)
  out.prevClose = scaled(quote.prevClose, rate)
  out.change = out.price !== null && out.prevClose !== null ? out.price - out.prevClose : null
  out.dayLow = scaled(quote.dayLow, rate)
  out.dayHigh = scaled(quote.dayHigh, rate)
  out.week52Low = scaled(quote.week52Low, rate)
  out.week52High = scaled(quote.week52High, rate)
  out.open = scaled(quote.open, rate)
  out.series = convertSeries(quote.series, rate)
  out.currency = target
  out.converted = true
  return out
}

function convertAll(quotes, display, rates) {
  var list = quotes || []
  var out = []
  for (var i = 0; i < list.length; i++) out.push(convertQuote(list[i], display, rates))
  return out
}

if (typeof module !== "undefined") {
  module.exports = {
    DEFAULT_SYMBOLS: DEFAULT_SYMBOLS,
    normalizeSymbols: normalizeSymbols,
    refreshMinutes: refreshMinutes,
    cycleSeconds: cycleSeconds,
    chartUrl: chartUrl,
    curlCommand: curlCommand,
    fetchSymbols: fetchSymbols,
    MAX_RESPONSE_BYTES: MAX_RESPONSE_BYTES,
    MAX_FETCH_SYMBOLS: MAX_FETCH_SYMBOLS,
    longTermChartUrl: longTermChartUrl,
    longTermIndicatorCommand: longTermIndicatorCommand,
    tradingViewSymbol: tradingViewSymbol,
    tradingViewUrl: tradingViewUrl,
    shellQuote: shellQuote,
    emptyQuote: emptyQuote,
    parseChartResponse: parseChartResponse,
    parseQuoteLines: parseQuoteLines,
    isValid: isValid,
    isDown: isDown,
    isUp: isUp,
    validCount: validCount,
    firstValidIndex: firstValidIndex,
    nextIndex: nextIndex,
    shouldRetry: shouldRetry,
    screenSymbols: screenSymbols,
    exponentialMovingAverage: exponentialMovingAverage,
    macdIndicator: macdIndicator,
    rsiIndicator: rsiIndicator,
    longTermIndicators: longTermIndicators,
    screenRows: screenRows,
    sortScreenRows: sortScreenRows,
    formatPrice: formatPrice,
    formatSignedPercent: formatSignedPercent,
    formatSignedPercent2: formatSignedPercent2,
    formatPercent: formatPercent,
    arrowFor: arrowFor,
    formatChange: formatChange,
    formatMarketCap: formatMarketCap,
    barLabel: barLabel,
    verticalLabel: verticalLabel,
    loadingLabel: loadingLabel,
    CHART_RANGES: CHART_RANGES,
    chartRange: chartRange,
    chartInterval: chartInterval,
    tickerWidth: tickerWidth,
    scrollSpeed: scrollSpeed,
    parseSeriesLines: parseSeriesLines,
    seriesEndTime: seriesEndTime,
    seriesBounds: seriesBounds,
    seriesPoints: seriesPoints,
    seriesSlots: seriesSlots,
    chartTimeTicks: chartTimeTicks,
    intervalSeconds: intervalSeconds,
    valueToY: valueToY,
    tapeItems: tapeItems,
    screenSymbolLabel: screenSymbolLabel,
    normalizeColor: normalizeColor,
    parseThemeColor: parseThemeColor,
    formatVolume: formatVolume,
    DEFAULT_CURRENCIES: DEFAULT_CURRENCIES,
    normalizeCurrency: normalizeCurrency,
    normalizeCurrencies: normalizeCurrencies,
    currencyCycle: currencyCycle,
    quoteCurrency: quoteCurrency,
    ratePairs: ratePairs,
    parseRateLines: parseRateLines,
    rateFor: rateFor,
    convertSeries: convertSeries,
    convertQuote: convertQuote,
    convertAll: convertAll
  }
}
