"""
Long-Term Memory (7.5) — persists for months or years.

Previous videos, favourite styles, successful prompts, frequently used
transitions, preferred narration speed, branding. Unlike working memory, this
never auto-clears; it is the substrate the AI grows on.
"""

from __future__ import annotations

from core.memory.models import MemoryHit, MemoryKind, MemoryRecord


class LongTermMemory:
    def __init__(self, backend) -> None:
        self.b = backend

    def remember(self, text: str, *, scope: str = "global", metadata: dict | None = None,
                 rating: float = 0.6, confidence: float = 0.6) -> MemoryRecord:
        return self.b.save(text, kind=MemoryKind.LONG_TERM, scope=scope,
                           metadata=metadata, rating=rating, confidence=confidence)

    def recall(self, query: str, *, top_k: int = 5, scope: str | None = None) -> list[MemoryHit]:
        return self.b.retrieval.retrieve(query, top_k=top_k,
                                         kind=MemoryKind.LONG_TERM.value, scope=scope)
