"""Opaque id + timestamp helpers (ids are nanoid-style strings project-wide)."""

from __future__ import annotations

import secrets
import string
from datetime import datetime, timezone

_ALPHABET = string.ascii_lowercase + string.digits


def new_id(prefix: str = "", size: int = 12) -> str:
    body = "".join(secrets.choice(_ALPHABET) for _ in range(size))
    return f"{prefix}{body}" if prefix else body


def now_iso() -> str:
    """UTC timestamp in ISO-8601 (matches the TS ``new Date().toISOString()``)."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
