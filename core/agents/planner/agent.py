"""
Planner Agent (Ch6) — the master planner.

The Director decides *what*; the Planner decides *how* (6.1). It converts one
request into an execution plan of atomic tasks with a dependency graph,
priorities, parallel layers, resource estimates and checkpoints — then adapts
that plan on the fly (6.11). It never edits a video; it only creates execution
plans (6.2).

Built from scratch with tools.md tech: a LangGraph planning pipeline (6.4) over
Pydantic contracts, with LLM-assisted research decomposition and Loguru logs.
"""

from __future__ import annotations

from typing import Optional

from core.agents.base import AgentContext, BaseAgent
from core.agents.planner.checkpoints import CheckpointPlanner
from core.agents.planner.decomposer import Decomposer
from core.agents.planner.graph import build_planner_graph
from core.agents.planner.models import (
    ExecutionPlan,
    ProductionBrief,
    RequiredCapabilities,
    WorkflowChoice,
)
from core.agents.planner.parallelizer import Parallelizer
from core.agents.planner.prioritizer import Prioritizer
from core.agents.planner.replanner import Replanner
from core.agents.planner.resource_estimator import ResourceEstimator
from core.agents.planner.state import PlannerState
from core.agents.planner.validator import Validator

# a standard full-production backbone used when the Director gives no workflow
_DEFAULT_STAGES = [
    "research", "fact_check", "script", "scene", "assets",
    "audio", "timeline", "review", "export",
]


class PlannerAgent(BaseAgent[ProductionBrief, ExecutionPlan]):
    name = "planner"

    def __init__(self, ctx: AgentContext) -> None:
        super().__init__(ctx)
        self.decomposer = Decomposer(self.llm)
        self.prioritizer = Prioritizer()
        self.estimator = ResourceEstimator()
        self.checkpointer = CheckpointPlanner()
        self.parallelizer = Parallelizer()
        self.validator = Validator()
        self.replanner = Replanner()
        self._graph = build_planner_graph(self)

    # ------------------------------------------------------------------ #
    async def run(self, brief: ProductionBrief) -> ExecutionPlan:
        return await self.plan(brief)

    async def plan(
        self,
        brief: ProductionBrief,
        *,
        workflow: Optional[WorkflowChoice] = None,
        capabilities: Optional[RequiredCapabilities] = None,
        research_questions: Optional[list[str]] = None,
    ) -> ExecutionPlan:
        state: PlannerState = {
            "brief": brief,
            "workflow": workflow,
            "capabilities": capabilities,
            "research_questions": research_questions,
        }
        final: PlannerState = await self._graph.ainvoke(state)
        plan = final["plan"]
        self.ctx.memory.working.set("plan", plan.model_dump())
        self.ctx.emit(
            "planner.completed",
            tasks=len(plan.tasks), checkpoints=len(plan.checkpoints),
            speedup=final.get("stats", {}).get("speedup"),
        )
        return plan

    # ------------------------------------------------------------------ #
    # dynamic replanning (6.11) — thin pass-throughs to the Replanner
    # ------------------------------------------------------------------ #
    def insert_scene(self, plan: ExecutionPlan, topic: str):
        return self.replanner.insert_scene(plan, topic)

    def refine_asset(self, plan: ExecutionPlan, scene_id: int, media_type: str):
        return self.replanner.refine_asset(plan, scene_id, media_type)

    def resume_point(self, plan: ExecutionPlan, done_ids: set[int]):
        """6.13 — the last checkpoint reached, to resume from instead of restart."""
        return self.checkpointer.last_reached(plan.checkpoints, done_ids)

    # ------------------------------------------------------------------ #
    def _default_workflow(self, brief: ProductionBrief) -> WorkflowChoice:
        return WorkflowChoice(name=f"{brief.video_type}_default", stages=list(_DEFAULT_STAGES))

    def _default_capabilities(self) -> RequiredCapabilities:
        return RequiredCapabilities()
