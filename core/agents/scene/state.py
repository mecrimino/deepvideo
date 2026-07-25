"""ScenePlannerState — carried through the 11.16 module chain (LangGraph)."""

from __future__ import annotations

from typing import Optional, TypedDict

from core.agents.scene.models import ScenePlanResult, VisualConstraints
from core.schemas.production import Scene


class ScenePlannerState(TypedDict, total=False):
    narration: str
    topic: str
    style: str
    orientation: str
    script_scenes: Optional[list]     # Ch10 ScriptOutput scenes, if provided
    scenes: list[Scene]
    constraints: VisualConstraints
    result: ScenePlanResult
