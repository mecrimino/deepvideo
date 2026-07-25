"""
Agent chat (the editor's "Deep Video Agent") — conversational timeline EDITING.

With an LLM key the agent is a **tool-caller**: it sees the real clips (and any
clips the user @-mentioned), decides on concrete edits, and emits a strict JSON
*edit plan* the core applies to the timeline before handing it back to the editor
(where every change is undoable via applyTimeline). Supported ops mirror the
store's edit operations:

    delete · trim · move · split · mute · unmute · caption · replace

``replace`` actually fetches fresh footage (Pexels/Pixabay search + download +
trim, the same path the pipeline uses) so "find a better alternative for clip 3"
works end-to-end.

Without a key it falls back to a deterministic command mode that answers a few
concrete questions (duration, clip count, flagged clips) and can mute music.
"""

from __future__ import annotations

import re
from typing import Any, Optional

from core.providers.llm import get_llm
from core.providers.llm.router import LLMUnavailable
from core.providers.storage import get_asset
from core.schemas.edl import (
    AssetClipSource,
    Beat,
    BeatQueries,
    CaptionCue,
    Timeline,
    TimelineClip,
    TimeRange,
    Track,
)
from core.utils.ids import new_id
from core.utils.logging import get_logger

log = get_logger("chat")

_MIN_CLIP = 0.1
_MAX_REPLACES = 6  # ponytail: cap network fetches per message; raise if needed


# --------------------------------------------------------------------------- #
# timeline helpers
# --------------------------------------------------------------------------- #
def _video_track(t: Timeline) -> Optional[Track]:
    return next((tr for tr in t.tracks if tr.kind == "video"), None)


def _sorted_video_clips(t: Timeline) -> list[TimelineClip]:
    tr = _video_track(t)
    return sorted(tr.clips, key=lambda c: c.range.startSec) if tr else []


def _track_of(t: Timeline, clip_id: str) -> Optional[Track]:
    return next((tr for tr in t.tracks for c in tr.clips if c.id == clip_id), None)


def _clip_by_id(t: Timeline, clip_id: str) -> Optional[TimelineClip]:
    for tr in t.tracks:
        for c in tr.clips:
            if c.id == clip_id:
                return c
    return None


def _recompute_duration(t: Timeline) -> None:
    end = 0.0
    for tr in t.tracks:
        for c in tr.clips:
            end = max(end, c.range.endSec)
    for cue in t.captions:
        end = max(end, cue.range.endSec)
    t.durationSec = end


def _summary(t: Timeline) -> str:
    clips = sum(len(tr.clips) for tr in t.tracks)
    flagged = sum(1 for tr in t.tracks for c in tr.clips if c.review)
    tracks = ", ".join(f"{tr.name} ({len(tr.clips)})" for tr in t.tracks)
    return (
        f"Timeline {t.width}x{t.height} @ {t.fps}fps, {t.durationSec:.1f}s, "
        f"{clips} clips across [{tracks}], {len(t.captions)} captions, "
        f"{flagged} flagged for review."
    )


def _clip_listing(t: Timeline) -> str:
    lines = []
    for i, c in enumerate(_sorted_video_clips(t), start=1):
        label = (c.label or "untitled").strip().replace("\n", " ")[:60]
        flag = " ⚠flagged" if c.review else ""
        lines.append(
            f"  {i}: \"{label}\" [{c.range.startSec:.1f}–{c.range.endSec:.1f}]s{flag}"
        )
    return "\n".join(lines) or "  (no clips)"


# --------------------------------------------------------------------------- #
# ops — each mutates the timeline in place and returns an action label.
# clip ids are resolved from a 1-based index snapshot BEFORE anything changes,
# so ops can't drift as clips are added/removed mid-plan.
# --------------------------------------------------------------------------- #
def _op_delete(t: Timeline, clip: TimelineClip) -> str:
    tr = _track_of(t, clip.id)
    if tr is None:
        raise ValueError("clip not found")
    tr.clips = [c for c in tr.clips if c.id != clip.id]
    return f"deleted \"{(clip.label or clip.id)[:32]}\""


