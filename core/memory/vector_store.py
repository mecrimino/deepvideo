"""
Vector memory on ChromaDB (7.12) — search by meaning, not exact words.

    "American stealth fighter"  ➜  finds  "F-22 Raptor"

ChromaDB (tools.md vector DB) stores each record's embedding keyed by its id,
plus a little metadata for filtering (kind, scope). The embedding function is the
pluggable project embedder, so search runs fully offline. Similarity is derived
from Chroma's cosine distance; the full record + ranking come from the store.
"""

from __future__ import annotations

from typing import Optional

import chromadb
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings

from core.config import get_settings
from core.memory.embedder import get_embedder
from core.utils.logging import get_logger

log = get_logger("memory.vector")


class _ProjectEmbeddingFunction(EmbeddingFunction):
    def __call__(self, input: Documents) -> Embeddings:
        return get_embedder().embed_batch(list(input))

    def name(self) -> str:
        return get_embedder().name


class VectorStore:
    _client = None

    def __init__(self) -> None:
        if VectorStore._client is None:
            path = get_settings().paths.cache / "chroma"
            path.mkdir(parents=True, exist_ok=True)
            VectorStore._client = chromadb.PersistentClient(path=str(path))
        self._col = VectorStore._client.get_or_create_collection(
            name="memories",
            embedding_function=_ProjectEmbeddingFunction(),
            metadata={"hnsw:space": "cosine"},
        )

    def add(self, rec_id: str, text: str, *, kind: str, scope: str) -> None:
        try:
            self._col.upsert(ids=[rec_id], documents=[text],
                             metadatas=[{"kind": kind, "scope": scope}])
        except Exception as exc:
            log.warning("vector add failed: %s", exc)

    def delete(self, rec_id: str) -> None:
        try:
            self._col.delete(ids=[rec_id])
        except Exception:
            pass

    def count(self) -> int:
        try:
            return self._col.count()
        except Exception:
            return 0

    def search(
        self, query: str, *, top_k: int, kind: Optional[str] = None, scope: Optional[str] = None
    ) -> list[tuple[str, float]]:
        """Return [(record_id, similarity)] best-first."""
        n = self.count()
        if n == 0:
            return []
        where = self._where(kind, scope)
        try:
            res = self._col.query(
                query_texts=[query],
                n_results=min(max(top_k * 3, top_k), n),
                where=where or None,
                include=["distances"],
            )
        except Exception as exc:
            log.warning("vector query failed: %s", exc)
            return []
        ids = (res.get("ids") or [[]])[0]
        dists = (res.get("distances") or [[]])[0]
        return [(i, 1.0 - float(d)) for i, d in zip(ids, dists)]

    @staticmethod
    def _where(kind: Optional[str], scope: Optional[str]):
        clauses = []
        if kind:
            clauses.append({"kind": kind})
        if scope:
            clauses.append({"$or": [{"scope": scope}, {"scope": "global"}]})
        if not clauses:
            return None
        return clauses[0] if len(clauses) == 1 else {"$and": clauses}
