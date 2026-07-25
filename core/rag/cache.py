"""
Query Cache (8.16) — repeated searches shouldn't always hit the database.

    query → cache? → yes: return cached · no: retrieve → store in cache

A small disk-backed cache keyed by the query (+ params) with a TTL, cutting
latency and cost for repeated research queries.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any, Optional

from core.config import get_settings


class QueryCache:
    def __init__(self, ttl_sec: float = 86400.0) -> None:
        self.ttl = ttl_sec
        self.dir: Path = get_settings().paths.cache / "rag_cache"
        self.dir.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return self.dir / f"{digest}.json"

    def get(self, key: str) -> Optional[Any]:
        p = self._path(key)
        if not p.exists():
            return None
        try:
            blob = json.loads(p.read_text("utf-8"))
        except Exception:
            return None
        if time.time() - blob.get("at", 0) > self.ttl:
            return None
        return blob.get("value")

    def set(self, key: str, value: Any) -> None:
        try:
            self._path(key).write_text(json.dumps({"at": time.time(), "value": value}), "utf-8")
        except Exception:
            pass
