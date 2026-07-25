"""
Mini production pipeline (Ch1.7 / Ch19) — script|audio → editable Timeline.

Runs the six frontend-facing stages, updating the :class:`PipelineRun` and its
live progress feed after every beat so the processing monitor animates in real
time:

    segment → queries → retrieve → rerank → pick → history

Each stage delegates to a specialist agent (Scene, Video/Image search, Timeline)
and records structured results. Retrieval and pick are the expensive stages;
they run beat-by-beat with graceful fallbacks (a beat with no good match becomes
a generation slot rather than a hole, Ch12.16 / Ch15).
"""

from __future__ import annotations

import asyncio
from typing import Optional

from core.agents.base import AgentContext
from core.agents.candidates import Candidate
from core.agents.image import ImageSearchAgent
from core.agents.scene import ScenePlannerAgent, generate_queries, plan_visuals, split_into_beats
from core.agents.timeline import TimelineAgent
from core.agents.video import VideoSearchAgent
from core.config import get_settings
from core.memory import get_memory
from core.orchestrator.events import get_event_bus
from core.orchestrator.state import ProjectState, RunRecord
from core.schemas.edl import Beat, ClipAsset, Transcript
from core.schemas.pipeline import (
    GeneratePick,
    MatchCandidate,
    PickDecision,
    PipelineRun,
    RetrievePick,
    RunProgressInfo,
    SegmentPick,
    SegmentProgress,
    SegmentThumb,
    StageResult,
)
from core.schemas.edl import GenerationSlot
from core.providers.storage import register_asset
from core.tools.transcriber import transcribe, transcript_from_script
from core.utils.ids import new_id, now_iso
from core.utils.logging import get_logger

log = get_logger("pipeline")

STAGES = ["segment", "queries", "retrieve", "rerank", "pick", "history"]


class CancelledError(Exception):
    pass


def _stage(run: PipelineRun, name: str) -> StageResult:
    for s in run.stages:
        if s.stage == name:
            return s
    s = StageResult(stage=name)  # type: ignore[arg-type]
    run.stages.append(s)
    return s


def _begin(run: PipelineRun, name: str) -> None:
    run.stage = name  # type: ignore[assignment]
    st = _stage(run, name)
    st.status = "running"
    st.startedAt = now_iso()


def _finish(run: PipelineRun, name: str, output=None) -> None:
    st = _stage(run, name)
    st.status = "done"
    st.finishedAt = now_iso()
    if output is not None:
        st.output = output


