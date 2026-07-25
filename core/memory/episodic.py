"""
Episodic Memory (7.6) — experiences: what happened and how it turned out.

    Project #124 — F-22 Documentary. Problem: stock videos missing.
    Solution: generated AI footage. Result: 5/5.

Lets the Director reuse successful strategies: given a new topic it recalls the
most similar past experience and the solution that worked.
"""

from __future__ import annotations

from typing import Optional

from core.memory.models import Episode, MemoryHit, MemoryKind, MemoryRecord


class EpisodicMemory:
    def __init__(self, backend) -> None:
        self.b = backend

    def remember(self, episode: Episode) -> MemoryRecord:
        return self.b.save(
            episode.to_text(), kind=MemoryKind.EPISODIC, scope="global",
            metadata={"project_id": episode.project_id, "topic": episode.topic,
                      "result_rating": episode.result_rating, "solution": episode.solution},
            rating=episode.result_rating,
        )

    def recall(self, query: str, *, top_k: int = 3) -> list[MemoryHit]:
        return self.b.retrieval.retrieve(query, top_k=top_k, kind=MemoryKind.EPISODIC.value)

    def best_strategy(self, topic: str) -> Optional[str]:
        """The highest-scoring past solution for a similar topic (5/5 reuse)."""
        hits = self.recall(topic, top_k=3)
        for h in hits:
            sol = h.metadata.get("solution")
            if sol and float(h.metadata.get("result_rating", 0)) >= 0.6:
                return str(sol)
        return None
