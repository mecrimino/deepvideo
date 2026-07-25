"""ResearchState — carried through the 9.4 research pipeline (LangGraph)."""

from __future__ import annotations

from typing import Optional, TypedDict

from core.agents.research.models import (
    Contradiction,
    KnowledgePackage,
    ResearchGoal,
    ResearchQuestion,
    SourcedFact,
)
from core.rag.models import AssembledContext


class ResearchState(TypedDict, total=False):
    topic: str
    goal: ResearchGoal
    questions: list[ResearchQuestion]
    contexts: list[AssembledContext]     # retrieved evidence per question (9.8)
    facts: list[SourcedFact]             # 9.9
    contradictions: list[Contradiction]  # 9.10
    reused: bool                         # 9.14 (served from memory)
    quality_ok: bool                     # 9.15
    package: KnowledgePackage            # 9.12