async def run_pipeline(
    record: RunRecord,
    *,
    script: Optional[str],
    audio_path: Optional[str],
    model: str = "mini",
    voice: Optional[str] = None,
    skip_expand: bool = False,
    asset_source: str = "mixed",
    niche: str = "",
    brand: Optional[dict] = None,
) -> PipelineRun:
    run = record.run
    ctx = _context(run.id, model)
    # Brand profile (per-channel settings): theme, compliance toggles, template
    # blocklist. Every key is optional — an empty dict means default behavior.
    brand = brand or {}
    effort = "smart" if model in ("pro", "agent") else "fast"
    run.status = "running"
    # 'agent' is the full autonomous Video Agent; display it under the pro lane
    progress_model = "pro" if model == "agent" else model
    run.progress = RunProgressInfo(model=progress_model, segments=[])  # type: ignore[arg-type]
    if niche:
        run.progress.niche = niche
        ctx.memory.working.set("niche", niche)

    def check_cancel() -> None:
        if record.cancelled:
            raise CancelledError()

    try:
        # ---- front-half: expand a short idea into full narration ------ #
        # The frontend sends the user's idea as `script`. A short idea/prompt is
        # expanded into real narration (Director → Research → Script, Ch5/9);
        # a full pasted script is used as-is.
        # The Video Agent always runs the full front-half (Director→Research→
        # Script); Mini/Pro only expand a short idea.
        # The Director planning chat already produced the final, user-approved
        # script; skip_expand makes the pipeline use it verbatim.
        if not skip_expand and script and not audio_path and (
            model == "agent" or _should_expand(script)
        ):
            record.state = ProjectState.RESEARCH
            script = await _expand_prompt(ctx, script, effort, run)

        # ---- transcript (input normalisation) ------------------------- #
        record.state = ProjectState.SCRIPTING
        transcript = await _acquire_transcript(script, audio_path)
        run.transcript = transcript

        # ---- narration synthesis (Ch17.5 Voice Engine) --------------- #
        # When the user didn't upload their own narration audio, speak the
        # script with the chosen voice via the local Kokoro TTS. The resulting
        # WAV becomes the project's narration track (played + waveformed in the
        # editor). Honestly gated: if TTS is down, audio_path stays None.
        if not audio_path and transcript.text.strip():
            synthesized = await _synthesize_narration(
                ctx, run.id, transcript.text, voice or get_settings().default_voice, run
            )
            if synthesized:
                audio_path = synthesized

        ctx.memory.working.set("audioPath", audio_path)
        if not ctx.memory.working.get("topic"):
            ctx.memory.working.set("topic", _guess_topic(script or transcript.text))

        # ---- stage 1: segment ---------------------------------------- #
        record.state = ProjectState.SCENE_PLANNING
        _begin(run, "segment")
        check_cancel()
        beats = split_into_beats(transcript, max_beat_sec=ctx.settings.max_beat_sec)
        # Cap total scenes for free-tier API limits (Ch20) — but NEVER truncate:
        # a long video re-splits with longer scenes so the WHOLE narration is
        # covered end-to-end. 10 min ≈ 150 scenes; beyond that scenes stretch.
        _MAX_BEATS = 150
        if len(beats) > _MAX_BEATS:
            # MERGE consecutive beats into longer scenes — re-splitting can't
            # go below one-beat-per-sentence, and truncating loses the tail of
            # the video. Merging always covers the whole narration.
            merged = _merge_beats(beats, _MAX_BEATS)
            log.info("%d beats > cap %d — merged into %d scenes covering the full video",
                     len(beats), _MAX_BEATS, len(merged))
            beats = merged
        run.beats = beats
        run.progress.segments = [
            SegmentProgress(beatId=b.id, text=b.text) for b in beats
        ]
        _finish(run, "segment", {"beats": len(beats)})
        record.persist()

        # ---- stage 2: queries ---------------------------------------- #
        _begin(run, "queries")
        check_cancel()
        beats = await generate_queries(
            ctx, beats, topic=ctx.memory.working.get("topic", ""),
            niche=niche or ctx.memory.working.get("niche", ""),
        )
        # Visual planning (Ch11): decide per segment HOW it is shown — stock
        # video / stock image / AI image / motion graphics — BEFORE retrieval.
        beats = await plan_visuals(ctx, beats, niche=niche or ctx.memory.working.get("niche", ""))
        # Compliance (brand profile): "Disable animations" → no motion-graphics
        # beats; they show real footage instead.
        if brand.get("disableAnimations"):
            for b in beats:
                if b.visual == "motion_graphics":
                    b.visual = "stock_video"
        run.beats = beats
        ctx.memory.working.set("beats", [b.model_dump() for b in beats])
        for seg, beat in zip(run.progress.segments, beats):
            seg.keyword = beat.queries.shown if beat.queries else None
            seg.visual = beat.visual
        _finish(run, "queries", {"queried": len(beats),
                                 "plan": {b.id: b.visual for b in beats}})
        record.persist()

        # ---- stage 3+4: retrieve + rerank (per beat) ----------------- #
        record.state = ProjectState.ASSET_RETRIEVAL
        _begin(run, "retrieve")
        video_agent = VideoSearchAgent(ctx)
        image_agent = ImageSearchAgent(ctx)
        candidates_by_beat: dict[str, list[Candidate]] = {}
        agent_by_beat: dict[str, object] = {}

        for seg, beat in zip(run.progress.segments, beats):
            check_cancel()
            # asset_source lets the user pin footage type; "mixed" follows the
            # visual plan (Ch11) with AI fallback (Ch12.16).
            plan = beat.visual or ("stock_image" if _prefers_image(beat) else "stock_video")
            if asset_source == "ai_image" or (asset_source == "mixed"
                                              and plan in ("ai_image", "motion_graphics")):
                # skip stock → the pick stage generates an image for this beat.
                # ponytail: motion_graphics renders as a generated title-card
                # image until the Graphics agent is wired into the run.
                candidates_by_beat[beat.id] = []
                agent_by_beat[beat.id] = image_agent
                continue
            if asset_source == "stock_image":
                use_image = True
            elif asset_source == "stock_video":
                use_image = False
            else:
                use_image = plan == "stock_image"
            agent = image_agent if use_image else video_agent
            cands: list[Candidate] = []
            if agent.available:  # type: ignore[attr-defined]
                cands = await agent.search(beat)  # type: ignore[attr-defined]
                if not cands and agent is image_agent and video_agent.available:
                    agent = video_agent
                    cands = await video_agent.search(beat)
            candidates_by_beat[beat.id] = cands
            agent_by_beat[beat.id] = agent
            seg.pooled = len(cands)
            seg.thumbs = [
                SegmentThumb(url=c.thumb, source=c.source) for c in cands[:5] if c.thumb
            ]
        _finish(run, "retrieve", {"pooled": sum(len(v) for v in candidates_by_beat.values())})

        _begin(run, "rerank")
        top_k = ctx.settings.retrieve_top_k
        for beat_id, cands in candidates_by_beat.items():
            candidates_by_beat[beat_id] = sorted(cands, key=lambda c: c.score, reverse=True)[:top_k]
        _finish(run, "rerank")
        record.persist()

        # ---- stage 5: pick (+ materialize chosen asset) -------------- #
        _begin(run, "pick")
        threshold = ctx.settings.match_threshold
        picks: list[PickDecision] = []
        assets: dict[str, dict] = {}
        used_assets: set[str] = set()  # never place the same clip twice in one video

        # Motion graphics (Ch16): design ALL motion beats in ONE GLM call (the
        # NVIDIA queue costs minutes per request), then render each via Remotion.
        motion_specs: dict[str, dict] = {}
        motion_clips: dict[str, ClipAsset] = {}
        motion_beats = [b for b in beats if b.visual == "motion_graphics"]
        if motion_beats:
            try:
                from core.agents.graphics.motion_codegen import generate_all
                from core.agents.graphics.motion_designer import design_motion_specs
                from core.agents.graphics.motion_renderer import renderer_available

                if renderer_available():
                    run_niche = niche or ctx.memory.working.get("niche", "")
                    motion_specs = await design_motion_specs(
                        motion_beats, niche=run_niche,
                        theme=_brand_theme(brand.get("theme", ""), niche))
                    # Brand blocklist: never use these motion-template types.
                    blocked = set(brand.get("blockedTemplates") or [])
                    if blocked:
                        motion_specs = {k: v for k, v in motion_specs.items()
                                        if v.get("template") not in blocked}
                    # Brand background image → backdrop for motion scenes.
                    if brand.get("background"):
                        for spec in motion_specs.values():
                            spec["background"] = brand["background"]
                    ctx.emit("graphics.designed", count=len(motion_specs))
                    # Codegen mode: GLM writes each Remotion component (parallel).
                    # Beats it can't produce fall back to the template renderer.
                    motion_clips = await generate_all(motion_specs, niche=run_niche)
                    ctx.emit("graphics.generated", count=len(motion_clips))
            except Exception as exc:
                log.warning("motion design failed — beats fall back to AI images: %s", exc)

        for seg, beat in zip(run.progress.segments, beats):
            check_cancel()
            # planned motion graphic → codegen clip, else template render,
            # else the AI-image fallback below.
            if beat.id in motion_specs:
                from core.agents.graphics.motion_renderer import render_motion

                mg_asset = motion_clips.get(beat.id) or await render_motion(motion_specs[beat.id])
                if mg_asset is not None:
                    assets[mg_asset.id] = mg_asset.model_dump()
                    register_asset(mg_asset)
                    cand = MatchCandidate(clipId=mg_asset.id, score=0.9, textScore=0.9,
                                          visualScore=0.9, inSec=0.0,
                                          outSec=mg_asset.durationSec)
                    picks.append(RetrievePick(beatId=beat.id, candidate=cand))
                    seg.pick = SegmentPick(source="motion_graphics", score=0.9,
                                           status="auto", thumb=None)
                    continue
            cands = candidates_by_beat.get(beat.id, [])
            agent = agent_by_beat.get(beat.id)

            async def _place_stock(cand, status: str) -> bool:
                """Materialize a candidate onto this beat; True on success."""
                asset = await agent.materialize(cand.id, beat)  # type: ignore[attr-defined]
                if asset is None:
                    return False
                used_assets.add(cand.id)
                assets[cand.id] = asset.model_dump()
                register_asset(asset)  # add to shared catalog for render/editor
                cand.out_sec = asset.durationSec
                picks.append(RetrievePick(beatId=beat.id, candidate=cand.to_match()))
                seg.pick = _seg_pick(cand, status, asset.thumbPath)
                return True

            # 1) best unused candidate above the match threshold
            best = next((c for c in cands if c.id not in used_assets and c.score >= threshold), None)
            if best is not None and await _place_stock(best, "auto"):
                continue
            # 2) generate an AI image (Ch12.16)
            gen_asset = await _generate_image_asset(ctx, beat)
            if gen_asset is not None:
                assets[gen_asset.id] = gen_asset.model_dump()
                register_asset(gen_asset)
                cand = MatchCandidate(clipId=gen_asset.id, score=0.75, textScore=0.75,
                                      visualScore=0.7, inSec=0.0, outSec=gen_asset.durationSec)
                picks.append(RetrievePick(beatId=beat.id, candidate=cand))
                seg.pooled = (seg.pooled or 0)
                seg.pick = _gen_seg_pick(gen_asset)
                continue
            # 3) NEVER leave a hole: take the best unused stock even below the
            #    threshold (marked "review" so the editor flags it), trying a
            #    few candidates in case a download fails.
            placed = False
            for cand in [c for c in cands if c.id not in used_assets][:4]:
                if await _place_stock(cand, "review"):
                    placed = True
                    break
            if placed:
                continue
            # 4) true last resort (no stock, no AI) → a generation slot
            log.warning("beat %s could not be filled (no stock, no AI image)", beat.id)
            slot = GenerationSlot(
                id=new_id("slot_"), beatId=beat.id,
                prompt=(beat.queries.shown if beat.queries else beat.text),
                durationSec=beat.range.duration,
            )
            picks.append(GeneratePick(beatId=beat.id, slot=slot))
        run.picks = picks
        ctx.memory.working.set("assets", assets)
        _finish(run, "pick", {"picked": len(picks)})
        record.persist()

        # ---- stage 6: history (assemble + remember) ------------------ #
        record.state = ProjectState.TIMELINE
        _begin(run, "history")
        timeline = TimelineAgent(ctx).build(
            beats, picks, assets, audio_path=audio_path
        )
        # refine captions from word timings (Ch17 subtitle) + plan audio (Ch17)
        try:
            from core.agents.audio import AudioAgent
            from core.agents.subtitle import SubtitleAgent

            if brand.get("disableOverlays"):
                # Compliance: "Disable overlays" → no captions/text on video.
                timeline.captions = []
            elif transcript.words:
                refined = SubtitleAgent(ctx).build(transcript)
                if refined:
                    timeline.captions = refined
            await AudioAgent(ctx).plan(beats, narration_path=audio_path)
        except Exception as exc:
            log.warning("audio/subtitle enrichment failed: %s", exc)
        # "Disable effects" → the exporter renders without transitions/grading.
        ctx.memory.working.set("disableEffects", bool(brand.get("disableEffects")))
        ctx.memory.working.set("background", brand.get("background") or "")
        run.timeline = timeline

        # quality review pass (Ch18) — flags weak spots; never blocks export
        record.state = ProjectState.REVIEW
        review = None
        try:
            from core.agents.reviewer import ReviewerAgent

            report = await ReviewerAgent(ctx)(timeline)
            review = report.model_dump()
        except Exception as exc:
            log.warning("review pass failed: %s", exc)

        _remember_run(ctx, run, model)
        _finish(run, "history", {
            "clips": sum(len(t.clips) for t in timeline.tracks),
            "review": review,
        })

        run.status = "done"
        record.state = ProjectState.COMPLETED
        record.persist()
        get_event_bus().emit("pipeline.completed", run_id=run.id)
        return run

    except (CancelledError, asyncio.CancelledError):
        # asyncio.CancelledError is a BaseException — without catching it here a
        # task.cancel() would kill the coroutine but leave run.status="running"
        # forever (a zombie the UI can never cancel).
        run.status = "failed"
        _stage(run, run.stage).status = "failed"
        _stage(run, run.stage).error = "cancelled"
        record.persist()
        get_event_bus().emit("pipeline.cancelled", run_id=run.id)
        return run
    except Exception as exc:  # pragma: no cover - defensive
        log.exception("pipeline failed")
        run.status = "failed"
        st = _stage(run, run.stage)
        st.status = "failed"
        st.error = str(exc)
        record.state = ProjectState.FAILED
        record.persist()
        get_event_bus().emit("pipeline.failed", run_id=run.id, error=str(exc))
        return run


