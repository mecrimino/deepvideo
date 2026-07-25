"""
Deep Vision core — FastAPI service (Ch3: Electron → Node.js → FastAPI → AI).

This is the Python AI service. It exposes the heavy/agentic work — running the
production pipeline, transcription, stock search, the agent chat and the
topic→script front-half — over HTTP. The Node gateway (backend/) calls it and
bridges to the frontend; nothing here serves the browser directly.

Run:  uvicorn core.main:app --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import asyncio
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from core.config import get_settings
from core.dev.api import router as dev_router
from core.orchestrator.pipeline import run_pipeline
from core.orchestrator.state import RunRecord, get_registry
from core.providers.llm import get_llm
from core.providers.search import get_stock
from core.schemas.pipeline import PipelineRun
from core.tools.ffmpeg import ffmpeg_available
from core.tools.transcriber import transcribe
from core.utils.ids import new_id, now_iso
from core.utils.logging import get_logger

log = get_logger("api.core")
app = FastAPI(title="Deep Vision Core", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(dev_router)


# --------------------------------------------------------------------------- #
# request/response models
# --------------------------------------------------------------------------- #
class RunPipelineBody(BaseModel):
    script: Optional[str] = None
    audioPath: Optional[str] = None
    model: str = "mini"
    voice: Optional[str] = None
    # The connected channel's content niche — drives per-segment stock keywords.
    # Required: without a connected channel we don't know the niche, so no video.
    niche: Optional[str] = None
    settings: Optional[dict] = None
    # When true the script is used verbatim — the front-half idea-expansion is
    # skipped. Set by the "generate" hand-off from the Director planning chat,
    # where the script has already been agreed with the user.
    skipExpand: bool = False


class DirectorPlanBody(BaseModel):
    messages: list[dict]
    model: str = "pro"


class TranscribeBody(BaseModel):
    audioPath: str
    language: Optional[str] = None


class StockSearchBody(BaseModel):
    query: str
    perSource: int = 8
    kind: str = "video"


class AgentChatBody(BaseModel):
    message: str
    timeline: dict
    mentions: Optional[list] = None
    effort: str = "fast"


# --------------------------------------------------------------------------- #
# health
# --------------------------------------------------------------------------- #
@app.get("/health")
async def health() -> dict:
    from core.providers.voice import get_tts

    s = get_settings()
    return {
        "ok": True,
        "version": app.version,
        "ffmpeg": ffmpeg_available(),
        "llm": get_llm().available,
        "whisper": s.has_transcription,
        "stock": get_stock().available,
        "tts": get_tts().available(force=True),
        "motion": _motion_health(),
    }


def _motion_health() -> dict:
    """Motion graphics readiness: Remotion renderer + GLM designer."""
    from core.agents.graphics.motion_renderer import renderer_available
    from core.providers.llm.nvidia import get_glm

    return {"renderer": renderer_available(), "glm": get_glm().available}


# --------------------------------------------------------------------------- #
# voices (Ch17.5 — local Kokoro TTS)
# --------------------------------------------------------------------------- #
@app.get("/voices")
async def list_voices() -> dict:
    from core.providers.voice import get_tts

    tts = get_tts()
    voices = await tts.voices()
    return {"voices": voices, "count": len(voices), "available": tts.available(force=True),
            "default": get_settings().default_voice}


@app.get("/voice/preview/{voice}")
async def preview_voice(voice: str) -> Response:
    from core.providers.voice import get_tts

    audio = await get_tts().preview(voice)
    if audio is None:
        raise HTTPException(503, "voice preview unavailable (is the TTS server running?)")
    return Response(content=audio, media_type="audio/wav")


# --------------------------------------------------------------------------- #
# motion graphics (editor replace path — deterministic spec, Remotion render)
# --------------------------------------------------------------------------- #
class MotionRenderBody(BaseModel):
    text: str
    secondary: Optional[str] = None
    template: str = "title_card"
    preset: str = "kinetic_text"
    theme: str = "dark"
    highlight: Optional[list[str]] = None
    icon: Optional[str] = None
    durationSec: float = 3.0


@app.post("/motion/render")
async def motion_render(body: MotionRenderBody) -> dict:
    from core.agents.graphics.motion_designer import spec_from_fields
    from core.agents.graphics.motion_renderer import render_motion, renderer_available
    from core.providers.storage import register_asset

    if not renderer_available():
        raise HTTPException(503, "motion renderer unavailable (run npm install)")
    spec = spec_from_fields(
        text=body.text, secondary=body.secondary or "", template=body.template,
        preset=body.preset, theme=body.theme, highlight=body.highlight,
        icon=body.icon or "", duration_sec=body.durationSec,
    )
    asset = await render_motion(spec)
    if asset is None:
        raise HTTPException(500, "motion render failed")
    register_asset(asset)
    return {"asset": asset.model_dump()}


# --------------------------------------------------------------------------- #
# pipeline
# --------------------------------------------------------------------------- #
@app.post("/pipeline/run")
async def start_pipeline(body: RunPipelineBody) -> dict:
    if not body.script and not body.audioPath:
        raise HTTPException(400, "provide a script or audioPath")
    if not (body.niche or "").strip():
        raise HTTPException(400, "connect a channel first — its niche is required to pick footage")
    run = PipelineRun(id=new_id("run_"), createdAt=now_iso(), status="pending")
    run.input.script = body.script
    run.input.audioPath = body.audioPath
    record = RunRecord(run=run)
    get_registry().add(record)

    async def _job() -> None:
        try:
            await run_pipeline(record, script=body.script, audio_path=body.audioPath,
                               model=body.model, voice=body.voice, skip_expand=body.skipExpand,
                               asset_source=(body.settings or {}).get("assetSource", "mixed"),
                               niche=body.niche or "", brand=body.settings)
        except Exception:  # pragma: no cover
            log.exception("pipeline job crashed")

    record.task = asyncio.create_task(_job())
    return {"run": run.model_dump()}


# --------------------------------------------------------------------------- #
# director planning chat (pre-production — talk the video through, then generate)
# --------------------------------------------------------------------------- #
@app.post("/director/plan")
async def director_plan(body: DirectorPlanBody) -> dict:
    from core.agents.director.conversation import plan_conversation

    if not body.messages:
        raise HTTPException(400, "provide at least one message")
    return await plan_conversation(body.messages, model=body.model)


@app.get("/pipeline/runs")
async def list_runs() -> dict:
    """Slim list of all known runs — lets the frontend rediscover a generation
    that is still processing after a page reload."""
    runs = [
        {"id": r.run.id, "status": r.run.status, "stage": r.run.stage,
         "createdAt": r.run.createdAt,
         "script": (r.run.input.script or "")[:120] if r.run.input else ""}
        for r in get_registry().all()
    ]
    return {"runs": sorted(runs, key=lambda x: x["createdAt"], reverse=True)}


@app.get("/pipeline/run/{run_id}")
async def get_run(run_id: str) -> dict:
    record = get_registry().get(run_id)
    if record is None:
        raise HTTPException(404, "run not found")
    return record.run.model_dump()


@app.post("/pipeline/run/{run_id}/fill")
async def fill_run(run_id: str) -> dict:
    """Fill beats that got no footage in a finished run (e.g. clips stopped at
    6 min of a 10-min narration) — continues where it left off, never redoes
    the beats that already have clips."""
    from core.orchestrator.pipeline import fill_missing_footage

    record = get_registry().get(run_id)
    if record is None:
        raise HTTPException(404, "run not found")
    if record.run.status == "running":
        raise HTTPException(409, "run is still in progress")
    record.cancelled = False

    async def _job() -> None:
        try:
            await fill_missing_footage(record)
        except Exception:  # pragma: no cover
            log.exception("fill job crashed")

    record.task = asyncio.create_task(_job())
    return {"run": record.run.model_dump()}


@app.post("/pipeline/run/{run_id}/cancel")
async def cancel_run(run_id: str) -> dict:
    ok = get_registry().cancel(run_id)
    if not ok:
        raise HTTPException(404, "run not found")
    return {"ok": True}


# --------------------------------------------------------------------------- #
# transcription
# --------------------------------------------------------------------------- #
@app.post("/transcribe")
async def do_transcribe(body: TranscribeBody) -> dict:
    transcript = await transcribe(body.audioPath, body.language)
    return {"transcript": transcript.model_dump()}


# --------------------------------------------------------------------------- #
# stock search
# --------------------------------------------------------------------------- #
@app.post("/stock/search")
async def stock_search(body: StockSearchBody) -> dict:
    stock = get_stock()
    results = await stock.search(body.query, kind=body.kind, per_source=body.perSource)  # type: ignore[arg-type]
    return {"query": body.query, "results": [r.as_dict() for r in results]}


# --------------------------------------------------------------------------- #
# render / export (Ch2 Layer 5)
# --------------------------------------------------------------------------- #
class RenderBody(BaseModel):
    timeline: dict
    format: str = "mp4"
    width: Optional[int] = None
    height: Optional[int] = None
    burnCaptions: bool = True


@app.post("/render")
async def start_render(body: RenderBody) -> dict:
    from core.orchestrator.render import get_render_registry
    from core.schemas.edl import Timeline

    try:
        timeline = Timeline.model_validate(body.timeline)
    except Exception as exc:
        raise HTTPException(400, f"invalid timeline: {exc}")
    reg = get_render_registry()
    job = reg.create()
    reg.start(job, timeline, body.model_dump())
    return {"job": job.model_dump()}


@app.get("/render/{job_id}")
async def get_render(job_id: str) -> dict:
    from core.orchestrator.render import get_render_registry

    job = get_render_registry().get(job_id)
    if job is None:
        raise HTTPException(404, "render job not found")
    return {"job": job.model_dump()}


# --------------------------------------------------------------------------- #
# agent chat (editor's Deep Video Agent)
# --------------------------------------------------------------------------- #
@app.post("/agent/chat")
async def do_agent_chat(body: AgentChatBody) -> dict:
    from core.agents.chat import agent_chat
    from core.schemas.edl import Timeline

    try:
        timeline = Timeline.model_validate(body.timeline)
    except Exception as exc:
        raise HTTPException(400, f"invalid timeline: {exc}")
    return await agent_chat(body.message, timeline, effort=body.effort, mentions=body.mentions)


@app.on_event("shutdown")
async def _shutdown() -> None:
    from core.providers.api_manager import get_api_manager

    await get_api_manager().aclose()
