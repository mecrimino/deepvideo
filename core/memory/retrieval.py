"""
Memory Retrieval Pipeline (7.13) + Ranking (7.14).

    prompt → embed → search vector DB → top memories → rank → context to LLM

Vector search proposes candidates by meaning; ranking then reorders them using
five factors — similarity, recency, user rating, confidence and usage frequency
(7.14) — because the closest match is not always the most useful one. Retrieved
memories have their usage bumped so popular knowledge surfaces faster next time.
"""

from __future__ import annotations

import math
import time
from typing import Optional

from core.memory.models import MemoryHit, RankFactors
from core.memory.store import Store, get_store
from core.memory.vector_store import VectorStore

# 7.14 ranking weights (sum to 1.0)
_W_SIM, _W_REC, _W_RATE, _W_CONF, _W_USE = 0.55, 0.15, 0.15, 0.10, 0.05


class RetrievalPipeline:
    def __init__(self, store: Optional[Store] = None, vector: Optional[VectorStore] = None) -> None:
        self._store = store or get_store()
        self._vector = vector or VectorStore()

    def retrieve(
        self,
        query: str,
        *,
        top_k: int = 5,
        kind: Optional[str] = None,
        scope: Optional[str] = None,
        min_similarity: float = 0.05,
    ) -> list[MemoryHit]:
        candidates = self._vector.search(query, top_k=top_k, kind=kind, scope=scope)
        if not candidates:
            return []
        records = self._store.many([cid for cid, _ in candidates])
        now = time.time()
        hits: list[MemoryHit] = []
        for cid, sim in candidates:
            rec = records.get(cid)
            if rec is None or sim < min_similarity:
                continue
            factors = self._rank(sim, rec, now)
            hits.append(MemoryHit(
                id=rec.id, kind=rec.kind.value, text=rec.text, metadata=rec.metadata,
                score=factors.overall, similarity=sim, factors=factors,
            ))
        hits.sort(key=lambda h: h.score, reverse=True)
        top = hits[:top_k]
        for h in top:                      # usage frequency feeds future ranking
            self._store.bump_uses(h.id)
        return top

    @staticmethod
    def _rank(similarity: float, rec, now: float) -> RankFactors:
        age_days = max(0.0, (now - float(rec.updated_at or now)) / 86400.0)
        recency = math.exp(-age_days / 30.0)               # decays over ~30 days
        usage = 1.0 - math.exp(-float(rec.uses or 0) / 5.0)  # saturating 0..1
        overall = (
            _W_SIM * similarity + _W_REC * recency + _W_RATE * float(rec.rating)
            + _W_CONF * float(rec.confidence) + _W_USE * usage
        )
        return RankFactors(
            similarity=round(similarity, 3), recency=round(recency, 3),
            rating=round(float(rec.rating), 3), confidence=round(float(rec.confidence), 3),
            usage=round(usage, 3), overall=round(overall, 4),
        )
