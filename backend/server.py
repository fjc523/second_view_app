"""second_view – FastAPI backend for 1s stock data visualization."""
from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Optional

import numpy as np
import orjson
import pandas as pd
from fastapi import Body, FastAPI, HTTPException, Query
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from .paths import DEFAULT_PARQUET_DIR as PARQUET_DIR

REPO_ROOT = Path(__file__).resolve().parents[1]
STATIC_DIR = REPO_ROOT / "static"
EVENT_LIST_DIR = REPO_ROOT.parent / "exps" / "event_list"
AUTO_RESEARCH_DIR = REPO_ROOT.parent / "auto_research"
ALPHA_SECOND_V2_EVENT_DIR = REPO_ROOT.parent / "alpha_second_v2" / "event"
REPLAY_ROOT = Path(os.environ.get("REPLAY_ROOT", str(REPO_ROOT.parent.parent / "reports")))
REVIEW_ROOT = REPLAY_ROOT / "_review_marks"
REVIEW_ROOT.mkdir(parents=True, exist_ok=True)

DATE_RE = re.compile(r"^\d{8}$")
SYMBOL_RE = re.compile(r"^[A-Za-z0-9._-]+$")
EVENT_FILE_RE = re.compile(r"^[A-Za-z0-9._-]+\.csv$")

MA_PERIODS = [5, 100, 200]

# ET session boundaries (in UTC hours)
SESSION_BOUNDS = {
    "premarket": (9, 0, 14, 30),  # 04:00–09:30 ET → 09:00–14:30 UTC
    "market": (14, 30, 21, 0),  # 09:30–16:00 ET → 14:30–21:00 UTC
    "afterhours": (21, 0, 25, 0),  # 16:00–20:00 ET → 21:00–01:00+1 UTC (25 = next day 01)
}

app = FastAPI(title="second_view", version="2.0.0")
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
        return orjson.dumps(content, option=orjson.OPT_SERIALIZE_NUMPY)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _validate_date(d: str) -> None:
    if not DATE_RE.match(d):
        raise HTTPException(400, "invalid date format")


def _validate_symbol(s: str) -> None:
    if not SYMBOL_RE.match(s):
        raise HTTPException(400, "invalid symbol format")


def _validate_event_file(name: str) -> None:
    if not EVENT_FILE_RE.match(name):
        raise HTTPException(400, "invalid event file")


def _to_epoch_seconds(ts: pd.Series) -> pd.Series:
    naive_utc = ts.dt.tz_convert("UTC").dt.tz_localize(None)
    seconds = naive_utc.to_numpy(dtype="datetime64[s]").astype("int64")
    return pd.Series(seconds, index=ts.index, dtype="int64")


@lru_cache(maxsize=128)
def _load_data(date: str, symbol: str) -> pd.DataFrame:
    """Load and cache data from local parquet."""
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
    df["time"] = _to_epoch_seconds(df["bob"])
    return df


def _list_event_files() -> list[dict]:
    files = []
    # 1) exps/event_list/*.csv
    if EVENT_LIST_DIR.exists():
        for path in EVENT_LIST_DIR.glob("*.csv"):
            files.append(
                {
                    "name": path.name,
                    "label": path.stem,
                    "mtime": int(path.stat().st_mtime),
                    "_path": path,
                }
            )
    # 2) auto_research/*/runs/*/events.csv  — use exp dir name as display name
    if AUTO_RESEARCH_DIR.exists():
        for events_csv in AUTO_RESEARCH_DIR.glob("*/runs/*/events.csv"):
            exp_name = events_csv.parent.name  # e.g. exp_002_gap_ratio_2_test_260322_222244
            display = f"{exp_name}.csv"
            files.append(
                {
                    "name": display,
                    "label": exp_name,
                    "mtime": int(events_csv.stat().st_mtime),
                    "_path": events_csv,
                }
            )
    # 3) alpha_second_v2/event/*/event.csv  — use event dir name as display name
    if ALPHA_SECOND_V2_EVENT_DIR.exists():
        for event_csv in ALPHA_SECOND_V2_EVENT_DIR.glob("*/event.csv"):
            event_name = event_csv.parent.name
            display = f"{event_name}.csv"
            files.append(
                {
                    "name": display,
                    "label": event_name,
                    "mtime": int(event_csv.stat().st_mtime),
                    "_path": event_csv,
                }
            )
        # 4) alpha_second_v2/event/*/strategy_*/trades.csv — strategy trade cases
        for trades_csv in ALPHA_SECOND_V2_EVENT_DIR.glob("*/strategy_*/trades.csv"):
            event_name = trades_csv.parent.parent.name
            strategy_name = trades_csv.parent.name
            display = f"{event_name}__{strategy_name}.csv"
            files.append(
                {
                    "name": display,
                    "label": f"{event_name} / {strategy_name}",
                    "mtime": int(trades_csv.stat().st_mtime),
                    "_path": trades_csv,
                }
            )
    files.sort(key=lambda f: f["mtime"], reverse=True)
    return files


