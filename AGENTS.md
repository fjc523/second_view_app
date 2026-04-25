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
- `GET /api/dates` — Returns all dates; optional summaries via `include_summary=true&symbols=AAPL,MSFT`
- `GET /api/price/{date}/{symbol}` — Returns candles, volume bars, cumulative VWAP, MAs, volume MA, stats, market-open marker
  - Query params: `session` (all/premarket/market/afterhours), `resolution` (1–60), `use_clean` (bool), `spike_filter` (hampel), `spike_window` (1–21)

## Learned User Preferences

- Prefer setup docs aimed at first-time users (setup → configure `PARQUET_DIR` → run server → troubleshooting).
- Prefer using `uv` (`pyproject.toml` + `uv.lock`) as the primary dependency workflow.
- Prefer a non-default, less collision-prone dev server port (e.g. `8787`).

## Learned Workspace Facts

- Parquet root directory is configured via `.env`/environment variable `PARQUET_DIR` and should not be hardcoded (per-developer local paths differ).
- Backend code is organized under `backend/`, with a thin root `server.py` kept as a compatibility entrypoint.


<claude-mem-context>
# Memory Context

# [second_view_app] recent context, 2026-04-25 11:54pm GMT+8

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 44 obs (10,544t read) | 1,222,377t work | 99% savings

### Apr 25, 2026
790 11:00p 🔵 backend/utils 目录存在大量版本化 parquet_reader 文件
791 " 🔵 second_view_app 真实项目结构与之前扫描结果完全不同
792 11:01p 🔵 second_view_app 项目依赖与配置确认
793 " 🔵 alpha 目录下存在多个相关项目
794 " 🔵 second_view_app 架构与功能全貌确认
796 " 🔵 项目代码规模与模块行数分布确认
797 11:02p 🔵 后端 API 路由全集与代码质量扫描结果
798 " 🔵 "bob" 是 parquet 数据的真实时间戳列名，非测试遗留
799 " 🔵 _list_dates 使用全局变量缓存且硬编码 AAPL 作为参考 symbol
800 11:03p 🔵 api_price 端点完整实现与多处性能/正确性问题
801 " 🔵 paths.py 在模块导入时立即执行 resolve_parquet_dir()，启动失败风险高
802 " 🔵 前端 DOM ID 与 index.html 不匹配，controls.js 引用不存在的按钮组 ID
803 11:04p 🔵 前端 DOM ID 实际一致，之前的不匹配判断有误；index.html 与 JS 模块完全对齐
804 " 🔵 doc/ 文档与当前实现存在多处过时描述
805 " 🔵 uv.lock 锁定两个 FastAPI 版本，numpy 锁定在 2.0.2（非最新）
806 " 🔵 chart.js 未渲染 VWAP，事件 marker 查找使用线性扫描
807 11:05p 🔵 range.js 使用二分查找，区间选择实现完整且高效
808 " 🔵 selectEvent 强制重置 session 和 resolution，星标状态不持久化
809 11:06p 🔵 Tile Data Compression Ratios by Resolution
810 " 🔵 AAPL Parquet `bob` Column is Timezone-Aware US/Eastern Datetime
811 " 🔵 AAPL 2026 Parquet Schema: 8 Columns, 2.27M Rows
812 11:07p 🔵 `_load_data` Performance Benchmark for Single Trading Day
813 " 🔵 Backend Server Managed via `scripts/serverctl`, Running on Port 8787
814 11:08p 🔵 No Test Files or Linting Config Found in second_view_app
815 11:13p 🔵 second_view_app Project Architecture Overview
816 " 🔵 Three Improvement Areas Identified in Code Review
819 11:14p 🟣 lightweight-charts Vendored Locally
822 11:15p 🟣 /api/dates Gains Optional Per-Date Summary Data
823 " 🔴 Backend Listen Address Now Configurable via ENV
824 " 🔴 ResizeObserver Memory Leak Fixed in chart.js
826 " 🔴 XSS Hardening for Event Card symbol/date/time Fields
828 " 🔴 lightweight-charts CDN Reference Replaced with Local Vendor Path
829 " 🔴 serverctl Script Aligned with HOST/PORT Environment Variable Support
832 11:17p ✅ doc/0-main.md Updated to Reflect Parquet Architecture and New /api/dates Contract
833 " ✅ AGENTS.md API Reference Updated for /api/dates
834 " ✅ README.md Documents HOST Override for LAN Access
844 11:20p 🔵 /api/dates Default Response Takes ~10 Seconds on First Load
845 " 🔵 Smoke Test Confirmed All Endpoints Functional; Summary API Verified Live
846 11:21p ✅ README.md Expanded with serverctl Usage and Full /api/dates Parameter Table
847 " ✅ .gitignore Updated to Exclude .run/ Directory
848 11:22p ✅ README Documents include_summary Cold-Start Performance Warning
849 11:23p 🔵 /api/dates Default Response Confirmed Correct Shape; Cold-Start ~8s
852 11:24p ✅ Complete Change Set for second_view_app Review Session
854 " ✅ second_view_app Review Session Completed — All 4 Plan Steps Done

Access 1222k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
