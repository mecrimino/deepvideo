"""
Task Scheduler (5.6 / 5.10 / 5.11 / 5.16).

Turns a workflow into an ordered set of task assignments. The Director *assigns*
work; it never does it (5.17). Each stage becomes one or more
:class:`TaskAssignment`s with:

  * a responsible **agent** (single responsibility, 1.6);
  * a **dependency** list — a task starts only when its inputs are ready (5.10);
  * a **priority** from the 3-tier system (5.11);
  * a **structured params payload** including the expected ``output`` artefact
    (5.16 communication model).

Independent search tasks fan out to run in parallel (5.10). Capabilities (5.8)
add optional tasks: maps and music search.
"""

from __future__ import annotations

from typing import Optional

from core.agents.director.models import (
    ProductionBrief,
    RequiredCapabilities,
    TaskAssignment,
    WorkflowChoice,
)

# stage -> (agent, priority). Priority follows the 5.11 tiers:
#   P1 high   : research, fact_check, script  (+ critical-path scene/timeline/export)
#   P2 medium : image_search, video_search, music_search, audio, review
#   P3 low    : graphics, maps, subtitle  (transitions/animations/minor effects)
_STAGE_AGENT: dict[str, tuple[str, str]] = {
    "research": ("research", "high"),
    "fact_check": ("research", "high"),
    "script": ("script", "high"),
    "scene": ("scene", "high"),
    "image_search": ("image_search", "medium"),
    "video_search": ("video_search", "medium"),
    "music_search": ("audio", "medium"),
    "audio": ("audio", "medium"),
    "graphics": ("graphics", "low"),
    "maps": ("graphics", "low"),
    "subtitle": ("subtitle", "low"),
    "timeline": ("timeline", "high"),
    "review": ("reviewer", "medium"),
    "export": ("exporter", "high"),
}

# 5.16 — the artefact each agent is expected to return
_OUTPUT: dict[str, str] = {
    "research": "knowledge_package",
    "fact_check": "verified_facts",
    "script": "script",
    "scene": "scene_plan",
    "image_search": "images",
    "video_search": "clips",
    "music_search": "music",
    "audio": "audio_mix",
    "graphics": "render_package",
    "maps": "map_graphics",
    "subtitle": "captions",
    "timeline": "timeline",
    "review": "review_report",
    "export": "video_file",
}


class TaskScheduler:
    def schedule(
        self,
        brief: ProductionBrief,
        workflow: WorkflowChoice,
        capabilities: Optional[RequiredCapabilities] = None,
    ) -> list[TaskAssignment]:
        caps = capabilities or RequiredCapabilities()
        tasks: list[TaskAssignment] = []
        next_id = 1
        prev_barrier: list[int] = []

        for stage in workflow.stages:
            stage_ids: list[int] = []
            for agent_stage in self._expand(stage, caps):
                agent, priority = _STAGE_AGENT.get(agent_stage, (agent_stage, "medium"))
                tasks.append(
                    TaskAssignment(
                        id=next_id,
                        name=agent_stage.replace("_", " ").title(),
                        agent=agent,
                        priority=priority,  # type: ignore[arg-type]
                        depends_on=list(prev_barrier),
                        params=self._params(agent_stage, brief),
                    )
                )
                stage_ids.append(next_id)
                next_id += 1
            if stage_ids:
                prev_barrier = stage_ids

        return tasks

    def _expand(self, stage: str, caps: RequiredCapabilities) -> list[str]:
        """Fan a container stage into parallel sub-stages (5.10)."""
        if stage != "assets":
            return [stage]
        out: list[str] = []
        if caps.image_search:
            out.append("image_search")
        if caps.video_search:
            out.append("video_search")
        out.append("music_search")
        if caps.maps:
            out.append("maps")
        return out or ["video_search"]

    def _params(self, stage: str, brief: ProductionBrief) -> dict:
        """Structured payload for the worker (5.16 communication model)."""
        base = {"topic": brief.topic, "style": brief.style, "language": brief.language}
        priority = _STAGE_AGENT.get(stage, ("", "medium"))[1]
        params: dict = {"task": self._task_name(stage), "deadline": priority,
                        "output": _OUTPUT.get(stage, "result")}
        if stage in ("image_search", "video_search", "music_search"):
            params.update(base)
            params["license"] = "creative_commons"
        elif stage in ("research", "fact_check"):
            params["topic"] = brief.topic
        elif stage == "script":
            params.update(base)
            params["duration"] = brief.duration
        elif stage == "export":
            params["video_type"] = brief.video_type
            params["duration"] = brief.duration
        else:
            params.update(base)
        return params

    @staticmethod
    def _task_name(stage: str) -> str:
        return {
            "image_search": "search_images",
            "video_search": "search_videos",
            "music_search": "search_music",
            "research": "research_topic",
            "fact_check": "verify_facts",
            "script": "write_script",
        }.get(stage, stage)
