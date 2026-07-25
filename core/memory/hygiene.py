"""
Memory Hygiene (7.19) — handle the hard parts of a memory system.

Addresses the challenges the chapter lists:
  * **Duplicate memories** — near-identical text is detected before saving.
  * **Conflicting information** — contradictory facts about an entity are flagged.
  * **Outdated facts / large storage** — a forgetting pass deletes stale, low-value
    memories (old + low rating + rarely used).
  * **Privacy** — scoping keeps per-user/per-project memories separable.
  * **Retrieval speed** — pruning keeps the index small.
"""

from __future__ import annotations

import time
from typing import Optional

from core.memory.store import Store, get_store
from core.memory.vector_store import VectorStore
from core.utils.logging import get_logger

log = get_logger("memory.hygiene")


class Hygiene:
    def __init__(self, backend) -> None:
        self.b = backend
        self._store: Store = backend.store
        self._vector: VectorStore = backend.vector

    # -- duplicates (7.19) -------------------------------------------- #
    def duplicate_of(self, text: str, *, kind: str, scope: str, threshold: float = 0.95) -> Optional[str]:
        """Return an existing record id if ``text`` is a near-duplicate."""
        for rec_id, sim in self._vector.search(text, top_k=1, kind=kind, scope=scope):
            if sim >= threshold:
                return rec_id
        return None

    # -- conflicts (7.19) --------------------------------------------- #
    def conflicts(self, subject: str, *, scope: str = "global") -> list[tuple[str, list[str]]]:
        """Flag predicates where an entity has multiple differing objects."""
        by_pred: dict[str, set[str]] = {}
        for e in self.b.graph.neighbors(subject, scope=scope):
            if e.subject == subject:
                by_pred.setdefault(e.predicate, set()).add(e.object)
        return [(p, sorted(objs)) for p, objs in by_pred.items() if len(objs) > 1]

    # -- forgetting outdated (7.16/7.19) ------------------------------ #
    def forget_outdated(self, *, max_age_days: float = 180, min_rating: float = 0.35,
                        max_uses: int = 1) -> int:
        """Delete stale, low-value memories to keep the index small and fast."""
        now = time.time()
        removed = 0
        for kind in ("long_term", "episodic", "semantic"):
            for rec in self._store.list(kind=kind):
                age_days = (now - float(rec.updated_at or now)) / 86400.0
                if age_days > max_age_days and rec.rating < min_rating and rec.uses <= max_uses:
                    self._store.delete(rec.id)
                    self._vector.delete(rec.id)
                    removed += 1
        if removed:
            log.info("forgot %d outdated memories", removed)
        return removed
