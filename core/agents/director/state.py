"""
DirectorState — the shared state the LangGraph thinking process carries.

One typed dict flows through every node of the 5.4 chain; each node reads what
it needs and returns the fields it produced (LangGraph merges them back in).
"""

from __future__ import annotations

from typing import Optional, TypedDict

from core.agents.director.models import (
    Complexity,
    ExportDecision,
    GoalAnalysis,
    ProductionBrief,
    ReviewOutcome,
    TaskAssignment,
    TaskResult,
    WorkflowChoice,
)


class DirectorState(TypedDict, total=False):
    # inputs
    prompt: str
    project_id: str

    # produced by the thinking process (5.4)
    brief: ProductionBrief
    goals: GoalAnalysis
    complexity: Complexity
    workflow: WorkflowChoice
    tasks: list[TaskAssignment]
    results: list[TaskResult]
    review: ReviewOutcome
    export: ExportDecision

    # control
    revisions: int
    status: str