def _resolve_event_path(name: str) -> Path:
    """Resolve display name to actual file path."""
    for f in _list_event_files():
        if f["name"] == name:
            return f["_path"]
    raise HTTPException(404, "event file not found")


def _resolve_event_markers_path(event_csv_path: Path) -> Path:
    return event_csv_path.parent / "event_markers.json"


def _parse_event_timestamp(
    date_value: object,
    time_value: object,
    error_message: str = "invalid event datetime format",
) -> tuple[pd.Timestamp, pd.Timestamp, pd.Timestamp]:
    ts = pd.to_datetime(
        f"{str(date_value)} {str(time_value)}",
        format="%y-%m-%d %H:%M:%S",
        errors="coerce",
    )
    if pd.isna(ts):
        raise HTTPException(400, error_message)
    ts_bj = pd.Timestamp(ts).tz_localize("Asia/Shanghai")
    return ts_bj, ts_bj.tz_convert("UTC"), ts_bj.tz_convert("US/Eastern")


@lru_cache(maxsize=32)
def _load_event_markers_map(path_str: str, mtime_ns: int) -> dict[str, dict[str, object]]:
    path = Path(path_str)
    if not path.exists():
        return {}

    try:
        payload = orjson.loads(path.read_bytes())
    except Exception as exc:  # pragma: no cover - defensive JSON guard
        raise HTTPException(400, "invalid event markers json") from exc

    if not isinstance(payload, dict):
        raise HTTPException(400, "invalid event markers json")

    events = payload.get("events", {})
    if not isinstance(events, dict):
        raise HTTPException(400, "invalid event markers json")

    result: dict[str, dict[str, object]] = {}
    for row_key, event_payload in events.items():
        if not isinstance(event_payload, dict):
            raise HTTPException(400, "invalid event markers json")
        markers = event_payload.get("markers", [])
        if markers is None:
            markers = []
        if not isinstance(markers, list):
            raise HTTPException(400, "invalid event markers json")
        anchor_index = event_payload.get("anchor_index", 0)
        try:
            anchor_index = int(anchor_index)
        except (TypeError, ValueError) as exc:
            raise HTTPException(400, "invalid event markers json") from exc
        result[str(row_key)] = {
            "anchor_index": anchor_index,
            "markers": markers,
        }
    return result


def _build_default_event_marker(
    date_str: str,
    time_str: str,
    event_epoch: int,
    event_date_et: str,
    event_time_et: str,
) -> dict[str, object]:
    return {
        "seq": 1,
        "date": date_str,
        "time": time_str,
        "label": "Event",
        "event_epoch": event_epoch,
        "event_date_et": event_date_et,
        "event_time_et": event_time_et,
        "is_anchor": True,
    }


