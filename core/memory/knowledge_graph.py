"""
Knowledge Graph (7.11) — relationships, not isolated facts.

    F-22 --built_by--> Lockheed Martin --located_in--> United States

Stores (subject, predicate, object) triples in SQLite and answers neighbourhood
queries, enabling richer reasoning than keyword search alone.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from core.memory.store import Store, get_store


@dataclass
class Edge:
    subject: str
    predicate: str
    object: str
    confidence: float = 0.5


class KnowledgeGraph:
    def __init__(self, store: Optional[Store] = None) -> None:
        self._store = store or get_store()

    def add(self, subject: str, predicate: str, obj: str, *, scope: str = "global", confidence: float = 0.5) -> None:
        if subject and predicate and obj:
            self._store.add_edge(subject, predicate, obj, scope, confidence)

    def add_facts(self, facts, *, scope: str = "global") -> None:
        for f in facts:
            self.add(f.subject, f.predicate, f.object, scope=scope, confidence=getattr(f, "confidence", 0.5))

    def neighbors(self, entity: str, *, scope: str = "global") -> list[Edge]:
        return [
            Edge(r["subject"], r["predicate"], r["object"], r["confidence"])
            for r in self._store.edges_for(entity, scope)
        ]

    def describe(self, entity: str, *, scope: str = "global", limit: int = 12) -> str:
        edges = self.neighbors(entity, scope=scope)[:limit]
        return "\n".join(f"{e.subject} {e.predicate} {e.object}" for e in edges)
