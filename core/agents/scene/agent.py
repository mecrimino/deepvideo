"""
Scene Planner Agent (Ch11) — the visual director.

Converts a narration script into a professional, shot-by-shot production plan
(11.1): every sentence gets a visual goal, media type, camera move, transition,
overlays, emotion and timing. It specifies *what* media is needed — it never
retrieves it (11.3). The bridge between language and visual storytelling (11.2).

Built from scratch per Ch11 (folder layout 11.18) with tools.md tech: a LangGraph
module chain (11.16) over Pydantic scene models, with LLM visual reasoning.
"""

from __future__ import annotations

from typing import Optional

from core.agents.base import AgentContext, BaseAgent
from core.agents.scene.camera import CameraPlanner
from core.agents.scene.graph import build_scene_graph
from core.agents.scene.models import ScenePlan, ScenePlanResult
from core.agents.scene.overlays import OverlayPlanner
from core.agents.scene.planner import ProductionPlanBuilder
from core.agents.scene.reviewer import SceneReviewer
from core.agents.scene.splitter import SceneSplitter, split_into_beats  # noqa: F401 (compat export)
from core.agents.scene.state import ScenePlannerState
from core.agents.scene.timing import TimingEstimator
from core.agents.scene.transitions import TransitionPlanner
from core.agents.scene.visuals import VisualReasoner, generate_queries  # noqa: F401 (compat export)
from core.schemas.edl import Beat, Transcript


class ScenePlannerAgent(BaseAgent[object, ScenePlanResult]):
    name = "scene"

    def __init__(self, ctx: AgentContext) -> None:
        super().__init__(ctx)
        self.splitter = SceneSplitter()
        self.visuals = VisualReasoner(self.llm)
        self.timing = TimingEstimator()
        self.camera = CameraPlanner()
        self.transitions = TransitionPlanner()
        self.overlays = OverlayPlanner()
        self.builder = ProductionPlanBuilder()
        self.reviewer = SceneReviewer()
        self._graph = build_scene_graph(self)

    async def run(self, data: object) -> ScenePlanResult:
        """Accepts a raw script string, a Ch10 ScriptOutput, or a Transcript."""
        return await self.plan(data)

    async def plan(self, data: object, *, topic: str = "", style: str = "cinematic") -> ScenePlanResult:
        topic = topic or self.ctx.memory.working.get("topic", "")
        state: ScenePlannerState = {"topic": topic, "style": style}

        if isinstance(data, str):
            state["narration"] = data
        elif isinstance(data, Transcript):
            state["narration"] = data.text
        elif hasattr(data, "scenes") and getattr(data, "scenes"):
            state["script_scenes"] = list(getattr(data, "scenes"))  # Ch10 ScriptOutput
        elif hasattr(data, "full_text"):
            state["narration"] = data.full_text
        else:
            state["narration"] = str(data)

        final: ScenePlannerState = await self._graph.ainvoke(state)
        result = final["result"]
        self.ctx.memory.working.set("scene_plan", result.model_dump())
        self.ctx.emit("scene.completed", scenes=len(result.scenes),
                      duration=result.estimated_duration)
        return result

    # --- pipeline compat: transcript → beats with queries ------------- #
    async def beats(self, transcript: Transcript) -> list[Beat]:
        max_beat = self.ctx.settings.max_beat_sec
        topic = self.ctx.memory.working.get("topic", "")
        beat_list = split_into_beats(transcript, max_beat_sec=max_beat)
        beat_list = await generate_queries(self.ctx, beat_list, topic=topic)
        self.ctx.memory.working.set("beats", [b.model_dump() for b in beat_list])
        return beat_list

    async def plan_scenes(self, beats: list[Beat], topic: str = "") -> ScenePlan:
        """Legacy helper: beats → ScenePlan (used by the current pipeline)."""
        narration = " ".join(b.text for b in beats)
        result = await self.plan(narration, topic=topic)
        return result.as_plan()