def _op_trim(t: Timeline, clip: TimelineClip, start: Optional[float], end: Optional[float]) -> str:
    tr = _track_of(t, clip.id)
    if tr is None:
        raise ValueError("clip not found")
    ordered = sorted(tr.clips, key=lambda c: c.range.startSec)
    idx = ordered.index(clip)
    prev = ordered[idx - 1] if idx > 0 else None
    nxt = ordered[idx + 1] if idx + 1 < len(ordered) else None
    src = clip.source if isinstance(clip.source, AssetClipSource) else None

    if start is not None:
        lo = prev.range.endSec if prev else 0.0
        if src is not None:
            lo = max(lo, clip.range.startSec - src.inSec)  # can't reveal before frame 0
        hi = clip.range.endSec - _MIN_CLIP
        v = max(lo, min(start, hi))
        if src is not None:
            src.inSec += v - clip.range.startSec
        clip.range.startSec = v
    if end is not None:
        hi = nxt.range.startSec if nxt else float("inf")
        if src is not None:
            asset = get_asset(src.assetId)
            adur = float(asset["durationSec"]) if asset and asset.get("durationSec") else None
            if adur:
                hi = min(hi, clip.range.endSec + (adur - src.outSec))
        lo = clip.range.startSec + _MIN_CLIP
        v = max(lo, min(end, hi))
        if src is not None:
            src.outSec += v - clip.range.endSec
        clip.range.endSec = v
    return f"trimmed to [{clip.range.startSec:.1f}–{clip.range.endSec:.1f}]s"


def _op_move(t: Timeline, clip: TimelineClip, start: float) -> str:
    tr = _track_of(t, clip.id)
    if tr is None:
        raise ValueError("clip not found")
    dur = clip.range.duration
    others = sorted((c for c in tr.clips if c.id != clip.id), key=lambda c: c.range.startSec)
    s = max(0.0, start)
    for o in others:  # push out of any overlap, front to back
        if s < o.range.endSec and s + dur > o.range.startSec:
            s = o.range.endSec
    clip.range = TimeRange(startSec=s, endSec=s + dur)
    tr.clips.sort(key=lambda c: c.range.startSec)
    return f"moved to {s:.1f}s"


def _op_split(t: Timeline, clip: TimelineClip, at: float) -> str:
    tr = _track_of(t, clip.id)
    if tr is None:
        raise ValueError("clip not found")
    if not (clip.range.startSec + _MIN_CLIP < at < clip.range.endSec - _MIN_CLIP):
        raise ValueError("split point is outside the clip")
    second = clip.model_copy(deep=True)
    second.id = new_id("clip_")
    second.range = TimeRange(startSec=at, endSec=clip.range.endSec)
    if isinstance(clip.source, AssetClipSource) and isinstance(second.source, AssetClipSource):
        second.source.inSec = clip.source.inSec + (at - clip.range.startSec)
        clip.source.outSec -= clip.range.endSec - at
    clip.range.endSec = at
    tr.clips.append(second)
    tr.clips.sort(key=lambda c: c.range.startSec)
    return f"split at {at:.1f}s"


def _find_audio_track(t: Timeline, sel: str) -> Optional[Track]:
    sel = (sel or "").lower()
    audio = [tr for tr in t.tracks if tr.kind == "audio"]
    if not audio:
        return None
    for tr in audio:
        if sel and sel in tr.name.lower():
            return tr
    return audio[0]


def _op_mute(t: Timeline, sel: str, muted: bool) -> str:
    tr = _find_audio_track(t, sel)
    if tr is None:
        raise ValueError("no audio track")
    tr.muted = muted
    return f"{'muted' if muted else 'unmuted'} {tr.name}"


def _op_caption(t: Timeline, text: str, start: float, end: Optional[float]) -> str:
    text = (text or "").strip()
    if not text:
        raise ValueError("caption text is empty")
    e = end if end is not None else start + 3.0
    t.captions = sorted(
        [*t.captions, CaptionCue(id=new_id("cue_"), text=text, range=TimeRange(startSec=start, endSec=max(e, start + 0.5)))],
        key=lambda c: c.range.startSec,
    )
    return f"added caption \"{text[:32]}\""


async def _op_replace(t: Timeline, clip: TimelineClip, query: str, project_id: str) -> str:
    """Fetch fresh footage for a clip (Pexels/Pixabay search → download → trim)."""
    from core.agents.base import AgentContext
    from core.agents.video import VideoSearchAgent
    from core.memory import get_memory
    from core.orchestrator.events import get_event_bus
    from core.providers.storage import register_asset

    q = (query or clip.label or "").strip()
    if not q:
        raise ValueError("no search query for replace")
    ctx = AgentContext(project_id=project_id, memory=get_memory(project_id), events=get_event_bus())
    agent = VideoSearchAgent(ctx)
    if not agent.available:
        raise ValueError("stock search needs a Pexels/Pixabay key")
    dur = clip.range.duration or 4.0
    beat = Beat(
        id=new_id("beat_"),
        text=q,
        range=TimeRange(startSec=0.0, endSec=dur),
        queries=BeatQueries(said=q, shown=q, keywords=q.split()[:6]),
    )
    cands = await agent.search(beat)
    if not cands:
        raise ValueError(f"no stock footage found for \"{q}\"")
    asset = await agent.materialize(cands[0].id, beat)
    if asset is None:
        raise ValueError("could not download the replacement clip")
    register_asset(asset)
    in_sec = 0.0
    out_sec = min(asset.durationSec, dur) if asset.durationSec > 0 else dur
    clip.source = AssetClipSource(kind="asset", assetId=asset.id, inSec=in_sec, outSec=out_sec)
    clip.label = " ".join(asset.tags[:6]) or q
    clip.review = None
    return f"replaced with \"{q}\" footage"


