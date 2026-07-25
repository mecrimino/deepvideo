"""
Director planning conversation (Ch5) — the *pre-production* chat, run in stages.

Before any footage exists the Director walks the user through planning, one step
at a time — never jumping straight to a finished script:

  STAGE 1  TOPIC    a broad theme ("a space documentary") → the Director proposes
                    3-5 specific video topics and asks which to make (or picks the
                    strongest itself if the user has no preference).
  STAGE 2  LENGTH   with a topic chosen, ask how long (minutes / character target).
  STAGE 3  OUTLINE  analyse the topic and produce the best outline for that length,
                    then ask if it's good — regenerate on request.
  STAGE 4  SCRIPT   only once the outline is approved, write the FULL narration
                    script (section-by-section, so long 20-min+ scripts hold up).

`plan_conversation()` returns { reply, plan, ready }. `plan.stage` says where the
conversation is; `plan.script` is filled only at STAGE 4, which is what gates the
"Generate video" button in the UI.
"""

from __future__ import annotations

from typing import Any, Optional

from core.providers.llm import get_llm
from core.utils.logging import get_logger
from core.utils.text import extract_json

log = get_logger("director.chat")

# Rough English narration rate — used to convert minutes ⇄ characters when the
# user gives one but not the other (~150 wpm ≈ 750 characters per minute).
_CHARS_PER_MIN = 750
_CHARS_PER_SEC = _CHARS_PER_MIN / 60.0

_SYSTEM = """You are the Director of Deep Video, an AI video studio. In this chat \
you plan ONE video WITH the user, step by step, BEFORE any production. Be warm, \
concise and concrete — a creative partner, not a form. Move through the stages IN \
ORDER; never skip ahead or do a later stage's work early.

STAGE 1 — TOPIC. The user's opening line is usually a BROAD theme (e.g. "a space \
documentary"). Do NOT plan or outline yet. Propose 3-5 specific, catchy video \
topics under that theme — real titles a viewer would click — and ask which one \
they want. For "space" that might be: "What Happened Before the Big Bang?", "What \
If Earth Fell Into a Black Hole?", "The Most Dangerous Planets in the Universe". \
If the user says "you choose" / has no preference, pick the strongest yourself and \
state it. If their opening line is ALREADY a specific topic, skip to STAGE 2.

STAGE 2 — LENGTH. Once a specific topic is set, ask how long the video should be \
(in minutes, or a character/word target). Nothing else this turn.

STAGE 3 — OUTLINE. Once the length is known, analyse the topic and produce the \
BEST outline for a video of that length — an ordered list of sections (more \
sections for longer videos; a 20+ minute doc needs 10-16). Present it and ask if \
it's good or what to change. If they want changes, regenerate the outline. Do NOT \
write the script yet.

STAGE 4 — SCRIPT. ONLY when the user approves the outline, set "stage":"script". \
Do NOT write the script yourself — the studio writes it from the approved outline. \
Just say you're writing it now.

Respond with STRICT JSON only — no prose, no code fences — shaped exactly:
{"reply":"<your chat message>","plan":{"stage":"topic|length|outline|script",\
"topicOptions":["",""],"title":"<chosen topic>","lengthSec":0,"targetChars":0,\
"style":"","hook":"","outline":["",""]},"ready":false}

Rules:
- "stage" reflects where the conversation IS right now.
- "topicOptions" is filled ONLY in stage "topic" (otherwise []).
- "title" is the chosen specific topic (empty until one is picked).
- "lengthSec" and "targetChars" are 0 until the user gives a length.
- "outline" is filled from stage "outline" onward.
- Never set "stage":"script" until the user has explicitly approved the outline.
- Keep "reply" to 2-4 sentences; put the detail in the structured plan."""

_SCRIPT_SYSTEM = """You are a documentary narration writer. Write flowing, \
speakable narration for one section of a video — the exact words a voice-over \
artist will read. No headings, no timestamps, no camera/stage directions, no \
markdown, no bullet points, no "Section N" labels. Just the spoken sentences. \
Continue naturally from earlier sections and do not repeat them."""


def _format_transcript(messages: list[dict]) -> str:
    lines: list[str] = []
    for m in messages:
        role = (m.get("role") or "user").strip().lower()
        who = "User" if role == "user" else "Director"
        content = (m.get("content") or "").strip()
        if content:
            lines.append(f"{who}: {content}")
    lines.append("Director:")  # cue the next reply
    return "\n".join(lines)


def _as_int(value: Any) -> Optional[int]:
    try:
        n = int(float(value))
        return n or None
    except (TypeError, ValueError):
        return None


