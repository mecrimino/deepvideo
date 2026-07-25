"""
Procedural Memory (7.8) — how to perform tasks.

    How to render 4K · How to normalize audio · How to create lower thirds

Instead of relearning a workflow every time, the system stores and recalls the
steps. Retrieval is by task name/meaning so "make captions" finds the subtitle
procedure.
"""

from __future__ import annotations

from typing import Optional

from core.memory.models import MemoryHit, MemoryKind, MemoryRecord, Procedure


class ProceduralMemory:
    def __init__(self, backend) -> None:
        self.b = backend

    def remember(self, procedure: Procedure) -> MemoryRecord:
        return self.b.save(
            procedure.to_text(), kind=MemoryKind.PROCEDURAL, scope="global",
            metadata={"name": procedure.name, "steps": procedure.steps}, confidence=0.8,
        )

    def recall(self, query: str, *, top_k: int = 3) -> list[MemoryHit]:
        return self.b.retrieval.retrieve(query, top_k=top_k, kind=MemoryKind.PROCEDURAL.value)

    def steps_for(self, task: str) -> Optional[list[str]]:
        hits = self.recall(task, top_k=1)
        if hits and hits[0].metadata.get("steps"):
            return list(hits[0].metadata["steps"])
        return None
