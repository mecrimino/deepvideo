"""
Task Decomposer (6.5 / 6.6) — turn major tasks into atomic tasks.

One request becomes many tasks (6.5): Research → History / Technical Specs /
Timeline; Script → Hook / Introduction / Body / Ending; and asset collection fans
out **per scene** — which is where a 12-minute video becomes *hundreds* of tasks
(6.1). Each task is atomic (6.6): assignable to a single agent.

Dependencies are resolved by **data flow, not stage order** (6.7): a task depends
on the groups that produce its inputs, so narration (audio) runs in parallel with
asset search — exactly the 6.9 graph — even though the workflow lists them in
sequence.
"""

from __future__ import annotations

from typing import Optional

from core.agents.director.models import ProductionBrief, RequiredCapabilities, WorkflowChoice
from core.agents.planner.models import PlanTask
from core.providers.llm.router import LLMUnavailable
from core.utils.logging import get_logger

log = get_logger("planner.decompose")

# group -> the groups that must finish before it (data dependencies, 6.7/6.9)
_DEPS: dict[str, list[str]] = {
    "research": [],
    "fact_check": ["research"],
    "script": ["research", "fact_check"],
    "scene": ["script"],
    "assets": ["scene"],
    "image_search": ["scene"],
    "video_search": ["scene"],
    "music_search": ["scene"],
    "graphics": ["scene"],
    "maps": ["scene"],
    "audio": ["script"],          # narration derives from script → parallel w/ assets
    "subtitle": ["audio"],
    "timeline": ["assets", "image_search", "video_search", "music_search",
                 "graphics", "maps", "audio"],
    "review": ["timeline"],
    "export": ["review"],
}


class Decomposer:
    def __init__(self, llm=None) -> None:
        self.llm = llm

    async def decompose(
        self,
        brief: ProductionBrief,
        workflow: WorkflowChoice,
        capabilities: RequiredCapabilities,
        scene_count: int,
        research_questions: Optional[list[str]] = None,
    ) -> list[PlanTask]:
        tasks: list[PlanTask] = []
        group_ids: dict[str, list[int]] = {}
        nid = 1

        def add(name: str, agent: str, group: str, params: dict, scene_id: Optional[int] = None) -> int:
            nonlocal nid
            deps: list[int] = []
            for dep_group in _DEPS.get(group, []):
                deps.extend(group_ids.get(dep_group, []))
            tasks.append(
                PlanTask(
                    id=nid, name=name, agent=agent, group=group,
                    depends_on=sorted(set(deps)), params=params, scene_id=scene_id,
                )
            )
            group_ids.setdefault(group, []).append(nid)
            nid += 1
            return nid - 1

        for stage in workflow.stages:
            for spec in self._expand(stage, brief, capabilities, scene_count, research_questions):
                add(**spec)

        return tasks

    # ------------------------------------------------------------------ #
    def _expand(self, stage, brief, caps, scene_count, research_questions):
        topic = brief.topic
        if stage == "research":
            subs = research_questions or ["History", "Technical Specs", "Timeline"]
            return [
                {"name": f"Research: {q[:40]}", "agent": "research", "group": "research",
                 "params": {"task": "research_topic", "topic": topic, "question": q}}
                for q in subs[:6]
            ]
        if stage == "fact_check":
            return [{"name": "Fact Check", "agent": "research", "group": "fact_check",
                     "params": {"task": "verify_facts", "topic": topic}}]
        if stage == "script":
            return [
                {"name": f"Write {part}", "agent": "script", "group": "script",
                 "params": {"task": "write_section", "section": part.lower(), "topic": topic}}
                for part in ("Hook", "Introduction", "Body", "Ending")
            ]
        if stage == "scene":
            return [{"name": "Plan Scenes", "agent": "scene", "group": "scene",
                     "params": {"task": "plan_scenes", "topic": topic}}]
        if stage == "assets":
            # per-scene asset search — this is the fan-out that creates hundreds
            # of tasks (6.1). Media type is refined later by dynamic replanning.
            specs = []
            for i in range(1, scene_count + 1):
                specs.append({
                    "name": f"Find Assets (Scene {i})", "agent": "video_search",
                    "group": "assets", "scene_id": i,
                    "params": {"task": "find_assets", "scene": i, "topic": topic,
                               "license": "creative_commons"},
                })
            specs.append({"name": "Search Music", "agent": "audio", "group": "music_search",
                          "params": {"task": "search_music", "topic": topic}})
            return specs
        if stage == "graphics":
            return [{"name": "Design Motion Graphics", "agent": "graphics", "group": "graphics",
                     "params": {"task": "design_graphics", "topic": topic}}]
        if stage == "maps":
            return [{"name": "Design Maps", "agent": "graphics", "group": "maps",
                     "params": {"task": "design_maps", "topic": topic}}]
        if stage == "audio":
            return [{"name": "Generate Narration", "agent": "audio", "group": "audio",
                     "params": {"task": "generate_voice", "topic": topic}}]
        if stage == "subtitle":
            return [{"name": "Generate Subtitles", "agent": "subtitle", "group": "subtitle",
                     "params": {"task": "generate_captions"}}]
        if stage == "timeline":
            return [{"name": "Assemble Timeline", "agent": "timeline", "group": "timeline",
                     "params": {"task": "assemble"}}]
        if stage == "review":
            return [{"name": "Quality Review", "agent": "reviewer", "group": "review",
                     "params": {"task": "review"}}]
        if stage == "export":
            return [{"name": "Export Video", "agent": "exporter", "group": "export",
                     "params": {"task": "export", "video_type": brief.video_type}}]
        # unknown stage → single generic task
        return [{"name": stage.title(), "agent": stage, "group": stage, "params": {"task": stage}}]
