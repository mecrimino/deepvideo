"""
Semantic Memory (7.7) — knowledge, not experiences.

    F-22 Raptor → Stealth Fighter → Lockheed Martin → First Flight → Speed

Stores factual statements and, when they are subject-predicate-object facts, also
writes them into the Knowledge Graph (7.11) so the same knowledge is reachable by
meaning (vector) and by relationship (graph). Foundation for research and fact
retrieval.
"""

from __future__ import annotations

from core.memory.models import MemoryHit, MemoryKind, MemoryRecord


class SemanticMemory:
    def __init__(self, backend) -> None:
        self.b = backend

    def remember(self, text: str, *, confidence: float = 0.7, scope: str = "global") -> MemoryRecord:
        return self.b.save(text, kind=MemoryKind.SEMANTIC, scope=scope, confidence=confidence)

    def remember_fact(self, subject: str, predicate: str, obj: str, *, confidence: float = 0.7) -> MemoryRecord:
        self.b.graph.add(subject, predicate, obj, confidence=confidence)  # 7.11 relationship
        return self.remember(f"{subject} {predicate} {obj}", confidence=confidence)

    def recall(self, query: str, *, top_k: int = 5) -> list[MemoryHit]:
        return self.b.retrieval.retrieve(query, top_k=top_k, kind=MemoryKind.SEMANTIC.value)
