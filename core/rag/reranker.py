"""
Reranking (8.10) — keep only the most useful evidence.

Retrieval may return 100 chunks; not all are equally useful. The reranker scores
each on relevance, freshness, authority and completeness, then returns the top-N
so the LLM receives concentrated, high-quality evidence. Heuristic today; a
cross-encoder (BGE reranker) can drop in later (tools.md "reranker … later").
"""

from __future__ import annotations

import re
from datetime import datetime

from core.memory.embedder import cosine
from core.rag.models import RetrievedChunk

_YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")


class Reranker:
    def rerank(self, query: str, results: list[RetrievedChunk], *, top_k: int = 10) -> list[RetrievedChunk]:
        now_year = datetime.now().year
        for r in results:
            relevance = max(r.similarity, cosine(query, r.chunk.text))
            freshness = self._freshness(r.chunk.source.published, now_year)
            authority = float(r.chunk.source.authority or 0.5)
            completeness = self._completeness(r.chunk.text)
            r.rerank_score = round(
                0.50 * relevance + 0.20 * freshness + 0.20 * authority + 0.10 * completeness, 4
            )
        results.sort(key=lambda r: r.rerank_score, reverse=True)
        return results[:top_k]

    @staticmethod
    def _freshness(published: str, now_year: int) -> float:
        m = _YEAR_RE.search(published or "")
        if not m:
            return 0.5
        year = int(m.group(0))
        return max(0.0, min(1.0, 1.0 - (now_year - year) / 10.0))  # decays over 10y

    @staticmethod
    def _completeness(text: str) -> float:
        n = len(text)
        if n < 120:
            return n / 120.0            # too short → penalised
        if n > 1600:
            return max(0.4, 1600.0 / n)  # too long → mild penalty
        return 1.0
