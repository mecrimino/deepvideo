"""
Asset Memory (7.10) — remember every asset the system has used.

Tracks source, license, tags, which scenes used it and a quality score. Benefits:
avoid duplicate downloads, reuse high-quality assets, and keep licensing
auditable. Lookup is by id (exact) or by meaning (tags, via vector search).
"""

from __future__ import annotations

from typing import Optional

from core.memory.models import AssetMemory, MemoryHit, MemoryKind, MemoryRecord

_SCOPE = "assets"


class AssetMemoryStore:
    def __init__(self, backend) -> None:
        self.b = backend

    def _record_for(self, asset_id: str) -> Optional[MemoryRecord]:
        for rec in self.b.store.list(kind=MemoryKind.ASSET.value, scope=_SCOPE):
            if rec.metadata.get("asset_id") == asset_id:
                return rec
        return None

    def remember(self, asset: AssetMemory) -> MemoryRecord:
        existing = self._record_for(asset.asset_id)
        meta = asset.model_dump()
        if existing is not None:
            existing.text = asset.to_text()
            existing.metadata = meta
            existing.rating = asset.quality_score
            return self.b.save_record(existing)
        return self.b.save(asset.to_text(), kind=MemoryKind.ASSET, scope=_SCOPE,
                           metadata=meta, rating=asset.quality_score, confidence=0.9)

    def by_id(self, asset_id: str) -> Optional[AssetMemory]:
        rec = self._record_for(asset_id)
        return AssetMemory(**rec.metadata) if rec else None

    def find(self, query: str, *, top_k: int = 5) -> list[MemoryHit]:
        return self.b.retrieval.retrieve(query, top_k=top_k, kind=MemoryKind.ASSET.value, scope=_SCOPE)

    def mark_used(self, asset_id: str, scene: int) -> None:
        asset = self.by_id(asset_id)
        if asset and scene not in asset.scenes_used:
            asset.scenes_used.append(scene)
            self.remember(asset)
