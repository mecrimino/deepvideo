"""
Search cache + Asset Memory lookup (12.15).

Before searching/downloading, check whether a suitable asset is already known
(Asset Memory, Ch7.10) — reusing it saves bandwidth and time. Also caches raw
provider search results per query on disk (tools.md SQLite + disk cache).
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
        self.dir: Path = get_settings().paths.cache / "image_search"
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


class AssetMemoryLookup:
    """12.15 — check the Asset Memory (Ch7.10) before downloading."""

    def __init__(self, memory) -> None:
        self.memory = memory

    def find(self, request) -> Optional[dict]:
        if self.memory is None:
            return None
        query = request.visual_goal or " ".join(request.keywords)
        try:
            hits = self.memory.assets.find(query, top_k=1)
        except Exception:
            return None
        if hits and hits[0].similarity >= 0.5:
            asset = self.memory.assets.by_id(hits[0].metadata.get("asset_id", ""))
            return asset.model_dump() if asset else None
        return None
