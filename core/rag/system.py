"""
RAGSystem (8.18) — the research engine.

    query → understanding → embedding →
        {keyword search ∥ vector search ∥ knowledge graph} →
        merge → rerank → context builder (with citations) → grounded context

Exposes ``ingest_*`` to grow the knowledge base and ``retrieve`` / ``research``
to get grounded, cited context for the Script/Research agents. Embodies the 8.19
principles: trusted sources, rich metadata, careful chunking, hybrid search,
reranking, citations, continuous learning, graph integration, caching and
graceful failure.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.providers.llm import get_llm
from core.rag.cache import QueryCache
from core.rag.context_builder import ContextBuilder
from core.rag.failure import FailureHandler
from core.rag.hybrid_search import HybridSearch
from core.rag.ingestion import Ingestor
from core.rag.keyword_index import get_keyword_index
from core.rag.learning import ContinuousLearning
from core.rag.models import AssembledContext, Source
from core.rag.multistep import MultiStepRetrieval
from core.rag.reranker import Reranker
from core.rag.sources import KnowledgeSources
from core.rag.vector_index import VectorIndex
from core.utils.logging import get_logger

log = get_logger("rag")

# A chunk is relevant if it has an exact keyword hit OR a meaningful semantic
# similarity — the hashed embedder is noisy, so a bare vector "nearest neighbour"
# with tiny similarity does not count (8.17 failure detection).
_SIM_FLOOR = 0.15


def _is_relevant(r) -> bool:
    return r.keyword_score > 0.0 or r.similarity >= _SIM_FLOOR


class RAGSystem:
    def __init__(self, *, memory=None, events=None) -> None:
        self.memory = memory
        self.events = events
        self.graph = getattr(memory, "graph", None)     # 8.14 graph integration
        self.keyword = get_keyword_index()
        self.vector = VectorIndex()
        self.ingestor = Ingestor(self.keyword, self.vector)
        self.sources = KnowledgeSources()
        self.search = HybridSearch(self.keyword, self.vector, self.graph)
        self.reranker = Reranker()
        self.context_builder = ContextBuilder()
        self.cache = QueryCache()
        self.llm = get_llm()
        self.multistep = MultiStepRetrieval(self.search, self.graph, self.llm)
        self.failure = FailureHandler(
            self.search, ingest_web=self._ingest_web,
            emit=(events.emit if events else None),
        )
        self.learning = ContinuousLearning(self.ingestor)

    # ------------------------------------------------------------------ #
    # ingestion
    # ------------------------------------------------------------------ #
    def ingest_text(self, text: str, source: Source):
        return self.ingestor.ingest_text(text, source)

    async def ingest_url(self, url: str):
        return await self.ingestor.ingest_url(url)

    def ingest_file(self, path: str | Path):
        return self.ingestor.ingest_file(path)

    async def _ingest_web(self, topic: str) -> int:
        docs = await self.sources.gather_web(topic)
        n = 0
        for doc in docs:
            n += len(self.ingestor.ingest_document(doc))
        if n:
            log.info("ingested %d web chunks for '%s'", n, topic)
        return n

    # ------------------------------------------------------------------ #
    # retrieval (8.18)
    # ------------------------------------------------------------------ #
    async def retrieve(
        self, query: str, *, top_k: int = 10, multistep: bool = False, use_cache: bool = True
    ) -> AssembledContext:
        cache_key = f"{query}|{top_k}|{multistep}"
        if use_cache:
            cached = self.cache.get(cache_key)
            if cached is not None:
                return AssembledContext.model_validate(cached)

        q = await self._understand(query)              # query understanding
        if multistep:
            retrieved = await self.multistep.retrieve(q, top_k=top_k * 2)
        else:
            retrieved = self.search.search(q, top_k=top_k * 2)
        # relevance floor — a vector index always returns *nearest* neighbours,
        # so drop chunks that aren't actually relevant before deciding failure
        retrieved = [r for r in retrieved if _is_relevant(r)]
        if not retrieved:                              # 8.17 graceful failure
            retrieved = await self.failure.recover(q, top_k=top_k * 2)
            retrieved = [r for r in retrieved if _is_relevant(r)]

        ranked = self.reranker.rerank(q, retrieved, top_k=top_k)
        context = self.context_builder.build(query, ranked)
        if use_cache and context.grounded:
            self.cache.set(cache_key, context.model_dump())
        return context

    async def research(self, topic: str, *, ingest_web: bool = True, top_k: int = 10) -> AssembledContext:
        """Full research entry (used by the Research agent): make sure knowledge
        exists for the topic, then retrieve grounded, cited context."""
        if self.memory is not None:
            for doc in self.sources.gather_previous_projects(self.memory, topic):
                self.ingestor.ingest_document(doc)
        if ingest_web and self.sources.has_web:
            await self._ingest_web(topic)
        return await self.retrieve(topic, top_k=top_k, multistep=True)

    # ------------------------------------------------------------------ #
    async def _understand(self, query: str) -> str:
        """8.18 query understanding — light LLM rewrite when available."""
        if not self.llm.available:
            return query
        try:
            better = await self.llm.chat(
                "Rewrite the user's research query into a concise search query. Reply with the query only.",
                query, effort="fast", max_tokens=60,
            )
            return better.strip().strip('"') or query
        except Exception:
            return query

    def stats(self) -> dict:
        return {"chunks": self.keyword.count(), "vectors": self.vector.count(),
                "web": self.sources.has_web}