async def _op_motion(t: Timeline, clip: TimelineClip, op: dict) -> str:
    """Replace a clip with a rendered motion graphic / text animation (Remotion)."""
    from core.agents.graphics.motion_designer import spec_from_fields
    from core.agents.graphics.motion_renderer import render_motion, renderer_available
    from core.providers.storage import register_asset

    if not renderer_available():
        raise ValueError("motion renderer unavailable")
    text = str(op.get("text") or clip.label or "").strip()
    if not text:
        raise ValueError("no text for the motion graphic")
    spec = spec_from_fields(
        text=text, secondary=str(op.get("secondary") or ""),
        template=str(op.get("template") or "title_card"),
        preset=str(op.get("preset") or "kinetic_text"),
        theme=str(op.get("theme") or "dark"),
        highlight=[str(h) for h in (op.get("highlight") or [])],
        duration_sec=clip.range.duration or 3.0,
    )
    asset = await render_motion(spec)
    if asset is None:
        raise ValueError("motion render failed")
    register_asset(asset)
    clip.source = AssetClipSource(kind="asset", assetId=asset.id, inSec=0.0,
                                  outSec=asset.durationSec)
    clip.label = f"Motion: {spec['text']}"
    clip.review = None
    return f"animated \"{spec['text']}\" ({spec['template']})"


# --------------------------------------------------------------------------- #
# edit-plan application
# --------------------------------------------------------------------------- #
async def _apply_plan(t: Timeline, ops: list, project_id: str) -> tuple[list[str], list[str]]:
    """Apply the LLM's ops. Returns (action labels, skip notes)."""
    index = {i: c.id for i, c in enumerate(_sorted_video_clips(t), start=1)}
    actions: list[str] = []
    notes: list[str] = []
    replaces = 0

    def clip_for(op: dict) -> TimelineClip:
        n = op.get("clip")
        if not isinstance(n, int) or n not in index:
            raise ValueError(f"clip {n} doesn't exist")
        c = _clip_by_id(t, index[n])
        if c is None:
            raise ValueError(f"clip {n} is gone")
        return c

    for op in ops if isinstance(ops, list) else []:
        if not isinstance(op, dict):
            continue
        kind = str(op.get("op", "")).lower()
        try:
            if kind == "delete":
                actions.append(_op_delete(t, clip_for(op)))
            elif kind == "trim":
                actions.append(_op_trim(t, clip_for(op), op.get("startSec"), op.get("endSec")))
            elif kind == "move":
                actions.append(_op_move(t, clip_for(op), float(op["startSec"])))
            elif kind == "split":
                actions.append(_op_split(t, clip_for(op), float(op["atSec"])))
            elif kind in ("mute", "unmute"):
                actions.append(_op_mute(t, str(op.get("track", "")), kind == "mute"))
            elif kind == "caption":
                actions.append(_op_caption(t, op.get("text", ""), float(op.get("startSec", 0.0)), op.get("endSec")))
            elif kind == "replace":
                if replaces >= _MAX_REPLACES:
                    notes.append(f"skipped extra replace (max {_MAX_REPLACES} per message)")
                    continue
                replaces += 1
                actions.append(await _op_replace(t, clip_for(op), str(op.get("query", "")), project_id))
            elif kind == "motion":
                actions.append(await _op_motion(t, clip_for(op), op))
            else:
                notes.append(f"unknown op '{kind}'")
        except (ValueError, KeyError, TypeError) as exc:
            notes.append(f"{kind}: {exc}")
    _recompute_duration(t)
    return actions, notes


