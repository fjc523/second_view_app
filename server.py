from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, Response

try:
    import orjson  # type: ignore
except ImportError:  # pragma: no cover
    orjson = None

APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
PARQUET_DIR = Path(os.environ.get("PARQUET_DIR", str(APP_DIR.parent.parent / "us_stocks_data" / "1s_parquet")))
REPLAY_ROOT = Path(os.environ.get("REPLAY_ROOT", str(APP_DIR.parent.parent / "reports")))

DATE_RE = re.compile(r"^\d{8}$")
SYMBOL_RE = re.compile(r"^[A-Za-z0-9._-]+$")

MA_PERIODS = [5, 30, 60]

SESSION_BOUNDS = {
    "premarket": (9, 0, 14, 30),
    "market": (14, 30, 21, 0),
    "afterhours": (21, 0, 25, 0),
}

app = FastAPI(title="second_view", version="2.1.1")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.add_middleware(GZipMiddleware, minimum_size=1000)

from starlette.middleware.base import BaseHTTPMiddleware


class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/static/"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response


app.add_middleware(NoCacheStaticMiddleware)


class ORJSONResponse(Response):
    media_type = "application/json"

    def render(self, content) -> bytes:
        if orjson is not None:
            return orjson.dumps(content, option=orjson.OPT_SERIALIZE_NUMPY)
        return json.dumps(content, ensure_ascii=False, default=str).encode("utf-8")


def _validate_date(d: str) -> None:
    if not DATE_RE.match(d):
        raise HTTPException(400, "invalid date format")


def _validate_symbol(s: str) -> None:
    if not SYMBOL_RE.match(s):
        raise HTTPException(400, "invalid symbol format")


