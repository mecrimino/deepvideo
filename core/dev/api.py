"""
Developer Dashboard API (FastAPI router) — live, real telemetry.

  * ``GET  /dev/snapshot``       — one full metrics snapshot (all 10 panels).
  * ``GET  /dev/logs``           — structured log ring buffer (filter by level).
  * ``GET  /dev/logs/download``  — the rotating ``logs/core.log`` file.
  * ``WS   /dev/ws``             — pushes a fresh snapshot ~1×/second.

Every value is sourced from real instrumentation (see ``core/dev/metrics.py``);
there is no synthetic/mock data anywhere in this module.
"""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse

from core.config import get_settings
from core.dev.metrics import get_metrics
from core.orchestrator.events import get_event_bus
from core.utils.logging import get_logger

log = get_logger("dev")
router = APIRouter(prefix="/dev", tags=["dev"])

_subscribed = False


def _ensure_subscribed() -> None:
    global _subscribed
    if not _subscribed:
        get_metrics().subscribe(get_event_bus())
        _subscribed = True


def _working_for(run_id: str | None) -> dict | None:
    """Load the SELECTED project's working memory (never another project's)."""
    if not run_id:
        return None
    try:
        path = get_settings().paths.projects / run_id / "working.json"
        return json.loads(path.read_text("utf-8")) if path.exists() else None
    except Exception:
        return None


def build_snapshot(run_id: str | None = None) -> dict:
    _ensure_subscribed()
    from core.orchestrator.render import get_render_registry
    from core.orchestrator.state import get_registry

    return get_metrics().snapshot(
        run_registry=get_registry(),
        render_registry=get_render_registry(),
        working=_working_for(run_id),
        run_id=run_id,
    )


@router.get("/snapshot")
async def snapshot(run: str | None = None) -> dict:
    return build_snapshot(run)


@router.get("/logs")
async def logs(level: str = "ALL", limit: int = 300) -> dict:
    _ensure_subscribed()
    return {"logs": get_metrics().logs(level=level, limit=limit)}


@router.get("/logs/download")
async def logs_download():
    path = get_settings().paths.logs / "core.log"
    if not path.exists():
        return JSONResponse({"error": "no log file yet"}, status_code=404)
    return FileResponse(str(path), media_type="text/plain", filename="deep-vision-core.log")


@router.websocket("/ws")
async def ws(sock: WebSocket) -> None:
    await sock.accept()
    _ensure_subscribed()
    run_id = sock.query_params.get("run") or None
    try:
        while True:
            await sock.send_json(build_snapshot(run_id))
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # pragma: no cover
        log.debug("dev ws closed: %s", exc)
