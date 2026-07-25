"""
Multi-Step Retrieval (8.15) — some questions need several retrieval rounds.

    "Why was the F-22 developed?" →
        retrieve history → need more? → retrieve Cold War context →
        need more? → retrieve air-combat doctrine → combine

Each round can spawn follow-up queries from the knowledge graph (related
entities) or the LLM, until coverage is good enough or a round budget is hit.
"""

from __future__ import annotations

from typing import Optional

from core.rag.hybrid_search import HybridSearch
from core.rag.models import RetrievedChunk
from core.utils.logging import get_logger

log = get_logger("rag.multistep")


class MultiStepRetrieval:
    def __init__(self, search: HybridSearch, graph=None, llm=None, max_rounds: int = 3) -> None:
        self.search = search
        self.graph = graph
        self.llm = llm
        self.max_rounds = max_rounds

    async def retrieve(self, query: str, *, top_k: int = 20, min_chunks: int = 6) -> list[RetrievedChunk]:
        seen: set[str] = set()
        collected: list[RetrievedChunk] = []
        queries = [query]
        asked: set[str] = set()

        for round_no in range(self.max_rounds):
            new_queries: list[str] = []
            for q in queries:
                if q in asked:
                    continue
                asked.add(q)
                for r in self.search.search(q, top_k=top_k):
                    if r.chunk.id not in seen:
                        seen.add(r.chunk.id)
                        collected.append(r)
            # enough evidence? stop.
            if len(collected) >= min_chunks or round_no == self.max_rounds - 1:
                break
            new_queries = await self._followups(query, collected)
            if not new_queries:
                break
            queries = new_queries
            log.info("multi-step round %d → follow-ups: %s", round_no + 2, new_queries)

        return collected

    async def _followups(self, query: str, collected: list[RetrievedChunk]) -> list[str]:
        # graph-driven expansion first (8.14)
        outs: list[str] = []
        if self.graph is not None:
            for w in [w.strip(".,") for w in query.split() if w[:1].isupper() and len(w) > 2][:2]:
                for edge in self.graph.neighbors(w)[:3]:
                    related = edge.object if edge.subject == w else edge.subject
                    outs.append(f"{query} {related}")
        # LLM-driven follow-up questions
        if not outs and self.llm is not None and self.llm.available:
            try:
                data = await self.llm.json(
                    "You plan follow-up research questions. Output STRICT JSON array of strings.",
                    f'Question: "{query}". Give 2 follow-up sub-questions that would deepen the answer.',
                    effort="fast",
                )
                if isinstance(data, list):
                    outs = [str(x) for x in data][:2]
            except Exception:
                pass
        return outs[:2]
