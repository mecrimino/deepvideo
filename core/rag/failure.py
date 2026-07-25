"""
Failure Handling (8.17) — degrade gracefully, never just stop.

    search → no results → expand query → search again →
    alternative sources (web) → fallback knowledge → notify Director

Returns whatever evidence it can salvage and emits a ``rag.retrieval.degraded``
event so the Director knows the context is weak (and can lower confidence).
"""

from __future__ import annotations

import re
from typing import Callable, Optional

from core.rag.hybrid_search import HybridSearch
from core.rag.models import RetrievedChunk
from core.utils.logging import get_logger

log = get_logger("rag.failure")

_STOP = {"the", "a", "an", "of", "to", "in", "on", "for", "why", "how", "what", "is", "are", "was"}


class FailureHandler:
    def __init__(self, search: HybridSearch, *, ingest_web=None, emit: Optional[Callable] = None) -> None:
        self.search = search
        self.ingest_web = ingest_web   # async fn(topic) -> ingests fresh web docs
        self.emit = emit

    async def recover(self, query: str, *, top_k: int = 20) -> list[RetrievedChunk]:
        # 1) expand/broaden the query to its content words
        broadened = " ".join(w for w in re.findall(r"[A-Za-z0-9]+", query) if w.lower() not in _STOP)
        if broadened and broadened != query:
            hits = self.search.search(broadened, top_k=top_k)
            if hits:
                log.info("recovered via broadened query")
                return hits

        # 2) alternative sources — fetch fresh web knowledge and retry
        if self.ingest_web is not None:
            try:
                await self.ingest_web(broadened or query)
                hits = self.search.search(query, top_k=top_k)
                if hits:
                    log.info("recovered via fresh web ingest")
                    return hits
            except Exception as exc:
                log.warning("web fallback failed: %s", exc)

        # 3) give up gracefully and notify the Director
        if self.emit:
            self.emit("rag.retrieval.degraded", query=query)
        log.warning("retrieval degraded — no evidence for %r", query[:60])
        return []