async def fill_missing_footage(record: RunRecord) -> PipelineRun:
    """Fill ONLY the beats that got no clip in a finished run, then rebuild the
    timeline. Never touches beats that already have footage — a 10-min video
    whose clips stop at 6 min continues from 6 min, not from zero.
    """
    run = record.run
    if not run.beats or not run.progress or not run.progress.segments:
        raise ValueError("run has no beats/segments to fill")

    ctx = _context(run.id, "agent")
    video_agent = VideoSearchAgent(ctx)
    image_agent = ImageSearchAgent(ctx)
    threshold = ctx.settings.match_threshold
    assets: dict[str, dict] = dict(ctx.memory.working.get("assets") or {})
    used_assets: set[str] = set(assets.keys())
    # keep every real pick; drop placeholder slots for the beats we now fill
    picks: list[PickDecision] = [p for p in (run.picks or [])
                                 if not isinstance(p, GeneratePick)]

    # Mark running FIRST — the extension phase below takes minutes, and pollers
    # must never see a stale "done" while the fill is working.
    run.status = "running"
    record.persist()

    # ---- extend coverage: narration BEYOND the last beat gets new beats ---- #
    # (older runs truncated the beat list; the tail of the video had nothing)
    tr = run.transcript
    last_end = run.beats[-1].range.endSec
    if tr and tr.words and (tr.durationSec or 0) - last_end > 10:
        tail_words = [w for w in tr.words if w.startSec >= last_end - 0.01]
        if tail_words:
            sub = Transcript(text=" ".join(w.text for w in tail_words),
                             words=tail_words, language=tr.language,
                             durationSec=tr.durationSec)
            tail = split_into_beats(sub, max_beat_sec=ctx.settings.max_beat_sec)
            log.info("fill: extending coverage %.0fs → %.0fs with %d new beats",
                     last_end, tr.durationSec, len(tail))
            niche = ctx.memory.working.get("niche", "")
            tail = await generate_queries(ctx, tail,
                                          topic=ctx.memory.working.get("topic", ""),
                                          niche=niche)
            try:
                tail = await plan_visuals(ctx, tail, niche=niche)
            except Exception as exc:
                log.warning("fill: visual planning for tail failed: %s", exc)
            run.beats = list(run.beats) + tail
            run.progress.segments = list(run.progress.segments) + [
                SegmentProgress(beatId=b.id, text=b.text,
                                keyword=(b.queries.shown if b.queries else None))
                for b in tail
            ]

    missing = [(seg, beat) for seg, beat in zip(run.progress.segments, run.beats)
               if seg.pick is None]
    log.info("fill: %d/%d beats have no footage — filling", len(missing), len(run.beats))
    run.status = "running"
    run.stage = "pick"  # type: ignore[assignment]
    _begin(run, "pick")
    record.persist()

    try:
        for seg, beat in missing:
            if record.cancelled:
                raise CancelledError()
            agent = image_agent if _prefers_image(beat) else video_agent
            cands: list[Candidate] = []
            if agent.available:  # type: ignore[attr-defined]
                cands = await agent.search(beat)  # type: ignore[attr-defined]
                if not cands and agent is image_agent and video_agent.available:
                    agent = video_agent
                    cands = await video_agent.search(beat)
            seg.pooled = (seg.pooled or 0) + len(cands)
            seg.thumbs = [SegmentThumb(url=c.thumb, source=c.source)
                          for c in cands[:5] if c.thumb]

            placed = False
            ordered = sorted(cands, key=lambda c: c.score, reverse=True)
            for cand in [c for c in ordered if c.id not in used_assets][:4]:
                asset = await agent.materialize(cand.id, beat)  # type: ignore[attr-defined]
                if asset is None:
                    continue
                used_assets.add(cand.id)
                assets[cand.id] = asset.model_dump()
                register_asset(asset)
                cand.out_sec = asset.durationSec
                picks.append(RetrievePick(beatId=beat.id, candidate=cand.to_match()))
                seg.pick = _seg_pick(cand, "auto" if cand.score >= threshold else "review",
                                     asset.thumbPath)
                placed = True
                break
            if not placed:
                gen_asset = await _generate_image_asset(ctx, beat)
                if gen_asset is not None:
                    assets[gen_asset.id] = gen_asset.model_dump()
                    register_asset(gen_asset)
                    cand = MatchCandidate(clipId=gen_asset.id, score=0.75, textScore=0.75,
                                          visualScore=0.7, inSec=0.0,
                                          outSec=gen_asset.durationSec)
                    picks.append(RetrievePick(beatId=beat.id, candidate=cand))
                    seg.pick = _gen_seg_pick(gen_asset)
                    placed = True
            if not placed:
                picks.append(GeneratePick(
                    beatId=beat.id,
                    slot=GenerationSlot(id=new_id("slot_"), beatId=beat.id,
                                        prompt=(beat.queries.shown if beat.queries else beat.text),
                                        durationSec=beat.range.duration)))
            record.persist()  # live progress for the UI poller

        run.picks = picks
        ctx.memory.working.set("assets", assets)
        old_captions = run.timeline.captions if run.timeline else []
        timeline = TimelineAgent(ctx).build(
            run.beats, picks, assets,
            audio_path=ctx.memory.working.get("audioPath"),
        )
        if old_captions:
            timeline.captions = old_captions  # keep the existing subtitles
        run.timeline = timeline
        _finish(run, "pick", {"picked": len(picks)})
        _finish(run, "history", {"clips": sum(len(t.clips) for t in timeline.tracks)})
        run.status = "done"
        record.persist()
        get_event_bus().emit("pipeline.filled", run_id=run.id,
                             filled=len(missing))
        return run
    except (CancelledError, asyncio.CancelledError):
        run.status = "done"  # the original video is still intact
        record.persist()
        return run
    except Exception as exc:
        log.exception("fill failed")
        run.status = "done"  # never leave the run broken — old timeline stands
        _stage(run, "pick").error = f"fill failed: {exc}"
        record.persist()
        return run


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _context(project_id: str, model: str) -> AgentContext:
    return AgentContext(
        project_id=project_id,
        memory=get_memory(project_id),
        events=get_event_bus(),
    )


