"""
Research Agent (Ch9) — the autonomous researcher.

Built from scratch per Ch9 with tools.md tech: a **LangGraph** pipeline (9.4) over
the **Ch8 RAG** engine (multi-source/multi-hop retrieval, citations) and **Ch7
memory** (reuse + knowledge graph), with **LLM + LangChain-core** for goal
understanding, question generation and fact extraction. Produces a structured,
cited :class:`KnowledgePackage` (9.12); it never writes narration (9.3).
"""

from core.agents.research.agent import ResearchAgent
from core.agents.research.models import (
    Contradiction,
    KnowledgePackage,
    ResearchGoal,
    ResearchQuestion,
    SourcedFact,
)

__all__ = [
    "ResearchAgent", "KnowledgePackage", "ResearchGoal", "ResearchQuestion",
    "SourcedFact", "Contradiction",
]
