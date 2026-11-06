# Changelog

All notable changes to this plugin are documented here.

## [1.1.0] - 2026-11-07

### Added

- Watchlist sparklines show the previous close as a dotted line across the full width, tinted like the surrounding text.
- Detail chart grid with hour/session guides for intraday ranges, evenly spaced guides for longer ranges, and horizontal guides scaled to the visible price range. Axis labels now sit on each guide.

### Fixed

- Intraday charts (1D/5D and watchlist sparklines) now grow from the session open and leave the rest of the session blank, instead of stretching a partial day across the whole width.
- Charts plot one x-slot per bar, so overnight, weekend and holiday gaps no longer widen the plot or draw long straight close-to-open lines.

## [1.0.0] - 2026-11-05

### Added

- Two-pane Stocks panel with ticker search, watchlists and a selected-ticker detail view.
- Yahoo Finance symbol search with debounced results and duplicate prevention.
- Watchlist creation, renaming, switching and deletion; the last watchlist is protected.
- Ticker add/remove, sparkline, price and previous-close change badge.
- 1D/5D/1M/6M/1Y charts, currency conversion and key quote statistics.
- Compact bar widget showing the selected ticker's price and daily change.
- Persistent watchlists and preferences in `~/.local/state/omarchy/stocks/state.json`.
- Keyboard controls for search, selection, watchlists, ranges and currency.
