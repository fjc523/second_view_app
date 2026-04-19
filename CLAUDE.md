# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SecondView (second_view) — a web app for visualizing 1-second resolution stock market data. FastAPI backend serves CSV data as JSON; modular single-page frontend renders interactive charts using TradingView's lightweight-charts library.

## Running the App

```bash
# Start the server (default: http://127.0.0.1:8000)
python server.py

# Or via uvicorn directly
uvicorn server:app --host 127.0.0.1 --port 8000
```

No build step. No package manager config. Dependencies: `fastapi`, `uvicorn`, `pandas`, `numpy`, `orjson`.

## Architecture

- **`server.py`**: FastAPI app (v2.0.0) with GZip middleware, `orjson` serialization, `lru_cache` on CSV loading (128 files), session filtering, time-resolution aggregation (1s–60s), Hampel spike filter, cumulative VWAP, moving averages (MA5/100/200), volume MA20.

### Data Layout

CSV files live at `../data/1s/{YYYYMMDD}/{SYMBOL}.csv` (relative to app dir). Each CSV has columns: `bob` (timestamp), `open`, `high`, `low`, `close`, `clean_open`, `clean_high`, `clean_low`, `clean_close`, `volume`, `amount`, `vwap`, `tick_count`. The `clean_*` columns are adjusted prices.

### Frontend

Modular SPA in `static/` using ES6 modules:

- **`index.html`** — Minimal HTML skeleton (no inline CSS/JS), loads `app.css` and `app.js` as module entry point.
- **`css/app.css`** — All styles, uses CSS variables for theming.
- **`js/`** — 14 ES6 modules:

| Module | Responsibility |
|---|---|
| `app.js` | Entry point, initializes all modules |
| `state.js` | Centralized app state object |
| `config.js` | Constants (MA periods, colors, chart settings) |
| `dom.js` | Cached DOM element references |
| `api.js` | Fetch wrapper for API calls |
| `data.js` | Chart data loading orchestration |
| `chart.js` | Chart creation, series management, rendering |
| `sidebar.js` | Date/symbol navigation sidebar |
| `toolbar.js` | Toolbar stats display |
| `controls.js` | Button group event handlers |
| `legend.js` | Crosshair legend updates (price, MA, volume) |
| `range.js` | Time-axis range selection overlay |
| `clock.js` | Clock display with timezone support |
| `format.js` | Number formatting utilities |

### Session Boundaries (UTC)

- Premarket: 09:00–14:30 (ET 04:00–09:30)
- Market: 14:30–21:00 (ET 09:30–16:00)
- After-hours: 21:00–01:00+1 (ET 16:00–20:00)

### API (server.py)

- `GET /` — Serves `index.html`
- `GET /api/dates` — Returns all dates with per-symbol summary (quick first/last line read)
- `GET /api/price/{date}/{symbol}` — Returns candles, volume bars, cumulative VWAP, MAs, volume MA, stats, market-open marker
  - Query params: `session` (all/premarket/market/afterhours), `resolution` (1–60), `use_clean` (bool), `spike_filter` (hampel), `spike_window` (1–21)