@lru_cache(maxsize=128)
def _load_data(date: str, symbol: str) -> pd.DataFrame:
    _validate_date(date)
    _validate_symbol(symbol)
    year = date[:4]
    pq_path = PARQUET_DIR / symbol / f"{year}.parquet"
    if not pq_path.exists():
        raise HTTPException(404, "symbol not found")
    df = pd.read_parquet(pq_path)
    start = pd.Timestamp(date, tz="US/Eastern")
    df = df[(df["bob"] >= start) & (df["bob"] < start + pd.Timedelta(days=1))]
    if df.empty:
        raise HTTPException(404, "no data for date")
    df = df.copy()
    df["bob"] = df["bob"].dt.tz_convert("UTC")
    df = df.sort_values("bob").reset_index(drop=True)
    df["time"] = (df["bob"].astype("int64") // 1_000_000_000).astype(int)
    return df


_dates_cache: list[str] | None = None


def _list_dates() -> list[str]:
    global _dates_cache
    if _dates_cache is not None:
        return _dates_cache
    ref = PARQUET_DIR / "AAPL" / "2025.parquet"
    if not ref.exists():
        return []
    df = pd.read_parquet(ref, columns=["bob"])
    dates = sorted(df["bob"].dt.date.astype(str).str.replace("-", "").unique(), reverse=True)
    _dates_cache = list(dates)
    return _dates_cache


def _filter_session(df: pd.DataFrame, session: str) -> pd.DataFrame:
    if session == "all":
        return df
    if session not in SESSION_BOUNDS:
        raise HTTPException(400, f"invalid session: {session}")
    h1, m1, h2, m2 = SESSION_BOUNDS[session]
    hour = df["bob"].dt.hour
    minute = df["bob"].dt.minute
    t = hour * 60 + minute
    start = h1 * 60 + m1
    end = h2 * 60 + m2
    if end > 24 * 60:
        mask = (t >= start) | (t < end - 24 * 60)
    else:
        mask = (t >= start) & (t < end)
    return df[mask].copy()


def _aggregate(df: pd.DataFrame, resolution: int) -> pd.DataFrame:
    if resolution <= 1:
        return df
    df = df.copy()
    df["time"] = (df["time"] // resolution) * resolution
    clean_cols = ["clean_open", "clean_high", "clean_low", "clean_close"] if "clean_open" in df.columns else []
    agg = {
        "open": ("open", "first"),
        "high": ("high", "max"),
        "low": ("low", "min"),
        "close": ("close", "last"),
        "volume": ("volume", "sum"),
        "amount": ("amount", "sum"),
        "tick_count": ("tick_count", "sum"),
    }
    for c in clean_cols:
        if c == "clean_open":
            agg[c] = (c, "first")
        elif c == "clean_high":
            agg[c] = (c, "max")
        elif c == "clean_low":
            agg[c] = (c, "min")
        elif c == "clean_close":
            agg[c] = (c, "last")
    grouped = df.groupby("time", sort=True).agg(**agg).reset_index()
    return _fill_time_gaps(grouped, resolution)


def _fill_time_gaps(df: pd.DataFrame, resolution: int) -> pd.DataFrame:
    if df.empty:
        return df
    times = df["time"].values
    if len(times) < 2:
        return df
    full_times = np.arange(times.min(), times.max() + resolution, resolution, dtype=int)
    if len(full_times) == len(times):
        return df
    df = df.set_index("time").reindex(full_times)

    def _fill_ohlc(prefix: str = "") -> None:
        c = f"{prefix}close"
        o = f"{prefix}open"
        h = f"{prefix}high"
        l = f"{prefix}low"
        if c not in df.columns:
            return
        df[c] = df[c].ffill()
        if o in df.columns:
            df[o] = df[o].fillna(df[c])
        if h in df.columns:
            df[h] = df[h].fillna(df[c])
        if l in df.columns:
            df[l] = df[l].fillna(df[c])

    _fill_ohlc("")
    if "clean_close" in df.columns:
        _fill_ohlc("clean_")
    for col in ("volume", "amount", "tick_count"):
        if col in df.columns:
            df[col] = df[col].fillna(0)
    return df.reset_index().rename(columns={"index": "time"})


def _compute_vwap(df: pd.DataFrame) -> list[dict]:
    vol = df["volume"].values.astype(float)
    amt = df["amount"].values.astype(float)
    cum_vol = np.cumsum(vol)
    cum_amt = np.cumsum(amt)
    mask = cum_vol > 0
    vwap = np.where(mask, cum_amt / cum_vol, np.nan)
    times = df["time"].values
    result = []
    for i in range(len(times)):
        if not np.isnan(vwap[i]):
            result.append({"time": int(times[i]), "value": round(float(vwap[i]), 4)})
    return result


def _compute_ma(values: np.ndarray, times: np.ndarray, period: int) -> list[dict]:
    if len(values) < period:
        return []
    ma = pd.Series(values).rolling(period).mean().values
    result = []
    for i in range(period - 1, len(times)):
        if not np.isnan(ma[i]):
            result.append({"time": int(times[i]), "value": round(float(ma[i]), 4)})
    return result


def _hampel_filter(series: pd.Series, window: int, n_sigma: float = 3.0) -> pd.Series:
    if window <= 0:
        return series
    k = 1.4826
    win = window * 2 + 1
    rolling_median = series.rolling(win, center=True).median()
    mad = (series - rolling_median).abs().rolling(win, center=True).median()
    threshold = n_sigma * k * mad
    outlier = (series - rolling_median).abs() > threshold
    filtered = series.copy()
    filtered[outlier & rolling_median.notna()] = rolling_median[outlier & rolling_median.notna()]
    return filtered


def _apply_spike_filter(df: pd.DataFrame, method: str, window: int) -> pd.DataFrame:
    if method != "hampel":
        return df
    df = df.copy()
    for prefix in ("", "clean_"):
        close_col = f"{prefix}close"
        if close_col not in df.columns:
            continue
        for col in (f"{prefix}open", f"{prefix}high", f"{prefix}low", close_col):
            if col in df.columns:
                df[col] = _hampel_filter(df[col].astype(float), window)
        high_col = f"{prefix}high"
        low_col = f"{prefix}low"
        open_col = f"{prefix}open"
        if high_col in df.columns and low_col in df.columns and open_col in df.columns:
            df[high_col] = df[[high_col, open_col, close_col]].max(axis=1)
            df[low_col] = df[[low_col, open_col, close_col]].min(axis=1)
    return df


def _build_volume_bars(times: np.ndarray, opens: np.ndarray, closes: np.ndarray, volumes: np.ndarray) -> list[dict]:
    result = []
    for i in range(len(times)):
        color = "#4ade80" if closes[i] >= opens[i] else "#f87171"
        result.append({"time": int(times[i]), "value": float(volumes[i]), "color": color})
    return result


def _replay_run_dir(run_id: str) -> Path:
    for candidate in REPLAY_ROOT.glob(f"**/{run_id}/visual_replay"):
        if candidate.is_dir():
            return candidate
    raise HTTPException(404, "replay run not found")


def _load_replay_csv(replay_dir: Path, date: str, symbol: str) -> pd.DataFrame:
    csv_path = replay_dir / "second_view_data" / "1s" / date / f"{symbol}.csv"
    if not csv_path.exists():
        raise HTTPException(404, "replay csv not found")
    df = pd.read_csv(csv_path)
    df["bob"] = pd.to_datetime(df["bob"], utc=True)
    df = df.sort_values("bob").reset_index(drop=True)
    df["time"] = (df["bob"].astype("int64") // 1_000_000_000).astype(int)
    return df


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/dates", response_class=ORJSONResponse)
def api_dates():
    dates = _list_dates()
    result = {date: [] for date in dates}
    return ORJSONResponse({"dates": result})


_symbol_cache: list[str] | None = None
_symbol_cache_time: float = 0


def _get_all_symbols() -> list[str]:
    global _symbol_cache, _symbol_cache_time
    import time
    now = time.time()
    if _symbol_cache is not None and now - _symbol_cache_time < 3600:
        return _symbol_cache
    if PARQUET_DIR.exists():
        _symbol_cache = sorted(p.name for p in PARQUET_DIR.iterdir() if p.is_dir())
    else:
        _symbol_cache = []
    _symbol_cache_time = now
    return _symbol_cache


@app.get("/api/search", response_class=ORJSONResponse)
def api_search(q: str = Query("", min_length=1, max_length=20)):
    q_upper = q.upper()
    symbols = _get_all_symbols()
    exact = [s for s in symbols if s.upper() == q_upper]
    prefix = [s for s in symbols if s.upper().startswith(q_upper) and s.upper() != q_upper]
    results = (exact + prefix)[:20]
    return ORJSONResponse({"query": q, "symbols": results})


@app.get("/api/replay/{run_id}", response_class=ORJSONResponse)
def api_replay(run_id: str):
    replay_dir = _replay_run_dir(run_id)
    run_index_path = replay_dir / "run_index.json"
    events_path = replay_dir / "events" / "events.json"
    if not run_index_path.exists() or not events_path.exists():
        raise HTTPException(404, "replay files missing")
    run_index = json.loads(run_index_path.read_text(encoding="utf-8"))
    events = json.loads(events_path.read_text(encoding="utf-8")).get("events", [])
    return ORJSONResponse({"run": run_index, "events": events})


@app.get("/api/price/{date}/{symbol}", response_class=ORJSONResponse)
def api_price(
    date: str,
    symbol: str,
    session: str = Query("all"),
    resolution: int = Query(1, ge=1, le=60),
    use_clean: bool = Query(False),
    spike_filter: Optional[str] = Query(None),
    spike_window: int = Query(3, ge=1, le=21),
    replay_run: Optional[str] = Query(None),
):
    replay_events = []
    if replay_run:
        replay_dir = _replay_run_dir(replay_run)
        events_path = replay_dir / "events" / "events.json"
        if events_path.exists():
            replay_events = [
                event for event in json.loads(events_path.read_text(encoding="utf-8")).get("events", [])
                if event.get("date") == date and event.get("symbol") == symbol
            ]
        try:
            df = _load_replay_csv(replay_dir, date, symbol)
        except HTTPException:
            df = _load_data(date, symbol)
    else:
        df = _load_data(date, symbol)
    if df.empty:
        raise HTTPException(404, "no data")

    df = _filter_session(df, session)
    if df.empty:
        raise HTTPException(404, "no data for session")

    if spike_filter:
        if spike_filter not in {"hampel"}:
            raise HTTPException(400, f"invalid spike_filter: {spike_filter}")
        df = _apply_spike_filter(df, spike_filter, spike_window)

    df_agg = _aggregate(df, resolution)

    if use_clean and "clean_open" in df_agg.columns:
        o_col, h_col, l_col, c_col = "clean_open", "clean_high", "clean_low", "clean_close"
    else:
        o_col, h_col, l_col, c_col = "open", "high", "low", "close"

    times = df_agg["time"].values
    opens = df_agg[o_col].values.astype(float)
    highs = df_agg[h_col].values.astype(float)
    lows = df_agg[l_col].values.astype(float)
    closes = df_agg[c_col].values.astype(float)

    candles = [{
        "time": int(times[i]),
        "open": round(float(opens[i]), 4),
        "high": round(float(highs[i]), 4),
        "low": round(float(lows[i]), 4),
        "close": round(float(closes[i]), 4),
    } for i in range(len(times))]

    amounts = df_agg["amount"].values.astype(float)
    amount_bars = _build_volume_bars(times, opens, closes, amounts)
    vwap = _compute_vwap(df_agg)
    mas = {str(p): _compute_ma(closes, times, p) for p in MA_PERIODS}
    amt_values = np.array([v["value"] for v in amount_bars], dtype=float)
    amt_times = np.array([v["time"] for v in amount_bars], dtype=int)
    amount_ma = _compute_ma(amt_values, amt_times, 20)

    first_open = float(opens[0])
    last_close = float(closes[-1])
    change_pct = ((last_close - first_open) / first_open * 100) if first_open else 0
    high_idx = int(np.argmax(highs))
    low_idx = int(np.argmin(lows))
    stats = {
        "open": round(first_open, 4),
        "high": round(float(highs.max()), 4),
        "low": round(float(lows.min()), 4),
        "close": round(last_close, 4),
        "change": round(last_close - first_open, 4),
        "change_pct": round(change_pct, 2),
        "volume": int(df_agg["volume"].sum()),
        "data_points": len(df_agg),
        "first_time": int(times[0]),
        "last_time": int(times[-1]),
        "high_time": int(times[high_idx]),
        "low_time": int(times[low_idx]),
        "loaded_high": round(float(highs.max()), 4),
        "loaded_low": round(float(lows.min()), 4),
        "loaded_high_time": int(times[high_idx]),
        "loaded_low_time": int(times[low_idx]),
    }

    market_open_time = None
    for t in times:
        ts = pd.Timestamp(int(t), unit="s", tz="UTC")
        if ts.hour == 14 and ts.minute == 30:
            market_open_time = int(t)
            break
        elif ts.hour == 14 and ts.minute > 30:
            market_open_time = int(t)
            break
        elif ts.hour > 14 and market_open_time is None:
            market_open_time = int(t)
            break

    return ORJSONResponse({
        "date": date,
        "symbol": symbol,
        "session": session,
        "resolution": resolution,
        "candles": candles,
        "volume": amount_bars,
        "vwap": vwap,
        "mas": mas,
        "volume_ma": amount_ma,
        "stats": stats,
        "market_open_time": market_open_time,
        "replay_events": replay_events,
    })


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
