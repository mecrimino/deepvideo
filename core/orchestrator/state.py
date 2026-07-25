"""
Project state machine + run registry (Ch19.4).

    Created → Planning → Research → Scripting → Scene Planning →
    Asset Retrieval → Timeline → Rendering → Review → Completed

The full project lifecycle from Ch19.4 is modelled by :class:`ProjectState`. Each
active run is tracked by a :class:`RunRecord` (the frontend-facing
:class:`PipelineRun` plus control state — a cancel flag and the asyncio task).
On failure the workflow can return to an earlier state instead of restarting
(Ch19.4). The registry keeps runs in memory and mirrors them to disk so
``GET /pipeline/run/:id`` works across requests.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional

from core.config import get_settings
from core.schemas.pipeline import PipelineRun
from core.utils.logging import get_logger

log = get_logger("state")


class ProjectState(str, Enum):
    CREATED = "created"
    PLANNING = "planning"
    RESEARCH = "research"
    SCRIPTING = "scripting"
    SCENE_PLANNING = "scene_planning"
    ASSET_RETRIEVAL = "asset_retrieval"
    TIMELINE = "timeline"
    RENDERING = "rendering"
    REVIEW = "review"
    COMPLETED = "completed"
    FAILED = "failed"


# On failure, which state to resume from (Ch19.4: "return to the appropriate
# state instead of restarting"). Maps a failed state to its safe resume point.
RESUME_FROM: dict[ProjectState, ProjectState] = {
    ProjectState.RESEARCH: ProjectState.PLANNING,
    ProjectState.SCRIPTING: ProjectState.RESEARCH,
    ProjectState.SCENE_PLANNING: ProjectState.SCRIPTING,
    ProjectState.ASSET_RETRIEVAL: ProjectState.SCENE_PLANNING,
    ProjectState.TIMELINE: ProjectState.ASSET_RETRIEVAL,
    ProjectState.RENDERING: ProjectState.TIMELINE,
    ProjectState.REVIEW: ProjectState.TIMELINE,
}


@dataclass
class RunRecord:
    run: PipelineRun
    state: ProjectState = ProjectState.CREATED
    cancelled: bool = False
    task: Optional[asyncio.Task] = None

    def persist(self) -> None:
        try:
            d = get_settings().paths.projects / self.run.id
            d.mkdir(parents=True, exist_ok=True)
            (d / "run.json").write_text(self.run.model_dump_json(), "utf-8")
        except Exception as exc:
            log.debug("run persist failed: %s", exc)


class RunRegistry:
    def __init__(self) -> None:
        self._runs: dict[str, RunRecord] = {}

    def add(self, record: RunRecord) -> None:
        self._runs[record.run.id] = record

    def get(self, run_id: str) -> Optional[RunRecord]:
        rec = self._runs.get(run_id)
        if rec is not None:
            return rec
        # fall back to disk (survives worker restarts)
        path: Path = get_settings().paths.projects / run_id / "run.json"
        if path.exists():
            try:
                run = PipelineRun.model_validate_json(path.read_text("utf-8"))
                rec = RunRecord(run=run)
                # A disk-loaded run has no live task: if it still claims to be
                # running, its process died — mark it failed (never a zombie).
                if run.status in ("running", "pending"):
                    run.status = "failed"
                    for s in run.stages:
                        if s.status == "running":
                            s.status = "failed"
                            s.error = "server restarted"
                    rec.persist()
                self._runs[run_id] = rec
                return rec
            except Exception:
                return None
        return None

    def cancel(self, run_id: str) -> bool:
        rec = self.get(run_id)  # include disk-loaded records
        if rec is None:
            return False
        rec.cancelled = True
        if rec.task is not None and not rec.task.done():
            rec.task.cancel()
        # Mark the run terminal RIGHT NOW — never rely on the (possibly stuck or
        # already-dead) task to do it. Cancel must always be immediate.
        if rec.run.status in ("running", "pending"):
            rec.run.status = "failed"
            for s in rec.run.stages:
                if s.status == "running":
                    s.status = "failed"
                    s.error = "cancelled"
            rec.persist()
        return True

    def all(self) -> list[RunRecord]:
        return list(self._runs.values())


_registry: Optional[RunRegistry] = None


def get_registry() -> RunRegistry:
    global _registry
    if _registry is None:
        _registry = RunRegistry()
    return _registry
