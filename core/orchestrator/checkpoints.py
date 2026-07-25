"""
State Persistence / Checkpoints (19.9) — resume long runs after a crash.

Periodically serializes the workflow state (Pydantic models → JSON) to
``projects/<id>/checkpoints/`` so a crashed or paused project resumes from the
latest checkpoint instead of restarting. Complements LangGraph's in-process
checkpointer with a durable on-disk copy.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

from core.config import get_settings
from core.orchestrator.state import ProjectState
from core.utils.ids import now_iso
from core.utils.logging import get_logger

log = get_logger("orchestrator.checkpoint")

_SERIALIZE_KEYS = (
    "project_id", "goal", "pstate", "brief", "plan", "knowledge", "script",
    "scene_plan", "assets", "assets_by_scene", "audio_plan", "render_package",
    "timeline", "review", "revisions",
)


def _to_jsonable(v):
    if hasattr(v, "model_dump"):
        return v.model_dump()
    if isinstance(v, ProjectState):
        return v.value
    return v


class CheckpointManager:
    def __init__(self, project_id: str) -> None:
        self.dir = get_settings().paths.projects / project_id / "checkpoints"
        self.dir.mkdir(parents=True, exist_ok=True)

    def save(self, state: dict) -> None:
        data = {k: _to_jsonable(state.get(k)) for k in _SERIALIZE_KEYS if state.get(k) is not None}
        data["_at"] = now_iso()
        try:
            (self.dir / "latest.json").write_text(json.dumps(data, default=str), "utf-8")
        except Exception as exc:
            log.debug("checkpoint save failed: %s", exc)

    def load(self) -> Optional[dict]:
        path = self.dir / "latest.json"
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text("utf-8"))
        except Exception:
            return None
