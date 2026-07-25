"""
Research Memory (9.14) — don't repeat expensive work.

Before researching, check whether this topic was already researched (semantic
recall). If a fresh, high-confidence package exists, reuse it; otherwise do the
work and store the finished package for next time. Reduces cost and speeds up
repeated projects.
"""

from __future__ import annotations

from typing import Optional

from core.agents.research.models import KnowledgePackage
from core.utils.logging import get_logger

log = get_logger("research.memory")

_SCOPE = "research"


class ResearchMemory:
    def __init__(self, memory) -> None:
        self.memory = memory

    def find_existing(self, topic: str, *, min_similarity: float = 0.6) -> Optional[KnowledgePackage]:
        if self.memory is None:
            return None
        for hit in self.memory.search(f"research package: {topic}", top_k=3, scope=_SCOPE):
            pkg_data = hit.metadata.get("package")
            if pkg_data and hit.similarity >= min_similarity:
                try:
                    log.info("reusing cached research for '%s' (sim %.2f)", topic, hit.similarity)
                    return KnowledgePackage.model_validate(pkg_data)
                except Exception:
                    continue
        return None

    def store(self, package: KnowledgePackage) -> None:
        if self.memory is None:
            return
        self.memory.save(
            f"research package: {package.topic}\n{package.summary}",
            kind="semantic", scope=_SCOPE,
            metadata={"package": package.model_dump(), "topic": package.topic},
            confidence=package.confidence,
        )
        # also feed facts into the knowledge graph (7.11)
        try:
            self.memory.graph.add_facts(package.key_facts, scope="global")
        except Exception:
            pass