def _normalize_event_markers(
    marker_payload: dict[str, object] | None,
    expected_count: Optional[int],
    default_marker: dict[str, object],
) -> tuple[list[dict[str, object]], dict[str, object]]:
    if not marker_payload:
        return [default_marker], default_marker

    raw_markers = marker_payload.get("markers", [])
    if not isinstance(raw_markers, list):
        raise HTTPException(400, "invalid event markers json")

    if expected_count is not None and len(raw_markers) != expected_count:
        raise HTTPException(400, "event markers count mismatch")

    if not raw_markers:
        return [default_marker], default_marker

    anchor_index = marker_payload.get("anchor_index", 0)
    if not isinstance(anchor_index, int):
        raise HTTPException(400, "invalid event markers json")
    if anchor_index < 0 or anchor_index >= len(raw_markers):
        raise HTTPException(400, "invalid event markers anchor index")

    markers: list[dict[str, object]] = []
    for idx, raw_marker in enumerate(raw_markers):
        if not isinstance(raw_marker, dict):
            raise HTTPException(400, "invalid event markers json")

        date_str = str(raw_marker.get("date", "")).strip()
        time_str = str(raw_marker.get("time", "")).strip()
        if not date_str or not time_str:
            raise HTTPException(400, "invalid event markers json")

        _, ts_utc, ts_et = _parse_event_timestamp(
            date_str,
            time_str,
            error_message="invalid event markers datetime format",
        )
        label = str(raw_marker.get("label", "")).strip() or f"M{idx + 1}"
        seq_raw = raw_marker.get("seq", idx + 1)
        try:
            seq = int(seq_raw)
        except (TypeError, ValueError):
            seq = idx + 1

        marker = {
            "seq": seq,
            "date": date_str,
            "time": time_str,
            "label": label,
            "event_epoch": int(ts_utc.timestamp()),
            "event_date_et": ts_et.strftime("%Y%m%d"),
            "event_time_et": ts_et.strftime("%H:%M:%S"),
            "is_anchor": idx == anchor_index,
        }
        for extra_key in (
            "source",
            "source_account",
            "add_size",
            "source_row",
            "marker_type",
            "entry_price",
            "exit_price",
            "exit_reason",
            "signal_band",
        ):
            if extra_key in raw_marker and raw_marker[extra_key] is not None:
                marker[extra_key] = raw_marker[extra_key]
        markers.append(marker)

    return markers, markers[anchor_index]


@lru_cache(maxsize=32)
def _load_event_rows(name: str, mtime_ns: int, markers_mtime_ns: int) -> list[dict]:
    path = _resolve_event_path(name)
    if not path.exists():
        raise HTTPException(404, "event file not found")

    markers_path = _resolve_event_markers_path(path)
    markers_map = _load_event_markers_map(str(markers_path), markers_mtime_ns)

    df = pd.read_csv(path)
    required = {"symbol", "date", "time"}
    if not required.issubset(df.columns):
        raise HTTPException(400, "invalid event csv format")

    if df.empty:
        return []

    rows = []
    for i, row in df.reset_index(drop=True).iterrows():
        date_str = str(row["date"])
        time_str = str(row["time"])
        _, ts_utc, ts_et = _parse_event_timestamp(date_str, time_str)
        event_epoch = int(ts_utc.timestamp())
        event_date_et = ts_et.strftime("%Y%m%d")
        event_time_et = ts_et.strftime("%H:%M:%S")

        row_value = None
        marker_payload = None
        if "row" in df.columns and pd.notna(row["row"]):
            try:
                row_value = int(row["row"])
            except (TypeError, ValueError):
                row_value = None
        if row_value is not None:
            marker_payload = markers_map.get(str(row_value))

        expected_count = None
        if "count" in df.columns and pd.notna(row["count"]):
            try:
                expected_count = int(row["count"])
            except (TypeError, ValueError):
                expected_count = None

        default_marker = _build_default_event_marker(
            date_str=date_str,
            time_str=time_str,
            event_epoch=event_epoch,
            event_date_et=event_date_et,
            event_time_et=event_time_et,
        )
        markers, anchor_marker = _normalize_event_markers(
            marker_payload=marker_payload,
            expected_count=expected_count,
            default_marker=default_marker,
        )

        event_row = {
            "id": i,
            "symbol": str(row["symbol"]).upper(),
            "date": date_str,
            "time": time_str,
            "notes": str(row["notes"]) if "notes" in df.columns and pd.notna(row["notes"]) else "",
            "event_epoch": event_epoch,
            "event_date_et": event_date_et,
            "event_time_et": event_time_et,
            "markers": markers,
            "marker_count": len(markers),
            "anchor_marker_epoch": int(anchor_marker["event_epoch"]),
            "anchor_marker_date_et": str(anchor_marker["event_date_et"]),
            "anchor_marker_time_et": str(anchor_marker["event_time_et"]),
        }
        if row_value is not None:
            event_row["row"] = row_value
        rows.append(event_row)
    return rows


