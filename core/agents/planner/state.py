"""PlannerState — carried through the 6.4 planning pipeline (LangGraph)."""

from __future__ import annotations

from typing import Optional, TypedDict

from core.agents.planner.models import (
    Checkpoint,
    ExecutionPlan,
    PlanTask,
    ProductionBrief,
    RequiredCapabilities,
    ResourceEstimate,
    WorkflowChoice,
)


class PlannerState(TypedDict, total=False):
    # inputs (from the Director, 6.2)
    brief: ProductionBrief
    workflow: WorkflowChoice
    capabilities: RequiredCapabilities
    research_questions: Optional[list[str]]

    # produced through the pipeline (6.4)
    scene_count: int
    major_tasks: list[str]
    tasks: list[PlanTask]
    total_estimate: ResourceEstimate
    checkpoints: list[Checkpoint]
    parallel_layers: list[list[int]]
    stats: dict
    issues: list[str]
    plan: ExecutionPlan
