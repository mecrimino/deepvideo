"""
Knowledge Packaging (9.12) — assemble the structured, machine-readable output.

    {topic, summary, key_facts, timeline, technical_specs,
     important_people, citations, confidence}

Downstream agents (Script) consume this directly. The summary is written by the
LLM from the highest-confidence evidence when available, else composed from the
retrieved context's background.
"""

from __future__ import annotations

import re

from core.agents.research.models import KnowledgePackage, ResearchGoal, SourcedFact
from core.rag.models import AssembledContext
from core.utils.logging import get_logger

log = get_logger("research.package")

_PERSON_RE = re.compile(r"\b([A-Z][a-z]+ [A-Z][a-z]+)\b")


class KnowledgePackager:
    def __init__(self, llm) -> None:
        self.llm = llm

    async def build(
        self, goal: ResearchGoal, facts: list[SourcedFact], contexts: list[AssembledContext]
    ) -> KnowledgePackage:
        facts = sorted(facts, key=lambda f: f.confidence, reverse=True)
        timeline = sorted({t for c in contexts for t in c.timeline})
        technical = sorted({t for c in contexts for t in c.technical_details})[:12]
        citations = sorted({(s.title or s.url) for c in contexts for s in c.sources if (s.title or s.url)})
        people = sorted({m.group(1) for f in facts for m in [_PERSON_RE.search(f"{f.subject} {f.object}")] if m})

        summary = await self._summary(goal, facts, contexts)
        conf = round(sum(f.confidence for f in facts) / len(facts), 3) if facts else 0.3

        return KnowledgePackage(
            topic=goal.topic, summary=summary,
            key_facts=[f.to_fact() for f in facts[:40]],
            timeline=timeline[:12], technical_specs=technical,
            important_people=people[:8], citations=citations[:20],
            confidence=conf,
        )

    async def _summary(self, goal, facts, contexts) -> str:
        if self.llm.available and facts:
            try:
                bullets = "\n".join(f"- {f.subject} {f.predicate} {f.object}" for f in facts[:20])
                return (await self.llm.chat(
                    "Write a concise factual research summary (<=120 words). No new facts.",
                    f"Topic: {goal.topic}\nVerified facts:\n{bullets}",
                    effort="fast", max_tokens=280,
                )).strip()
            except Exception:
                pass
        background = " ".join(b for c in contexts for b in c.background[:2])
        return background[:600] or f"Research findings about {goal.topic}."