async def _synthesize_narration(
    ctx: AgentContext, run_id: str, text: str, voice: str, run: PipelineRun
) -> Optional[str]:
    """Speak the narration with the chosen voice (Kokoro TTS). Returns a repo-
    relative WAV path served at /files, or None when TTS is unavailable."""
    from core.agents.audio import AudioAgent
    from core.providers.storage import rel

    try:
        engine = AudioAgent(ctx).voice
        if not engine.available:
            ctx.emit("audio.tts_skipped", reason="tts server unreachable")
            return None
        out = get_settings().paths.cache / "voices" / f"narration_{run_id}.wav"
        result = await engine.synthesize_text(text, out, voice=voice)
        if result is None:
            return None
        path = rel(result)
        ctx.memory.working.set("voice", voice)
        ctx.memory.working.set("narrationPath", path)
        ctx.emit("audio.synthesized", voice=voice, path=path)
        return path
    except Exception as exc:  # never block a run on TTS
        log.warning("narration synthesis failed: %s", exc)
        return None


async def _acquire_transcript(script: Optional[str], audio_path: Optional[str]) -> Transcript:
    if audio_path:
        t = await transcribe(audio_path)
        if t.words:
            return t
        if script:  # ASR empty but we have a script → synthesise timings
            return transcript_from_script(script, duration=t.durationSec or None)
        return t
    if script:
        return transcript_from_script(script)
    raise ValueError("pipeline requires either a script or an audioPath")


