"""
Progress Monitor (5.6) — the Director watches execution and reports.

Tracks the status of every assigned task, emits ``director.*`` events on the
event bus (Layer 2; surfaced to the UI over Socket.IO later), and exposes a
snapshot the UI's progress monitor can render. Observability is a design rule
(2.13).
"""

from __future__ import annotations

from typing import Optional

from core.agents.director.models import TaskAssignment, TaskResult
from core.utils.logging import get_logger


class ProgressMonitor:
    def __init__(self, events=None) -> None:
        self.events = events
        self.log = get_logger("director.monitor")
        self._total = 0
        self._done = 0
        self._failed = 0

    def _emit(self, event: str, **payload) -> None:
        if self.events is not None:
            try:
                self.events.emit(event, **payload)
            except Exception:
                pass

    def start(self, tasks: list[TaskAssignment]) -> None:
        self._total = len(tasks)
        self._done = 0
        self._failed = 0
        self.log.info("execution start: %d tasks", self._total)
        self._emit("director.execution.started", total=self._total)

    def task_started(self, task: TaskAssignment) -> None:
        self.log.info("→ %s (%s)", task.name, task.agent)
        self._emit("director.task.started", task_id=task.id, task_name=task.name, agent=task.agent)

    def task_finished(self, result: TaskResult) -> None:
        if result.status in ("done", "recovered", "assigned"):
            self._done += 1
        elif result.status == "failed":
            self._failed += 1
        self._emit(
            "director.task.finished",
            task_id=result.task_id, status=result.status, attempts=result.attempts,
        )

    def snapshot(self) -> dict:
        pct = (self._done / self._total) if self._total else 0.0
        return {
            "total": self._total,
            "done": self._done,
            "failed": self._failed,
            "progress": round(pct, 3),
        }

    def finish(self) -> None:
        self.log.info("execution finished: %d/%d done, %d failed", self._done, self._total, self._failed)
        self._emit("director.execution.finished", **self.snapshot())
