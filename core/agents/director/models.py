"""
Director structured contracts (Ch2.12 — agents exchange typed objects, not prose).

Every module in the Director produces/consumes one of these Pydantic models, so
the whole thinking process (5.4) is typed end-to-end. The user-facing
:class:`ProductionBrief` is the shared studio contract (imported from
``core.schemas.production``) so downstream chapters (Planner, Research, ...)
receive the exact same object the Director emits.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

from core.schemas.production import ProductionBrief  # shared 2.12 contract

__all__ = [
    "ProductionBrief", "ComplexityLevel", "Complexity", "GoalAnalysis",
    "RequiredCapabilities", "WorkflowChoice", "TaskStatus", "TaskAssignment",
    "TaskResult", "RecoveryAction", "ReviewOutcome", "ExportDecision",
    "ProductionStrategy",
]


# --------------------------------------------------------------------------- #
# Goal analysis (5.6 / 5.8 Goal Analyzer)
# --------------------------------------------------------------------------- #
class RequiredCapabilities(BaseModel):
    """5.8 — which capabilities the prompt activates (drives 5.5 reasoning)."""

    research: bool = True
    script: bool = True
    voice: bool = True
    image_search: bool = True
    video_search: bool = True
    motion_graphics: bool = False
    maps: bool = False
    fact_checking: bool = True
    subtitles: bool = True
    review: bool = True

    def enabled(self) -> list[str]:
        return [k for k, v in self.model_dump().items() if v]


class GoalAnalysis(BaseModel):
    objective: str = ""
    goals: list[str] = Field(default_factory=list)
    requirements: list[str] = Field(default_factory=list)
    success_criteria: list[str] = Field(default_factory=list)
    research_questions: list[str] = Field(default_factory=list)
    capabilities: RequiredCapabilities = Field(default_factory=RequiredCapabilities)


# --------------------------------------------------------------------------- #
# Complexity (5.4 Estimate Complexity)
# --------------------------------------------------------------------------- #
class ComplexityLevel(str, Enum):
    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"


class Complexity(BaseModel):
    level: ComplexityLevel = ComplexityLevel.MODERATE
    score: float = 0.5  # 0..1
    factors: list[str] = Field(default_factory=list)
    estimated_tasks: int = 8
    estimated_minutes: float = 5.0


# --------------------------------------------------------------------------- #
# Workflow (5.4 Choose Workflow)
# --------------------------------------------------------------------------- #
class WorkflowChoice(BaseModel):
    name: str = "standard_documentary"
    stages: list[str] = Field(default_factory=list)
    #: groups of stage names that may run at the same time (Parallel Execution, 1.6)
    parallel_groups: list[list[str]] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Tasks (5.4 Assign Tasks / 5.6 Task Scheduler)
# --------------------------------------------------------------------------- #
TaskStatus = Literal["pending", "assigned", "running", "done", "failed", "recovered"]


class TaskAssignment(BaseModel):
    id: int
    name: str
    agent: str  # the specialist responsible (single responsibility, 1.6)
    priority: Literal["low", "medium", "high"] = "medium"
    depends_on: list[int] = Field(default_factory=list)
    #: structured payload the worker receives (2.12), e.g.
    #: {"task":"search_images","topic":"F-22 Raptor","style":"cinematic"}
    params: dict[str, Any] = Field(default_factory=dict)
    status: TaskStatus = "pending"


class TaskResult(BaseModel):
    task_id: int
    status: TaskStatus
    output: Optional[dict] = None
    error: Optional[str] = None
    attempts: int = 0
    provider: Optional[str] = None


# --------------------------------------------------------------------------- #
# Failure recovery (5.13 ladder)
# --------------------------------------------------------------------------- #
class RecoveryAction(str, Enum):
    RETRY = "retry"                      # try again as-is
    REPHRASE_QUERY = "different_query"   # different search query
    SWITCH_PROVIDER = "different_provider"
    USE_CACHE = "cached_results"
    GENERATE = "generate"                # generate the asset instead
    ASK_USER = "ask_user"                # last resort
    GIVE_UP = "give_up"


# --------------------------------------------------------------------------- #
# Review + export (5.6 Reviewer Coordinator / Export Controller)
# --------------------------------------------------------------------------- #
class ReviewOutcome(BaseModel):
    requested: bool = False
    performed: bool = False
    passed: bool = False
    score: int = 0
    issues: list[str] = Field(default_factory=list)


class ExportDecision(BaseModel):
    approved: bool = False
    reason: str = ""


# --------------------------------------------------------------------------- #
# The Director's full plan handed down to the studio
# --------------------------------------------------------------------------- #
class ProductionStrategy(BaseModel):
    brief: ProductionBrief
    goals: GoalAnalysis
    complexity: Complexity
    workflow: WorkflowChoice
    tasks: list[TaskAssignment] = Field(default_factory=list)