_dates_cache: list[str] | None = None
SUMMARY_SYMBOL_LIMIT = 25


def _list_dates() -> list[str]:
    """List available dates from a reference symbol across all available parquet years."""
    global _dates_cache
    if _dates_cache is not None:
        return _dates_cache

    ref_dir = PARQUET_DIR / "AAPL"
    if not ref_dir.exists():
        dirs = sorted(p for p in PARQUET_DIR.iterdir() if p.is_dir()) if PARQUET_DIR.exists() else []
        ref_dir = dirs[0] if dirs else None
    if ref_dir is None or not ref_dir.exists():
        return []

    dates_set: set[str] = set()
    for ref in sorted(ref_dir.glob("*.parquet")):
        df = pd.read_parquet(ref, columns=["bob"])
        dates_set.update(df["bob"].dt.date.astype(str).str.replace("-", "").unique().tolist())

    dates = sorted(dates_set, reverse=True)
    _dates_cache = list(dates)
    return _dates_cache


def _date_key_from_bob(series: pd.Series) -> pd.Series:
    """Return YYYYMMDD date keys in US/Eastern time."""
    if series.dt.tz is not None:
        return series.dt.tz_convert("US/Eastern").dt.strftime("%Y%m%d")
    return series.dt.strftime("%Y%m%d")


@lru_cache(maxsize=128)
def _load_symbol_year_summary(symbol: str, year: str) -> dict[str, dict[str, object]]:
    """Summarize one symbol/year parquet by ET date.

    This is intentionally separate from the hot `/api/price` path. It is only
    used when callers explicitly ask `/api/dates?include_summary=true`.
    """
    _validate_symbol(symbol)
    pq_path = PARQUET_DIR / symbol / f"{year}.parquet"
    if not pq_path.exists():
        return {}

    df = pd.read_parquet(pq_path, columns=["bob", "open", "close", "volume"])
    if df.empty:
        return {}

    df = df.copy()
    df["date"] = _date_key_from_bob(df["bob"])
    grouped = (
        df.groupby("date", sort=False)
        .agg(open=("open", "first"), close=("close", "last"), volume=("volume", "sum"))
        .reset_index()
    )

    summaries: dict[str, dict[str, object]] = {}
    for row in grouped.itertuples(index=False):
        first_open = float(row.open)
        last_close = float(row.close)
        change_pct = ((last_close - first_open) / first_open * 100) if first_open else 0.0
        summaries[str(row.date)] = {
            "symbol": symbol,
            "close": round(last_close, 4),
            "change_pct": round(change_pct, 2),
            "volume": int(row.volume),
        }
    return summaries


def _parse_summary_symbols(symbols: str) -> list[str]:
    all_symbols = _get_all_symbols()
    symbol_lookup = {s.upper(): s for s in all_symbols}

    if not symbols.strip():
        if "AAPL" in symbol_lookup:
            return [symbol_lookup["AAPL"]]
        return all_symbols[:1]

    selected: list[str] = []
    seen: set[str] = set()
    for raw in symbols.split(","):
        symbol = raw.strip()
        if not symbol:
            continue
        _validate_symbol(symbol)
        key = symbol.upper()
        if key in seen:
            continue
        if key not in symbol_lookup:
            raise HTTPException(404, f"symbol not found: {symbol}")
        selected.append(symbol_lookup[key])
        seen.add(key)

    if len(selected) > SUMMARY_SYMBOL_LIMIT:
        raise HTTPException(400, f"too many symbols; max {SUMMARY_SYMBOL_LIMIT}")
    return selected