def _prefers_image(beat: Beat) -> bool:
    if not beat.queries:
        return False
    hay = (beat.queries.shown or "").lower()
    return any(w in hay for w in ("portrait", "photo", "map", "chart", "diagram", "logo"))


def _seg_pick(cand: Optional[Candidate], status: str, thumb: Optional[str] = None):
    from core.schemas.pipeline import SegmentPick

    if cand is None:
        return SegmentPick(source="none", score=0.0, status="none")
    return SegmentPick(
        source=cand.source, score=round(cand.score, 3), status=status,  # type: ignore[arg-type]
        thumb=thumb or cand.thumb,
    )


async def _generate_image_asset(ctx: AgentContext, beat: Beat):
    """Ch12.16 — generate an image for a beat that had no good stock match."""
    from core.providers.image.generator import get_image_generator
    from core.providers.storage import rel

    gen = get_image_generator()
    if not gen.available:
        return None
    prompt = (beat.queries.shown if beat.queries else beat.text)
    style = ctx.memory.working.get("style", "cinematic")
    path = await gen.generate(f"{prompt}, {style}, high detail")
    if path is None:
        return None
    dur = beat.range.duration or 4.0
    return ClipAsset(
        id=new_id("clip_"), path=rel(path), durationSec=dur, width=1280, height=720,
        tags=[], thumbPath=rel(path), source="stock", license="AI-generated",
    )


