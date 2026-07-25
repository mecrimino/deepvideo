"""
Scene Planner models (11.5/11.14/11.15/11.17).

Reuses the shared :class:`Scene`/`ScenePlan`/`MediaRequirement`/`GraphicElement`
(2.12 structured communication) and adds the visual constraints (11.14), scene
graph (11.15) and the plan result envelope (11.19).
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

# shared scene contract
from core.schemas.production import GraphicElement, MediaRequirement, Scene, ScenePlan  # noqa: F401

__all__ = ["Scene", "ScenePlan", "MediaRequirement", "GraphicElement",
           "VisualConstraints", "SceneGraph", "ScenePlanResult"]


class VisualConstraints(BaseModel):
    """11.14 — quality/style constraints downstream agents must honour."""

    avoid: list[str] = Field(default_factory=lambda: ["low resolution", "watermarks", "duplicate shots"])
    preferred_orientation: str = "landscape"
    minimum_resolution: str = "1920x1080"
    style: str = "cinematic"


class SceneGraph(BaseModel):
    """11.15 — ordered relationships between scenes (narrative continuity)."""

    order: list[int] = Field(default_factory=list)          # scene_ids in sequence
    edges: list[tuple[int, int]] = Field(default_factory=list)  # (from, to)


class ScenePlanResult(BaseModel):
    """11.19 — the Scene Planner's response envelope."""

    topic: str = ""
    scenes: list[Scene] = Field(default_factory=list)
    constraints: VisualConstraints = Field(default_factory=VisualConstraints)
    graph: SceneGraph = Field(default_factory=SceneGraph)
    estimated_duration: float = 0.0
    status: str = "success"

    def as_plan(self) -> ScenePlan:
        return ScenePlan(topic=self.topic, scenes=self.scenes)