def _clean_plan(plan: Any) -> Optional[dict]:
    if not isinstance(plan, dict):
        return None

    def _str_list(key: str, limit: int) -> list[str]:
        raw = plan.get(key)
        if not isinstance(raw, list):
            return []
        return [str(x).strip() for x in raw if str(x).strip()][:limit]

    stage = str(plan.get("stage") or "").strip().lower()
    if stage not in ("topic", "length", "outline", "script"):
        stage = "topic"

    length_sec = _as_int(plan.get("lengthSec"))
    target_chars = _as_int(plan.get("targetChars"))
    # fill in whichever length figure the user gave from the other
    if length_sec and not target_chars:
        target_chars = int(length_sec * _CHARS_PER_SEC)
    elif target_chars and not length_sec:
        length_sec = int(target_chars / _CHARS_PER_SEC)

    return {
        "stage": stage,
        "topicOptions": _str_list("topicOptions", 6),
        "title": str(plan.get("title") or "").strip(),
        "angle": str(plan.get("angle") or "").strip(),
        "lengthSec": length_sec,
        "targetChars": target_chars,
        "style": str(plan.get("style") or "").strip(),
        "hook": str(plan.get("hook") or "").strip(),
        "outline": _str_list("outline", 20),
        "script": str(plan.get("script") or "").strip(),
    }


async def _write_full_script(plan: dict, *, model: Optional[str]) -> str:
    """STAGE 4 — write the full narration section-by-section from the outline.

    Long documentaries (20+ min, ~18k chars) blow past a single free-model output
    limit, so each outline section is written in its own call and stitched
    together. This keeps the full length intact.
    """
    llm = get_llm()
    outline = plan.get("outline") or []
    if not outline:
        return ""

    target_chars = plan.get("targetChars") or int(
        (plan.get("lengthSec") or 60) * _CHARS_PER_SEC
    )
    per_section = max(300, int(target_chars / len(outline)))
    title = plan.get("title") or "the video"
    outline_txt = "\n".join(f"{i + 1}. {b}" for i, b in enumerate(outline))

    parts: list[str] = []
    for i, section in enumerate(outline):
        user = (
            f"Video topic: {title}\n"
            f"Full outline:\n{outline_txt}\n\n"
            f"Write ONLY the narration for section {i + 1} (\"{section}\"). "
            f"Aim for about {per_section} characters. Documentary tone, engaging "
            f"and factual. Continue naturally from the previous sections."
        )
        try:
            text = await llm.chat(
                _SCRIPT_SYSTEM,
                user,
                effort="smart",
                temperature=0.6,
                max_tokens=min(2200, per_section // 2 + 500),
            )
        except Exception as exc:  # keep whatever sections we already have
            log.warning("script section %d failed: %s", i + 1, exc)
            continue
        cleaned = text.strip()
        if cleaned:
            parts.append(cleaned)

    return "\n\n".join(parts)


async def plan_conversation(messages: list[dict], *, model: Optional[str] = None) -> dict:
    """Run one Director planning turn over the chat transcript."""
    llm = get_llm()
    if not llm.available:
        return {
            "reply": (
                "I can't plan out loud right now — no language model is configured. "
                "Add an OpenRouter or Groq key in `.env` and I'll talk the video "
                "through with you."
            ),
            "plan": None,
            "ready": False,
        }

    transcript = _format_transcript(messages)
    try:
        text = await llm.chat(
            _SYSTEM, transcript, effort="smart", temperature=0.6, max_tokens=2000
        )
    except Exception as exc:  # provider failure — surface gracefully
        log.warning("director plan chat failed: %s", exc)
        return {
            "reply": "I hit a snag reaching the model. Try again in a moment.",
            "plan": None,
            "ready": False,
        }

    data = extract_json(text)
    if not (isinstance(data, dict) and ("reply" in data or "plan" in data)):
        # JSON parse failed — treat the whole reply as the chat message.
        return {"reply": text.strip(), "plan": None, "ready": False}

    reply = str(data.get("reply") or "").strip()
    plan = _clean_plan(data.get("plan"))

    # STAGE 4 — the user approved the outline: write the full script now.
    if plan and plan["stage"] == "script" and plan["outline"] and not plan["script"]:
        plan["script"] = await _write_full_script(plan, model=model)
        if plan["script"]:
            chars = len(plan["script"])
            reply = reply or f"Script's ready — {chars:,} characters. Review it below, then hit Generate."
        else:
            plan["stage"] = "outline"
            reply = "I couldn't finish the script just now — want me to try again?"

    return {
        "reply": reply or "Here's where we are — what would you like to change?",
        "plan": plan,
        "ready": False,  # producing the video is an explicit action in the UI
    }
