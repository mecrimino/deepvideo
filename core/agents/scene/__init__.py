"""
Scene Planner Agent (Ch11) — the visual director.

Built from scratch per Ch11 (folder layout 11.18) with tools.md tech: a
**LangGraph** module chain (11.16) over **Pydantic** scene models, with **LLM +
LangChain-core** visual reasoning and **Loguru** logs. Turns narration into a
shot-by-shot production plan (11.17) — media type, camera, transitions, overlays,
emotion, timing — that the media agents execute. It specifies media, never
retrieves it (11.3).
"""

from core.agents.scene.agent import ScenePlannerAgent
from core.agents.scene.models import ScenePlan, ScenePlanResult, VisualConstraints
# compat re-exports for the current pipeline
from core.agents.scene.splitter import split_into_beats
from core.agents.scene.visuals import generate_queries, plan_visuals

__all__ = [
    "ScenePlannerAgent", "ScenePlanResult", "ScenePlan", "VisualConstraints",
    "split_into_beats", "generate_queries", "plan_visuals",
]
