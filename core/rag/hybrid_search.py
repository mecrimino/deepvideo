"""
Hybrid Search (8.9) — keyword + vector + knowledge graph, merged.

Semantic search alone isn't always enough, and keyword search alone misses
paraphrases. This runs both over the same chunk store, optionally expands the
query with related entities from the knowledge graph (8.14), then merges the
result sets by chunk id — combining exact and semantic matches for better recall
and precision.
"""

from __future__ import annotations

from typing import Optional

from core.rag.keyword_index import KeywordIndex, get_keyword_index
from core.rag.models import RetrievedChunk
from core.rag.vector_index import VectorIndex


class HybridSearch:
    def __init__(
        self,
        keyword: Optional[KeywordIndex] = None,
        vector: Optional[VectorIndex] = None,
        graph=None,
    ) -> None:
        self.keyword = keyword or get_keyword_index()
        self.vector = vector or VectorIndex()
        self.graph = graph  # optional core.memory KnowledgeGraph (8.14)

    def search(self, query: str, *, top_k: int = 20) -> list[RetrievedChunk]:
        vec = dict(self.vector.search(query, top_k=top_k))       # id -> similarity
        kw = dict(self.keyword.search(query, top_k=top_k))       # id -> keyword score

        # 8.14 — pull related entities from the graph and search them too
        if self.graph is not None:
            for entity in _entities(query):
                for edge in self.graph.neighbors(entity):
                    related = edge.object if edge.subject == entity else edge.subject
                    for cid, s in self.keyword.search(related, top_k=5):
                        kw[cid] = max(kw.get(cid, 0.0), s * 0.6)

        ids = set(vec) | set(kw)
        if not ids:
            return []
        chunks = self.keyword.get(list(ids))
        out: list[RetrievedChunk] = []
        for cid in ids:
            chunk = chunks.get(cid)
            if chunk is None:
                continue
            sim, ks = vec.get(cid, 0.0), kw.get(cid, 0.0)
            method = "hybrid" if (sim and ks) else ("vector" if sim else "keyword")
            out.append(RetrievedChunk(chunk=chunk, similarity=sim, keyword_score=ks, method=method))
        # provisional merge score (reranker refines this next)
        out.sort(key=lambda r: 0.6 * r.similarity + 0.4 * r.keyword_score, reverse=True)
        return out


def _entities(query: str) -> list[str]:
    """Capitalised words are likely entities to expand via the graph."""
    words = query.split()
    return [w.strip(".,") for w in words if w[:1].isupper() and len(w) > 2][:3]
