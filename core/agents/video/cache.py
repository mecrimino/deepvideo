"""
Search cache + Asset Memory / Video Index (13.18).

Previously analyzed videos should never be reprocessed: a fingerprint lookup in
the Asset Memory (Ch7.10) returns cached shot metadata instead of downloading and
analysing again — index once, reuse many times (13.18/13.21). Also caches raw
provider search results per query.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any, Optional

from core.config import get_settings


class SearchCache:
    def __init__(self, ttl_sec: float = 86400.0) -> None:
        self.ttl = ttl_sec
        self.dir: Path = get_settings().paths.cache / "video_search"
        self.dir.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        return self.dir / (hashlib.sha256(key.encode()).hexdigest() + ".json")

    def get(self, key: str) -> Optional[Any]:
        p = self._path(key)
        if not p.exists():
            return None
        try:
            blob = json.loads(p.read_text("utf-8"))
        except Exception:
            return None
        return blob.get("value") if time.time() - blob.get("at", 0) <= self.ttl else None

    def set(self, key: str, value: Any) -> None:
        try:
            self._path(key).write_text(json.dumps({"at": time.time(), "value": value}), "utf-8")
        except Exception:
            pass


def fingerprint(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:16]


class VideoIndexLookup:
    """13.18 — check the Asset Memory for an already-indexed video."""

    def __init__(self, memory) -> None:
        self.memory = memory

    def indexed(self, url: str) -> Optional[dict]:
        if self.memory is None:
            return None
        try:
            asset = self.memory.assets.by_id(f"vid_{fingerprint(url)}")
            return asset.model_dump() if asset else None
        except Exception:
            return None
