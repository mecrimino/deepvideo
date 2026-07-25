"""
Vector Index (8.7 / 8.8) — embeddings in a ChromaDB "knowledge" collection.

Separate from the memory collection: this holds *document chunks* for research.
Embeddings come from the shared project embedder (BGE/Nomic later), so similar
topics land close together and semantic search returns related concepts, not just
keyword matches ("stealth aircraft" → F-22, F-35, B-2).
"""

from __future__ import annotations

from typing import Optional

import chromadb
from chromadb.api.types import Documents, EmbeddingFunction, Embeddings

from core.config import get_settings
from core.memory.embedder import get_embedder
from core.rag.models import Chunk
from core.utils.logging import get_logger

log = get_logger("rag.vector")


class _EF(EmbeddingFunction):
    def __call__(self, input: Documents) -> Embeddings:
        return get_embedder().embed_batch(list(input))

    def name(self) -> str:
        return get_embedder().name


class VectorIndex:
    _client = None

    def __init__(self) -> None:
        if VectorIndex._client is None:
            path = get_settings().paths.cache / "chroma"
            path.mkdir(parents=True, exist_ok=True)
            VectorIndex._client = chromadb.PersistentClient(path=str(path))
        self._col = VectorIndex._client.get_or_create_collection(
            name="knowledge", embedding_function=_EF(), metadata={"hnsw:space": "cosine"},
        )

    def add(self, chunks: list[Chunk]) -> None:
        if not chunks:
            return
        try:
            self._col.upsert(
                ids=[c.id for c in chunks],
                documents=[c.text for c in chunks],
                metadatas=[{"doc_id": c.doc_id, "source_id": c.source.id,
                            "topic": c.source.topic or "", "authority": c.source.authority}
                           for c in chunks],
            )
        except Exception as exc:
            log.warning("vector add failed: %s", exc)

    def search(self, query: str, *, top_k: int = 20, topic: Optional[str] = None) -> list[tuple[str, float]]:
        n = self.count()
        if n == 0:
            return []
        where = {"topic": topic} if topic else None
        try:
            res = self._col.query(query_texts=[query], n_results=min(top_k, n),
                                  where=where, include=["distances"])
        except Exception as exc:
            log.warning("vector query failed: %s", exc)
            return []
        ids = (res.get("ids") or [[]])[0]
        dists = (res.get("distances") or [[]])[0]
        return [(i, 1.0 - float(d)) for i, d in zip(ids, dists)]

    def count(self) -> int:
        try:
            return self._col.count()
        except Exception:
            return 0

    def delete_doc(self, doc_id: str) -> None:
        try:
            self._col.delete(where={"doc_id": doc_id})
        except Exception:
            pass
