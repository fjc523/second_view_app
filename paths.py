"""Local parquet directory resolution for second_view_app.

Checks PARQUET_DIR env var first, then tries candidate paths in order.
"""
from __future__ import annotations

import os
from pathlib import Path

PARQUET_DIR_CANDIDATES = [
    Path("/Volumes/ssd/us_stock_data/1s_parquet"),
    Path("/Volumes/Intel SSD/StockData/1s_parquet"),
]


def resolve_parquet_dir() -> Path:
    """Return the first existing parquet directory.

    Priority: PARQUET_DIR env var > candidates list.
    """
    env = os.environ.get("PARQUET_DIR")
    if env:
        return Path(env)
    for path in PARQUET_DIR_CANDIDATES:
        if path.exists():
            return path
    # Fall back to the first candidate so downstream errors still show a clear path.
    return PARQUET_DIR_CANDIDATES[0]


DEFAULT_PARQUET_DIR = resolve_parquet_dir()
