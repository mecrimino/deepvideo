"""
Orchestrator models — the workflow state and result envelopes (19.4/19.18).
"""

from __future__ import annotations

from typing import Any, Optional, TypedDict

from pydantic import BaseModel, Field

from core.orchestrator.config import WorkflowConfig
from core.orchestrator.state import ProjectState


class WorkflowState(TypedDict, total=False):
    """Shared state the production StateGraph carries (a light Blackboard)."""

    project_id: str
    goal: str
    config: WorkflowConfig
    pstate: ProjectState

    brief: Any            # ProductionBrief
    plan: Any             # ExecutionPlan
    knowledge: Any        # KnowledgePackage
    script: Any           # ScriptOutput
    scene_plan: Any       # ScenePlanResult
    assets: dict          # asset_id -> ClipAsset dict
    assets_by_scene: dict # scene_id -> asset_id
    audio_plan: Any
    render_package: Any
    timeline: Any         # Timeline
    review: Any           # ReviewReport
    render_job: Any

    revisions: int
    errors: list
    approved: Optional[bool]


class WorkflowResult(BaseModel):
    workflow_id: str
    project_id: str
    state: str = "created"
    status: str = "running"       # running | paused | completed | failed
    overall_score: Optional[int] = None
    timeline_id: Optional[str] = None
    output_path: Optional[str] = None
    errors: list[str] = Field(default_factory=list)
