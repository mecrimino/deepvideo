"""
Render job management (Ch2 Layer 5) — async export jobs with progress polling.

Mirrors the pipeline-run pattern: a job is created, run in the background, and
polled via ``GET /render/{id}``. Returns the shared ``RenderJob`` shape the
frontend expects (status/progress/outputPath/url/durationSec/error).
"""

from __future__ import annotations

import asyncio
from typing import Optional

from pydantic import BaseModel

from core.agents.exporter import ExporterAgent
from core.orchestrator.events import get_event_bus
from core.providers.storage import rel
from core.schemas.edl import Timeline
from core.utils.ids import new_id
from core.utils.logging import get_logger

log = get_logger("render")


class RenderJob(BaseModel):
    id: str
    status: str = "queued"  # queued | running | done | failed
    progress: float = 0.0
    message: Optional[str] = None
    outputPath: Optional[str] = None
    url: Optional[str] = None
    durationSec: Optional[float] = None
    error: Optional[str] = None


class RenderRegistry:
    def __init__(self) -> None:
        self._jobs: dict[str, RenderJob] = {}
        self._tasks: dict[str, asyncio.Task] = {}

    def create(self) -> RenderJob:
        job = RenderJob(id=new_id("rnd_"), status="queued")
        self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Optional[RenderJob]:
        return self._jobs.get(job_id)

    def start(self, job: RenderJob, timeline: Timeline, opts: dict) -> None:
        self._tasks[job.id] = asyncio.create_task(self._run(job, timeline, opts))

    async def _run(self, job: RenderJob, timeline: Timeline, opts: dict) -> None:
        job.status = "running"

        def on_progress(p: float, msg: str) -> None:
            job.progress = round(p, 3)
            job.message = msg

        try:
            exporter = ExporterAgent()
            out = await exporter.render(
                timeline,
                job_id=job.id,
                fmt=opts.get("format", "mp4"),
                width=opts.get("width"),
                height=opts.get("height"),
                burn_captions=opts.get("burnCaptions", True),
                on_progress=on_progress,
            )
            job.outputPath = rel(out)
            job.durationSec = timeline.durationSec
            job.progress = 1.0
            job.status = "done"
            job.message = "render complete"
            get_event_bus().emit("render.finished", job_id=job.id, output=job.outputPath)
        except Exception as exc:  # pragma: no cover - defensive
            log.exception("render failed")
            job.status = "failed"
            job.error = str(exc)
            get_event_bus().emit("render.failed", job_id=job.id, error=str(exc))


_registry: Optional[RenderRegistry] = None


def get_render_registry() -> RenderRegistry:
    global _registry
    if _registry is None:
        _registry = RenderRegistry()
    return _registry
