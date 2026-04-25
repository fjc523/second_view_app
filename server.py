"""Compatibility entrypoint.

Keep root-level `server:app` stable while organizing code under `backend/`.
"""

from backend.server import app, main  # re-export for `uvicorn server:app`


if __name__ == "__main__":
    main()