_SYSTEM = """You are Deep Video Agent, an expert video editor embedded in a timeline editor.
You edit the user's timeline by returning a STRICT JSON object — no prose, no code fences:

  {"reply": "<one short sentence to the user>", "ops": [ <edit ops> ]}

Clip indices are the 1-based numbers shown in the clip list (sorted by start time).
Only reference clips that exist. All times are SECONDS on the project clock.
If the user only asks a question, return an empty "ops" list and answer in "reply".

Available ops (include only the fields you need):
  {"op":"delete","clip":N}
  {"op":"trim","clip":N,"startSec":S,"endSec":E}      # set either/both edges
  {"op":"move","clip":N,"startSec":S}                  # keeps the clip's length
  {"op":"split","clip":N,"atSec":S}
  {"op":"replace","clip":N,"query":"aerial city at night"}  # fetch fresh stock footage
  {"op":"motion","clip":N,"text":"Exercise 1: Ankle Pumps","template":"title_card"}
      # replace the clip with an ANIMATED motion graphic / text animation.
      # templates: title_card stat quote callout badge end_screen lower_third
      # optional: "secondary" small line, "preset" (kinetic_text scale_pop
      # blur_reveal slide_up fade zoom bounce), "theme" (dark health tech
      # documentary modern minimal light), "highlight" [important words]
  {"op":"caption","text":"...","startSec":S,"endSec":E}
  {"op":"mute","track":"music"}                        # or "unmute"; track matched by name

Prefer the smallest set of ops that satisfies the request. Never invent clips."""


def _deterministic(message: str, t: Timeline) -> tuple[str, list[str], Optional[Timeline]]:
    m = message.lower().strip()
    if re.search(r"\b(how long|duration|length)\b", m):
        return (f"The video is {t.durationSec:.1f} seconds long.", ["report:duration"], None)
    if re.search(r"\bhow many (clips|shots)\b", m):
        n = sum(len(tr.clips) for tr in t.tracks)
        return (f"There are {n} clips on the timeline.", ["report:clip-count"], None)
    if re.search(r"\b(flag|review|problem)", m):
        flagged = [c for tr in t.tracks for c in tr.clips if c.review]
        if not flagged:
            return ("Nothing is flagged for review — every beat has a confident match.", [], None)
        labels = ", ".join(c.label or c.id for c in flagged[:6])
        return (f"{len(flagged)} clips need review: {labels}.", ["report:flagged"], None)
    if re.search(r"\b(mute|silence)\b.*\bmusic\b", m):
        try:
            action = _op_mute(t, "music", True)
            return (f"{action.capitalize()}.", ["mute:music"], t)
        except ValueError:
            return ("There's no music track to mute.", [], None)
    return (
        "With an LLM key I can edit the timeline directly — trim, move, split, delete, "
        "swap footage or add captions. Right now I can report on the cut (duration, clip "
        "count, flagged clips) or mute the music. " + _summary(t),
        ["report:summary"],
        None,
    )


async def agent_chat(
    message: str,
    timeline: Timeline,
    *,
    effort: str = "fast",
    mentions: Optional[list] = None,
) -> dict:
    llm = get_llm()
    if not llm.available:
        reply, actions, new_tl = _deterministic(message, timeline)
        return {
            "reply": reply,
            "actions": actions,
            "timeline": new_tl.model_dump() if new_tl else None,
            "backend": "deterministic",
        }

    mention_line = ""
    if mentions:
        refs = ", ".join(f"clip #{m['index']}" for m in mentions if isinstance(m, dict) and m.get("index"))
        if refs:
            mention_line = f"\nThe user is specifically referring to: {refs}."

    user = (
        f"{message}{mention_line}\n\n"
        f"[Timeline] {_summary(timeline)}\n"
        f"[Clips on the video track]\n{_clip_listing(timeline)}"
    )
    try:
        plan = await llm.json(_SYSTEM, user, effort="smart" if effort == "smart" else "fast")
    except LLMUnavailable:
        reply, actions, new_tl = _deterministic(message, timeline)
        return {"reply": reply, "actions": actions, "timeline": None, "backend": "deterministic"}

    if not isinstance(plan, dict):
        # LLM didn't return a usable plan — treat its text as a plain answer.
        return {"reply": _plain_reply(plan) or "Sorry, I couldn't act on that.", "actions": [], "timeline": None, "backend": "llm"}

    reply = str(plan.get("reply") or "Done.").strip()
    ops = plan.get("ops") or []
    if not ops:
        return {"reply": reply, "actions": [], "timeline": None, "backend": "llm"}

    edited = timeline.model_copy(deep=True)
    actions, notes = await _apply_plan(edited, ops, timeline.id)
    if notes:
        reply = (reply + " (" + "; ".join(notes) + ")").strip()
    changed = len(actions) > 0
    return {
        "reply": reply,
        "actions": actions,
        "timeline": edited.model_dump() if changed else None,
        "backend": "llm",
    }


def _plain_reply(plan: Any) -> str:
    if isinstance(plan, str):
        return plan.strip()
    return ""
