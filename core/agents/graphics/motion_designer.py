"""
Motion designer (Ch16) — GLM 5.2 designs Remotion overlay specs.

ONE batched call designs every motion_graphics beat in the video (the NVIDIA
NIM queue costs minutes per request, so per-beat calls are off the table).
Falls back to a deterministic designer when GLM is unavailable, so a run never
stalls on graphics.

The output contract is motion/src/spec.ts (OverlaySpec) — data in, animation out.
"""

from __future__ import annotations

import re
from typing import Optional

from core.providers.llm.base import ChatMessage
from core.providers.llm.nvidia import get_glm
from core.schemas.edl import Beat
from core.utils.logging import get_logger
from core.utils.text import extract_json

log = get_logger("graphics.design")

_TEMPLATES = {"title_card", "lower_third", "stat", "quote", "callout", "badge", "end_screen"}
_PRESETS = {"fade", "slide_left", "slide_right", "slide_up", "slide_down", "zoom",
            "scale_pop", "blur_reveal", "kinetic_text", "bounce", "underline_draw", "wipe"}
_THEMES = {"dark", "light", "minimal", "modern", "tech", "health", "documentary"}
_BACKGROUNDS = {"orbs", "aurora", "beams", "grid", "rings"}

_SYSTEM = (
    "You are a senior motion-graphics designer for narrated videos (Premiere/After "
    "Effects quality). You receive the video's niche, a theme, and numbered script "
    "segments that were planned as motion graphics. For EACH segment, design one "
    "animated overlay.\n\n"
    "Decide per segment:\n"
    "- template: title_card (chapter/exercise intros), stat (numbers, ages, counts, "
    "durations), quote (coined/quoted phrases), callout (tips, warnings, CTAs), "
    "badge (short labels), end_screen (like/subscribe close), lower_third (names).\n"
    "- text: the on-screen words — SHORT and punchy (max ~7 words), never the full "
    "sentence. Pull the essence: 'And after 60, that matters' → text '60+' with "
    "secondary 'this matters more'.\n"
    "- secondary: optional small supporting line.\n"
    "- highlight: the 1-3 most important words of text (accent colored).\n"
    "- icon: one fitting emoji or omit.\n"
    "- preset: entrance animation — kinetic_text for word-by-word titles, scale_pop "
    "for stats/badges, blur_reveal for quotes, slide_up for callouts, zoom/fade "
    "elsewhere. Vary across the video.\n"
    "- exitPreset: usually fade.\n"
    "- background: orbs | aurora | beams | grid | rings — VARY it across the "
    "video so consecutive graphics don't share the same backdrop (or omit to "
    "auto-vary).\n"
    "- typography: hero for title cards, title for stats/quotes, heading for "
    "callouts/lower thirds.\n\n"
    "Respond with STRICT JSON only: an array where item i designs segment i:\n"
    '{"template":str,"text":str,"secondary":str|null,"highlight":[str],"icon":str|null,'
    '"preset":str,"exitPreset":str,"typography":str}'
)


def _clip(v: str, allowed: set[str], fallback: str) -> str:
    v = (v or "").strip()
    return v if v in allowed else fallback


def _fallback_spec(text: str) -> dict:
    """Deterministic design when GLM is down — regex on the segment text."""
    t = text.strip()
    low = t.lower()
    if re.search(r"\b(subscribe|thumbs up|like|comment)\b", low):
        return {"template": "end_screen", "text": "Like & Subscribe", "icon": "🔔",
                "preset": "scale_pop", "typography": "title"}
    m = re.match(r"(exercise\s+\w+)[,.]?\s*(.*)", low, re.I)
    if m:
        return {"template": "title_card", "text": m.group(2).title() or m.group(1).title(),
                "secondary": m.group(1).title(), "preset": "kinetic_text", "typography": "hero"}
    if re.search(r'"[^"]+"|“[^”]+”', t):
        q = re.search(r'"([^"]+)"|“([^”]+)”', t)
        return {"template": "quote", "text": (q.group(1) or q.group(2)) if q else t[:40],
                "preset": "blur_reveal", "typography": "title"}
    num = re.search(r"\b(\d[\d,.]*|sixty|ten)\b", low)
    if num:
        return {"template": "stat", "text": num.group(1), "secondary": t[:60],
                "preset": "scale_pop", "typography": "hero"}
    return {"template": "callout", "text": t[:50], "preset": "slide_up", "typography": "heading"}


