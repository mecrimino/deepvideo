"""
Fact Extraction (9.9) — paragraphs → atomic (subject, predicate, object) facts.

    "The F-22 first flew in 1997 and entered service in 2005." →
    [(F-22, first flight, 1997), (F-22, entered service, 2005)]

Atomic facts are easy to compare, verify and score. LLM extraction when
available; otherwise a pattern-based extractor handles the common factual
sentence shapes. Each fact keeps the source(s) it came from (for 9.11/9.12).
"""

from __future__ import annotations

import re

from core.agents.research.models import SourcedFact
from core.providers.llm.router import LLMUnavailable
from core.rag.models import AssembledContext, Citation
from core.utils.logging import get_logger
from core.utils.text import extract_json

log = get_logger("research.facts")

# pattern-based fallback: "<subject> <predicate verb> <object>"
_PATTERNS = [
    re.compile(r"^(?P<s>.+?)\s+(?P<p>first flew|entered service|was founded|was built by|was developed by|is built by|is developed by|was created|reaches?|can reach|has a top speed of|costs?)\s+(?P<o>.+?)(?:\.\s|\.\n|\n)", re.I),
    re.compile(r"^(?P<s>.+?)\s+(?P<p>is|was|are|were)\s+(?P<o>.+?)(?:\.\s|\.\n|\n)", re.I),
]


class FactExtractor:
    def __init__(self, llm) -> None:
        self.llm = llm

    async def extract(self, context: AssembledContext, *, question_id: int | None = None) -> list[SourcedFact]:
        if not context.grounded:
            return []
        if self.llm.available:
            try:
                facts = await self._llm_extract(context, question_id)
                if facts:
                    return facts
            except LLMUnavailable:
                pass
            except Exception as exc:
                log.warning("llm fact extraction failed: %s", exc)
        return self._heuristic(context, question_id)

    async def _llm_extract(self, context: AssembledContext, qid) -> list[SourcedFact]:
        evidence = "\n".join(c.fact for c in context.citations[:20])
        raw = await self.llm.chat(
            "Extract atomic facts as JSON. STRICT JSON only.",
            f"From this evidence about '{context.query}', extract facts as a JSON array of "
            '{"subject":str,"predicate":str,"object":str}:\n\n' + evidence,
            effort="fast", max_tokens=1200,
        )
        data = extract_json(raw)
        if not isinstance(data, list):
            return []
        out: list[SourcedFact] = []
        for item in data:
            if isinstance(item, dict) and item.get("subject") and item.get("object"):
                out.append(self._attach(SourcedFact(
                    subject=str(item["subject"]).strip(), predicate=str(item.get("predicate", "is")).strip(),
                    object=str(item["object"]).strip(), question_id=qid,
                ), context.citations))
        return out

    def _heuristic(self, context: AssembledContext, qid) -> list[SourcedFact]:
        out: list[SourcedFact] = []
        for cit in context.citations[:20]:
            for pat in _PATTERNS:
                m = pat.match(cit.fact.strip() + "\n")
                if m:
                    out.append(self._from_citation(
                        m.group("s").strip(), m.group("p").strip().lower(),
                        m.group("o").strip().rstrip("."), cit, qid))
                    break
        return out

    @staticmethod
    def _from_citation(s: str, p: str, o: str, cit: Citation, qid) -> SourcedFact:
        return SourcedFact(
            subject=s, predicate=p, object=o, question_id=qid,
            source_ids=[cit.source_id] if cit.source_id else [],
            source_titles=[cit.title] if cit.title else [],
            published=cit.published, confidence=cit.confidence,
        )

    @staticmethod
    def _attach(fact: SourcedFact, citations: list[Citation]) -> SourcedFact:
        """Best-effort link an LLM-extracted fact back to a source citation."""
        subj = fact.subject.lower()
        for cit in citations:
            if subj and subj in cit.fact.lower():
                fact.source_ids = [cit.source_id] if cit.source_id else []
                fact.source_titles = [cit.title] if cit.title else []
                fact.published = cit.published
                break
        return fact
