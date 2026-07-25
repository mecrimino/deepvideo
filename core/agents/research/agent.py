"""
Research Agent (Ch9) — the autonomous researcher.

Thinks like an analyst, not a search box (9.1): it plans questions, gathers
evidence from multiple sources via the RAG engine, extracts atomic facts,
resolves contradictions, scores confidence and emits a structured
:class:`KnowledgePackage` (9.12) for the Script Agent. It produces the package;
it never writes narration (9.3).

Built from scratch per Ch9 with tools.md tech: a LangGraph pipeline (9.4) over
the Ch8 RAG engine and Ch7 memory, with LLM + LangChain-core reasoning.
"""

from __future__ import annotations

from typing import Optional

from core.agents.base import AgentContext, BaseAgent
from core.agents.research.confidence_estimator import ConfidenceEstimator
from core.agents.research.contradiction_detector import ContradictionDetector
from core.agents.research.fact_extractor import FactExtractor
from core.agents.research.goal_analyzer import GoalAnalyzer
from core.agents.research.graph import build_research_graph
from core.agents.research.knowledge_packager import KnowledgePackager
from core.agents.research.models import KnowledgePackage
from core.agents.research.query_planner import QueryPlanner
from core.agents.research.research_memory import ResearchMemory
from core.agents.research.retrieval_engine import RetrievalEngine
from core.agents.research.source_selector import SourceSelector
from core.agents.research.quality_checks import QualityChecks
from core.agents.research.state import ResearchState
from core.rag import RAGSystem


class ResearchAgent(BaseAgent[str, KnowledgePackage]):
    name = "research"

    def __init__(self, ctx: AgentContext) -> None:
        super().__init__(ctx)
        self.rag = RAGSystem(memory=ctx.memory, events=ctx.events)

        self.goal_analyzer = GoalAnalyzer(self.llm)
        self.query_planner = QueryPlanner(self.llm)
        self.source_selector = SourceSelector()
        self.retrieval_engine = RetrievalEngine(self.rag)
        self.fact_extractor = FactExtractor(self.llm)
        self.contradiction_detector = ContradictionDetector()
        self.confidence_estimator = ConfidenceEstimator()
        self.knowledge_packager = KnowledgePackager(self.llm)
        self.research_memory = ResearchMemory(ctx.memory)
        self.quality_checks = QualityChecks()

        self._graph = build_research_graph(self)

    async def run(self, topic: str) -> KnowledgePackage:
        return await self.research(topic)

    async def research(self, topic: str, *, goal_hint: Optional[dict] = None) -> KnowledgePackage:
        self.ctx.emit("research.started", topic=topic)
        state: ResearchState = {"topic": topic, "goal_hint": goal_hint}  # type: ignore[typeddict-item]
        final: ResearchState = await self._graph.ainvoke(state)
        pkg = final.get("package")
        if pkg is None:  # defensive: empty package
            from core.agents.research.models import KnowledgePackage as KP
            pkg = KP(topic=topic, summary=f"No research available for {topic}.", confidence=0.2)
        self.ctx.memory.working.set("research", pkg.model_dump())
        return pkg
