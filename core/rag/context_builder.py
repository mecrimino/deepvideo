"""
Context Assembly (8.11) + Citation Tracking (8.12).

Instead of dumping retrieved chunks, this organizes them into labelled sections —
Background, Technical Details, Timeline, Important Facts, Open Questions — which
improves the LLM's reasoning. Every retained sentence carries a citation back to
its source (id, title, url, date, confidence) so the Script Agent can reference
the original evidence and hallucinations drop.
"""

from __future__ import annotations

import re

from core.rag.models import AssembledContext, Citation, RetrievedChunk, Source
from core.utils.text import split_sentences

_YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")
_NUM_RE = re.compile(r"\b\d[\d,\.]*\s?(%|percent|kg|km|mph|mach|ghz|gb|tb|nm|watt|w|billion|million)\b", re.I)


class ContextBuilder:
    def build(self, query: str, ranked: list[RetrievedChunk]) -> AssembledContext:
        ctx = AssembledContext(query=query, chunks=ranked)
        seen: set[str] = set()
        sources: dict[str, Source] = {}

        for r in ranked:
            src = r.chunk.source
            sources.setdefault(src.id, src)
            for sent in split_sentences(r.chunk.text):
                key = sent.lower()[:80]
                if len(sent) < 25 or key in seen:
                    continue
                seen.add(key)
                self._file(ctx, sent)
                ctx.citations.append(Citation(
                    fact=sent, source_id=src.id, title=src.title, url=src.url,
                    published=src.published, confidence=round(r.rerank_score or r.similarity, 3),
                ))

        # trim each section to keep the context focused
        ctx.background = ctx.background[:6]
        ctx.technical_details = ctx.technical_details[:8]
        ctx.timeline = sorted(set(ctx.timeline))[:8]
        ctx.important_facts = ctx.important_facts[:8]
        ctx.open_questions = ctx.open_questions[:4]
        ctx.sources = list(sources.values())
        ctx.text = self._render(ctx)
        return ctx

    def _file(self, ctx: AssembledContext, sent: str) -> None:
        if sent.rstrip().endswith("?"):
            ctx.open_questions.append(sent)
        elif _YEAR_RE.search(sent):
            ctx.timeline.append(sent)
        elif _NUM_RE.search(sent):
            ctx.technical_details.append(sent)
        elif len(sent) < 160:
            ctx.important_facts.append(sent)
        else:
            ctx.background.append(sent)

    def _render(self, ctx: AssembledContext) -> str:
        parts: list[str] = []
        sections = [
            ("Background", ctx.background),
            ("Technical Details", ctx.technical_details),
            ("Timeline", ctx.timeline),
            ("Important Facts", ctx.important_facts),
            ("Open Questions", ctx.open_questions),
        ]
        for title, items in sections:
            if items:
                parts.append(f"## {title}\n" + "\n".join(f"- {i}" for i in items))
        if ctx.sources:
            parts.append("## Sources\n" + "\n".join(
                f"- [{s.id}] {s.title or s.url or s.source_type}" for s in ctx.sources))
        return "\n\n".join(parts)