def _gen_seg_pick(asset: ClipAsset) -> SegmentPick:
    return SegmentPick(source="generated", score=0.75, status="auto", thumb=asset.thumbPath)


def _guess_topic(text: str) -> str:
    first = (text or "").strip().split(".")[0]
    return first[:80]


def _merge_beats(beats: list[Beat], max_count: int) -> list[Beat]:
    """Greedily merge consecutive beats into scenes so the WHOLE narration fits
    in ``max_count`` scenes (longer scenes, never a truncated tail)."""
    if len(beats) <= max_count:
        return beats
    total = beats[-1].range.endSec - beats[0].range.startSec
    target = total / max_count
    merged: list[Beat] = []
    cur: Optional[Beat] = None
    for b in beats:
        if cur is None:
            cur = b.model_copy(deep=True)
            continue
        if (cur.range.endSec - cur.range.startSec) >= target:
            merged.append(cur)
            cur = b.model_copy(deep=True)
        else:
            cur.text = f"{cur.text} {b.text}".strip()
            cur.range.endSec = b.range.endSec
    if cur is not None:
        merged.append(cur)
    return merged


def _brand_theme(theme_name: str, niche: str) -> str:
    """Map a brand-profile theme (UI names) to a motion-designer theme."""
    m = {"crime": "dark", "history": "documentary", "modern": "modern",
         "minimalist": "minimal", "standard": "light"}
    key = theme_name.lower().replace(" theme", "").strip()
    if key in m:
        return m[key]
    n = (niche or "").lower()
    return "health" if ("health" in n or "fitness" in n) else "dark"