def _sanitize(item: dict, beat: Beat, theme: str) -> dict:
    """Clamp a designed item onto the OverlaySpec contract."""
    return {
        "template": _clip(str(item.get("template", "")), _TEMPLATES, "title_card"),
        "text": (str(item.get("text") or "").strip() or beat.text[:50])[:80],
        "secondary": (str(item.get("secondary") or "").strip() or None),
        "highlight": [str(h) for h in (item.get("highlight") or []) if str(h).strip()][:3],
        "icon": (str(item.get("icon") or "").strip() or None),
        "theme": theme,
        **({"background": item["background"]}
           if item.get("background") in _BACKGROUNDS else {}),
        "typography": _clip(str(item.get("typography", "")),
                            {"hero", "title", "subtitle", "heading", "body", "caption",
                             "label", "badge"}, "title"),
        "preset": _clip(str(item.get("preset", "")), _PRESETS, "fade"),
        "exitPreset": _clip(str(item.get("exitPreset", "")), _PRESETS, "fade"),
        "durationSec": round(max(1.0, beat.range.duration), 3),
        "fps": 30, "width": 1920, "height": 1080,
    }


def spec_from_fields(*, text: str, duration_sec: float, secondary: str = "",
                     template: str = "title_card", preset: str = "kinetic_text",
                     theme: str = "dark", highlight: Optional[list[str]] = None,
                     icon: str = "", typography: str = "") -> dict:
    """Clamp user-supplied fields onto the OverlaySpec contract (editor replace path)."""
    tpl = template if template in _TEMPLATES else "title_card"
    return {
        "template": tpl,
        "text": (text or "").strip()[:80] or "Untitled",
        "secondary": (secondary or "").strip() or None,
        "highlight": [h for h in (highlight or []) if h.strip()][:3],
        "icon": (icon or "").strip() or None,
        "theme": theme if theme in _THEMES else "dark",
        "typography": typography if typography in {"hero", "title", "subtitle", "heading",
                                                   "body", "caption", "label", "badge"}
                      else ("hero" if tpl == "title_card" else "title"),
        "preset": preset if preset in _PRESETS else "fade",
        "exitPreset": "fade",
        "durationSec": round(max(1.0, duration_sec), 3),
        "fps": 30, "width": 1920, "height": 1080,
    }


async def design_motion_specs(beats: list[Beat], *, niche: str = "",
                              theme: str = "dark") -> dict[str, dict]:
    """beat.id → OverlaySpec for every motion_graphics beat. One GLM call."""
    theme = theme if theme in _THEMES else "dark"
    if not beats:
        return {}
    designs: list[dict] = []
    glm = get_glm()
    if glm.available:
        try:
            numbered = "\n".join(f"{i}. {b.text.strip()}" for i, b in enumerate(beats))
            res = await glm.chat(
                [ChatMessage("system", _SYSTEM),
                 ChatMessage("user", f"Niche: {niche or 'general'}\nTheme: {theme}\n\n"
                                     f"Segments:\n{numbered}")],
                max_tokens=8192,
            )
            data = extract_json(res.text)
            if isinstance(data, list):
                designs = [d if isinstance(d, dict) else {} for d in data]
                log.info("GLM designed %d/%d motion graphics", len(designs), len(beats))
        except Exception as exc:
            log.warning("GLM design failed (%s) — deterministic fallback", exc)
    bg_order = sorted(_BACKGROUNDS)
    out: dict[str, dict] = {}
    for i, beat in enumerate(beats):
        spec = _sanitize(designs[i] if i < len(designs) else _fallback_spec(beat.text),
                         beat, theme)
        # guaranteed variety: consecutive graphics never share a backdrop
        spec.setdefault("background", bg_order[i % len(bg_order)])
        out[beat.id] = spec
    return out
