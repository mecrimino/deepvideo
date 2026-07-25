"""
Progress Tracking (19.13) — real-time project status.

Maintains a per-stage status map (done / running / waiting / pending / percent)
matching the 19.4 state machine, so users and internal monitors can see exactly
where a long-running project is.
"""

from __future__ import annotations

from core.orchestrator.state import ProjectState

_STAGES = [
    ProjectState.PLANNING, ProjectState.RESEARCH, ProjectState.SCRIPTING,
    ProjectState.SCENE_PLANNING, ProjectState.ASSET_RETRIEVAL, ProjectState.TIMELINE,
    ProjectState.RENDERING, ProjectState.REVIEW,
]


class ProgressMonitor:
    def __init__(self, events=None, project_id: str = "") -> None:
        self.events = events
        self.project_id = project_id
        self.status: dict[str, str] = {s.value: "pending" for s in _STAGES}

    def start(self, state: ProjectState) -> None:
        self.status[state.value] = "running"
        self._emit(state, "running")

    def done(self, state: ProjectState) -> None:
        self.status[state.value] = "done"
        self._emit(state, "done")

    def percent(self, state: ProjectState, pct: float) -> None:
        self.status[state.value] = f"{int(pct * 100)}%"
        self._emit(state, self.status[state.value])

    def snapshot(self) -> dict:
        done = sum(1 for v in self.status.values() if v == "done")
        return {"stages": dict(self.status), "overall": round(done / len(_STAGES), 3)}

    def _emit(self, state: ProjectState, status: str) -> None:
        if self.events is not None:
            try:
                self.events.emit("progress.updated", project_id=self.project_id,
                                 stage=state.value, status=status)
            except Exception:
                pass