def _build_date_summaries(dates: list[str], symbols: list[str]) -> dict[str, list[dict[str, object]]]:
    result: dict[str, list[dict[str, object]]] = {date: [] for date in dates}
    years = sorted({date[:4] for date in dates})
    for symbol in symbols:
        for year in years:
            yearly = _load_symbol_year_summary(symbol, year)
            for date, summary in yearly.items():
                if date in result:
                    result[date].append(summary)
    return result


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
    """Aggregate 1s bars into N-second bars."""
    df = df.copy()
    resolution = max(int(resolution), 1)
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
    """Fill missing time buckets so bars render without gaps."""
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
    """Cumulative VWAP = cumsum(amount) / cumsum(volume)."""
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
    """Simple moving average."""
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
    df["time"] = _to_epoch_seconds(df["bob"])
    return df


def _review_marks_path(run_id: str) -> Path:
    return REVIEW_ROOT / f"{run_id}.json"


def _load_review_marks(run_id: str) -> dict:
    path = _review_marks_path(run_id)
    if not path.exists():
        return {"run_id": run_id, "marks": {}}
    return json.loads(path.read_text(encoding="utf-8"))


def _save_review_marks(run_id: str, payload: dict) -> dict:
    path = _review_marks_path(run_id)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/dates", response_class=ORJSONResponse)
def api_dates(
    include_summary: bool = Query(False),
    symbols: str = Query("", max_length=1000),
):
    dates = _list_dates()
    if include_summary:
        selected_symbols = _parse_summary_symbols(symbols)
        result = _build_date_summaries(dates, selected_symbols)
        return ORJSONResponse({"dates": result, "summary_symbols": selected_symbols})

    result = {date: [] for date in dates}
    return ORJSONResponse({"dates": result, "summary_symbols": []})


_symbol_cache: list[str] | None = None
_symbol_cache_time: float = 0


def _get_all_symbols() -> list[str]:
    """Get cached list of all symbols from local parquet directory."""
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
    """Search symbols by prefix (case-insensitive)."""
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


@app.get("/api/review/{run_id}", response_class=ORJSONResponse)
def api_review_marks(run_id: str):
    _replay_run_dir(run_id)
    return ORJSONResponse(_load_review_marks(run_id))


@app.post("/api/review/{run_id}", response_class=ORJSONResponse)
def api_save_review_marks(run_id: str, payload: dict = Body(...)):
    _replay_run_dir(run_id)
    marks = payload.get("marks") if isinstance(payload, dict) else None
    if not isinstance(marks, dict):
        raise HTTPException(400, "invalid review payload")
    return ORJSONResponse(_save_review_marks(run_id, {"run_id": run_id, "marks": marks}))


@app.get("/api/event-lists", response_class=ORJSONResponse)
def api_event_lists():
    files = _list_event_files()
    return ORJSONResponse({"files": [{k: v for k, v in f.items() if k != "_path"} for f in files]})


@app.get("/api/event-lists/{name}", response_class=ORJSONResponse)
def api_event_list_rows(name: str):
    path = _resolve_event_path(name)
    markers_path = _resolve_event_markers_path(path)
    markers_mtime_ns = markers_path.stat().st_mtime_ns if markers_path.exists() else 0
    rows = _load_event_rows(name, path.stat().st_mtime_ns, markers_mtime_ns)
    return ORJSONResponse({"name": name, "rows": rows})


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

    candles = []
    for i in range(len(times)):
        candles.append(
            {
                "time": int(times[i]),
                "open": round(float(opens[i]), 4),
                "high": round(float(highs[i]), 4),
                "low": round(float(lows[i]), 4),
                "close": round(float(closes[i]), 4),
            }
        )

    amounts = df_agg["amount"].values.astype(float)
    amount_bars = _build_volume_bars(times, opens, closes, amounts)

    vwap = _compute_vwap(df_agg)

    mas = {}
    for p in MA_PERIODS:
        mas[str(p)] = _compute_ma(closes, times, p)

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

    return ORJSONResponse(
        {
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
        }
    )


def main() -> None:
    import uvicorn

    # Use a less common default port to reduce local collisions.
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8787"))
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()