def _should_expand(script: str) -> bool:
    """A short input is an idea/prompt to expand; a long one is real narration.

    Ideas ("make a video about the F-22", "top 5 fighter jets") are a handful of
    words; even a brief narration script runs well past this. A single unbroken
    line with no sentence punctuation also reads as a prompt, not narration.
    """
    from core.utils.text import split_sentences, word_count

    wc = word_count(script)
    if wc <= 12:
        return True
    # a short, single-sentence line with no terminal punctuation = a prompt
    return wc < 20 and len(split_sentences(script)) <= 1 and not script.strip().endswith((".", "!", "?"))


async def _expand_prompt(ctx: AgentContext, prompt: str, effort: str, run: PipelineRun) -> str:
    """Director → Research → Script: idea → full narration (Ch5/Ch9/Ch6)."""
    from core.agents.director import DirectorAgent
    from core.agents.planner import PlannerAgent
    from core.agents.research import ResearchAgent
    from core.agents.script import ScriptAgent

    try:
        director = DirectorAgent(ctx)
        brief = await director.produce(prompt)
        await PlannerAgent(ctx)(brief)  # records the task DAG (Ch6)
        if run.progress is not None and not run.progress.niche:
            run.progress.niche = brief.video_type  # channel niche wins if set
        knowledge = await ResearchAgent(ctx)(brief.topic)
        draft = await ScriptAgent(ctx)(knowledge)
        text = draft.full_text.strip()
        if text:
            get_event_bus().emit("script.approved", run_id=run.id, topic=brief.topic)
            return text
    except Exception as exc:  # never fail the run on expansion trouble
        log.warning("prompt expansion failed, using raw prompt: %s", exc)
    return prompt


def _remember_run(ctx: AgentContext, run: PipelineRun, model: str) -> None:
    picked = sum(1 for p in (run.picks or []) if isinstance(p, RetrievePick))
    total = len(run.beats or [])
    ctx.memory.remember_experience(
        f"Run {run.id} ({model}): {picked}/{total} beats matched from stock for "
        f"topic '{ctx.memory.working.get('topic','')}'.",
        rating=(picked / total) if total else 0.5,
    )
