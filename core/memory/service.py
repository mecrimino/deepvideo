"""
MemoryService (7.17) — the single memory service every agent shares.

Exposes the consistent memory API (7.18): ``save / search / update / delete /
summarize / archive`` — plus the typed memory forms (working, long-term,
episodic, semantic, procedural, preferences, assets), the knowledge graph
(7.11), the retrieval pipeline (7.13/7.14), compression (7.15), lifecycle (7.16)
and hygiene (7.19). All agents use one instance, which prevents inconsistent
information (7.17).

It also keeps the convenience methods the rest of the codebase already calls
(``working``, ``recall``, ``remember_*``, ``graph``) so it is a drop-in superset.
"""

from __future__ import annotations

from typing import Optional

from core.memory.assets import AssetMemoryStore
from core.memory.compression import Compressor
from core.memory.episodic import EpisodicMemory
from core.memory.hygiene import Hygiene
from core.memory.knowledge_graph import KnowledgeGraph
from core.memory.lifecycle import Lifecycle
from core.memory.long_term import LongTermMemory
from core.memory.models import MemoryHit, MemoryKind, MemoryRecord
from core.memory.preferences import PreferenceMemory
from core.memory.procedural import ProceduralMemory
from core.memory.retrieval import RetrievalPipeline
from core.memory.semantic import SemanticMemory
from core.memory.store import get_store
from core.memory.vector_store import VectorStore
from core.memory.working import WorkingMemory


class MemoryService:
    def __init__(self, project_id: str) -> None:
        self.project_id = project_id
        # primitives first (facades read these at construction)
        self.store = get_store()
        self.vector = VectorStore()
        self.graph = KnowledgeGraph(self.store)
        self.retrieval = RetrievalPipeline(self.store, self.vector)
        self.compressor = Compressor(self.store)
        self.working = WorkingMemory(project_id)          # 7.4
        # typed memory forms (7.5–7.10) share this service as their backend
        self.long_term = LongTermMemory(self)             # 7.5
        self.episodic = EpisodicMemory(self)              # 7.6
        self.semantic = SemanticMemory(self)              # 7.7
        self.procedural = ProceduralMemory(self)          # 7.8
        self.preferences = PreferenceMemory(self)         # 7.9
        self.assets = AssetMemoryStore(self)              # 7.10
        self.hygiene = Hygiene(self)                      # 7.19
        self.lifecycle = Lifecycle(self)                  # 7.16

    # ------------------------------------------------------------------ #
    # 7.18 — the memory API
    # ------------------------------------------------------------------ #
    def save(
        self,
        text: str,
        *,
        kind: MemoryKind | str = MemoryKind.LONG_TERM,
        scope: str = "global",
        metadata: Optional[dict] = None,
        rating: float = 0.5,
        confidence: float = 0.5,
    ) -> MemoryRecord:
        if not text or not text.strip():
            return MemoryRecord(text="")
        kindval = kind.value if isinstance(kind, MemoryKind) else str(kind)
        # de-duplicate before writing (7.19)
        dup = self.hygiene.duplicate_of(text, kind=kindval, scope=scope)
        if dup:
            self.store.bump_uses(dup)
            return self.store.get(dup)  # type: ignore[return-value]
        rec = MemoryRecord(
            kind=MemoryKind(kindval), scope=scope, text=text,
            metadata=metadata or {}, rating=rating, confidence=confidence,
        )
        self.store.upsert(rec)
        self.vector.add(rec.id, text, kind=kindval, scope=scope)
        return rec

    def save_record(self, rec: MemoryRecord) -> MemoryRecord:
        """Persist an already-built/edited record to both backends (used by
        the typed facades for in-place updates)."""
        self.store.upsert(rec)
        self.vector.add(rec.id, rec.text, kind=rec.kind.value, scope=rec.scope)
        return rec

    def search(
        self, query: str, *, top_k: int = 5, kind: Optional[str] = None, scope: Optional[str] = None
    ) -> list[MemoryHit]:
        return self.retrieval.retrieve(query, top_k=top_k, kind=kind, scope=scope)

    def update(self, rec_id: str, **fields) -> Optional[MemoryRecord]:
        rec = self.store.get(rec_id)
        if rec is None:
            return None
        for k, v in fields.items():
            if hasattr(rec, k):
                setattr(rec, k, v)
        return self.save_record(rec)

    def delete(self, rec_id: str) -> None:
        self.store.delete(rec_id)
        self.vector.delete(rec_id)

    async def summarize(self, text: str, *, ref_id: str = "adhoc") -> str:
        return await self.compressor.compress(text, ref_id=ref_id)

    def archive(self, ref_id: str, original: str) -> None:
        self.store.archive(ref_id, original)

    # ------------------------------------------------------------------ #
    # convenience methods used across the codebase (kept as a superset)
    # ------------------------------------------------------------------ #
    def remember_fact(self, text: str, *, confidence: float = 0.7) -> MemoryRecord:
        return self.semantic.remember(text, confidence=confidence)

    def remember_experience(self, text: str, *, rating: float = 0.5) -> MemoryRecord:
        return self.save(text, kind=MemoryKind.EPISODIC, rating=rating)

    def remember_preference(self, text: str, *, rating: float = 0.8) -> MemoryRecord:
        return self.save(text, kind=MemoryKind.LONG_TERM, scope="preferences", rating=rating)

    def recall(self, query: str, *, top_k: int = 5, kind: Optional[str] = None) -> list[MemoryHit]:
        return self.retrieval.retrieve(query, top_k=top_k, kind=kind)

    def recall_context(self, query: str, *, top_k: int = 5) -> str:
        hits = self.recall(query, top_k=top_k)
        return "\n".join(f"- ({h.kind}) {h.text}" for h in hits)


def get_memory(project_id: str) -> MemoryService:
    return MemoryService(project_id)
