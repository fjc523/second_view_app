## Repository Guidance (agents)

SecondView (second_view) — a web app for visualizing 1-second resolution stock market data.
FastAPI backend serves parquet data as JSON; modular single-page frontend renders interactive charts using TradingView's lightweight-charts library.

### Running the app

```bash
# Install deps (recommended)
uv sync

# Start the server (default: http://127.0.0.1:8787)
uv run python server.py

# Or via uvicorn directly
uv run uvicorn server:app --host 127.0.0.1 --port 8787 --app-dir .
```

### Architecture

- **`backend/server.py`**: FastAPI app (v2.0.0) with GZip middleware, `orjson` serialization, `lru_cache` on parquet loading (128 files), session filtering, time-resolution aggregation (1s–60s), Hampel spike filter, cumulative VWAP, moving averages (MA5/100/200), volume MA20. Root `server.py` is a compatibility entrypoint.

### Data layout

Price data is loaded from a parquet root directory with layout `{PARQUET_DIR}/{SYMBOL}/{YYYY}.parquet`.
`backend/paths.py` resolves that root from `.env` / `PARQUET_DIR` (do not hardcode per-developer local paths).

### Frontend

Modular SPA in `static/` using ES6 modules:

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

### Session boundaries (UTC)

- Premarket: 09:00–14:30 (ET 04:00–09:30)
- Market: 14:30–21:00 (ET 09:30–16:00)
- After-hours: 21:00–01:00+1 (ET 16:00–20:00)

### API

- `GET /` — Serves `index.html`
- `GET /api/dates` — Returns all dates with per-symbol summary
- `GET /api/price/{date}/{symbol}` — Returns candles, volume bars, cumulative VWAP, MAs, volume MA, stats, market-open marker
  - Query params: `session` (all/premarket/market/afterhours), `resolution` (1–60), `use_clean` (bool), `spike_filter` (hampel), `spike_window` (1–21)

## Learned User Preferences

- Prefer setup docs aimed at first-time users (setup → configure `PARQUET_DIR` → run server → troubleshooting).
- Prefer using `uv` (`pyproject.toml` + `uv.lock`) as the primary dependency workflow.
- Prefer a non-default, less collision-prone dev server port (e.g. `8787`).

## Learned Workspace Facts

- Parquet root directory is configured via `.env`/environment variable `PARQUET_DIR` and should not be hardcoded (per-developer local paths differ).
- Backend code is organized under `backend/`, with a thin root `server.py` kept as a compatibility entrypoint.
