"""
Multi-Source Retrieval (9.8) + Multi-Hop Research (9.13).

Never trusts one source: the RAG engine (Ch8) pulls evidence from the web,
previous projects and user files, and its multi-step mode follows reasoning
chains for "why"-type questions (9.13). This engine seeds the knowledge base for
the topic once, then retrieves grounded, cited context per research question.
"""

from __future__ import annotations

from core.agents.research.models import ResearchGoal, ResearchQuestion
from core.rag import RAGSystem
from core.rag.models import AssembledContext
from core.utils.logging import get_logger

log = get_logger("research.retrieval")


class RetrievalEngine:
    def __init__(self, rag: RAGSystem) -> None:
        self.rag = rag

    async def retrieve(
        self, goal: ResearchGoal, questions: list[ResearchQuestion], *, per_question: int = 6
    ) -> list[AssembledContext]:
        # 9.8 — seed the knowledge base from multiple sources, once
        if self.rag.memory is not None:
            for doc in self.rag.sources.gather_previous_projects(self.rag.memory, goal.topic):
                self.rag.ingestor.ingest_document(doc)
        if self.rag.sources.has_web:
            await self.rag._ingest_web(goal.topic)

        contexts: list[AssembledContext] = []
        for q in questions:
            ctx = await self.rag.retrieve(q.question, top_k=per_question, multistep=True)
            q.answered = ctx.grounded
            contexts.append(ctx)
        answered = sum(1 for q in questions if q.answered)
        log.info("retrieved %d/%d questions grounded", answered, len(questions))
        return contexts
