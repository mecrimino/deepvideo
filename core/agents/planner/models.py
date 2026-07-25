"""
Planner structured contracts (6.14) — the execution plan and its parts.

Everything the Planner produces is a typed Pydantic object so worker agents and
the Director can consume the plan directly (6.14 "easy for other agents to
understand"). Shared Director contracts (brief/workflow/capabilities) are
imported so the Director → Planner handoff (6.2) is one typed object, no reshape.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

# Director → Planner handoff (6.2): reuse the exact contracts the Director emits.
from core.agents.director.models import (  # noqa: F401
    ProductionBrief,
    RequiredCapabilities,
    WorkflowChoice,
)

__all__ = [
    "Priority", "TaskStatus", "ResourceEstimate", "PlanTask", "Edge",
    "Checkpoint", "ExecutionPlan", "ProductionBrief", "WorkflowChoice",
    "RequiredCapabilities",
]


# --------------------------------------------------------------------------- #
# Priority levels (6.10)
# --------------------------------------------------------------------------- #
class Priority(str, Enum):
    CRITICAL = "critical"       # P1 — research, script, scene planning
    IMPORTANT = "important"     # P2 — images, videos, voice
    ENHANCEMENT = "enhancement" # P3 — animations, transitions, effects

    @property
    def level(self) -> int:
        return {"critical": 1, "important": 2, "enhancement": 3}[self.value]


TaskStatus = Literal["pending", "ready", "running", "done", "failed", "skipped"]


# --------------------------------------------------------------------------- #
# Resource estimation (6.12)
# --------------------------------------------------------------------------- #
class ResourceEstimate(BaseModel):
    runtime_sec: float = 0.0
    gpu: bool = False
    memory_mb: int = 0
    api_calls: int = 0
    api_cost_usd: float = 0.0
    storage_mb: float = 0.0

    def add(self, other: "ResourceEstimate") -> "ResourceEstimate":
        return ResourceEstimate(
            runtime_sec=self.runtime_sec + other.runtime_sec,
            gpu=self.gpu or other.gpu,
            memory_mb=max(self.memory_mb, other.memory_mb),  # peak, not sum
            api_calls=self.api_calls + other.api_calls,
            api_cost_usd=round(self.api_cost_usd + other.api_cost_usd, 4),
            storage_mb=round(self.storage_mb + other.storage_mb, 2),
        )


# --------------------------------------------------------------------------- #
# Atomic task (6.6) + dependency edge (6.7)
# --------------------------------------------------------------------------- #
class PlanTask(BaseModel):
    id: int
    name: str
    agent: str
    group: str                       # the major task it belongs to (6.5)
    priority: Priority = Priority.IMPORTANT
    depends_on: list[int] = Field(default_factory=list)
    params: dict[str, Any] = Field(default_factory=dict)
    atomic: bool = True              # 6.6 — assignable to one agent
    scene_id: Optional[int] = None   # set for per-scene tasks
    estimate: ResourceEstimate = Field(default_factory=ResourceEstimate)
    status: TaskStatus = "pending"

    @property
    def priority_level(self) -> int:
        return self.priority.level


class Edge(BaseModel):
    src: int  # prerequisite
    dst: int  # dependent


# --------------------------------------------------------------------------- #
# Checkpoints (6.13)
# --------------------------------------------------------------------------- #
class Checkpoint(BaseModel):
    id: int
    name: str
    after_tasks: list[int] = Field(default_factory=list)  # completed => reached
    reached: bool = False


# --------------------------------------------------------------------------- #
# The execution plan (6.14)
# --------------------------------------------------------------------------- #
class ExecutionPlan(BaseModel):
    project: str
    tasks: list[PlanTask] = Field(default_factory=list)
    edges: list[Edge] = Field(default_factory=list)
    #: layers of task ids that can run in parallel (6.8) — layer 0 runs first
    parallel_layers: list[list[int]] = Field(default_factory=list)
    checkpoints: list[Checkpoint] = Field(default_factory=list)
    total_estimate: ResourceEstimate = Field(default_factory=ResourceEstimate)
    valid: bool = True
    issues: list[str] = Field(default_factory=list)

    def task(self, task_id: int) -> Optional[PlanTask]:
        return next((t for t in self.tasks if t.id == task_id), None)
