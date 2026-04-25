"""Local parquet directory resolution for second_view_app.

Best practice for multi-dev machines:
- The parquet root directory is configured via `PARQUET_DIR`.
- `PARQUET_DIR` may come from the environment or from a local `.env` file.
- `.env` is intentionally not committed; see `.env.example`.
"""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
DOTENV_PATH = REPO_ROOT / ".env"


def _load_dotenv(path: Path = DOTENV_PATH) -> None:
    """Load a minimal .env file into process env (no external deps).

    Rules:
    - Supports `KEY=VALUE` lines, ignores blanks and `#` comments.
    - Does not override variables that are already set in the environment.
    - Supports optional single/double quotes around VALUE.
    """
    if not path.exists():
        return
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if (len(value) >= 2) and ((value[0] == value[-1]) and value[0] in ("'", '"')):
            value = value[1:-1]
        os.environ.setdefault(key, value)


def resolve_parquet_dir() -> Path:
    """Resolve parquet directory from `.env`/environment.

    Required:
    - `PARQUET_DIR` must be set and point to an existing directory.
    """
    _load_dotenv()

    env = os.environ.get("PARQUET_DIR", "").strip()
    if not env:
        raise RuntimeError(
            "PARQUET_DIR is not set. Create a .env (see .env.example) or export PARQUET_DIR."
        )

    path = Path(env).expanduser()
    if not path.exists() or not path.is_dir():
        raise RuntimeError(f"PARQUET_DIR does not exist or is not a directory: {path}")
    return path


DEFAULT_PARQUET_DIR = resolve_parquet_dir()

