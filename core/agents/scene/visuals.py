"""
Visual Reasoner + Media Selector (11.6 / 11.7).

Decides, per scene, *what the audience should see*: the media type (video / image
/ motion graphics) via the 11.6 decision tree and the 11.7 content→visual
strategy, the concrete visual goal, and expanded search keywords. It specifies
what media is needed — it never fetches it (11.3).

Also exposes ``generate_queries`` — the beat-level query attachment the current
pipeline consumes.
"""

from __future__ import annotations

import re

from core.agents.base import AgentContext
from core.schemas.edl import Beat, BeatQueries
from core.schemas.production import MediaRequirement, Scene
from core.providers.llm.router import LLMUnavailable
from core.utils.logging import get_logger
from core.utils.text import extract_json

log = get_logger("scene.visuals")

_STOP = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is",
    "are", "was", "were", "it", "this", "that", "as", "at", "by", "be", "from",
    "they", "we", "you", "its", "their", "but", "not", "so", "into", "over",
}
_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'-]+")
_STAT_RE = re.compile(r"\b\d[\d,\.]*\s?(%|percent|million|billion|km|mph|mach|kg|tons?)\b", re.I)

# 11.6 media-type hints
_IMAGE_HINTS = ("portrait", "photo", "map", "chart", "diagram", "logo", "product", "person")
_MOTION_HINTS = ("statistic", "percent", "timeline", "ranking", "compare", "versus", "number", "chart")


def keywords(text: str, k: int = 5) -> list[str]:
    words = [w for w in _WORD_RE.findall(text) if w.lower() not in _STOP and len(w) > 2]
    seen: list[str] = []
    for w in words:
        if w not in seen:
            seen.append(w)
    caps = [w for w in seen if w[0].isupper()]
    rest = [w for w in seen if not w[0].isupper()]
    return (caps + rest)[:k]


def choose_media(text: str) -> MediaRequirement:
    """11.6/11.7 — pick the best media type for a scene deterministically."""
    t = text.lower()
    if _STAT_RE.search(text) or any(h in t for h in _MOTION_HINTS):
        return MediaRequirement(type="motion_graphics", keywords=keywords(text))
    if any(h in t for h in _IMAGE_HINTS):
        return MediaRequirement(type="image", keywords=keywords(text))
    return MediaRequirement(type="video", keywords=keywords(text))


class VisualReasoner:
    def __init__(self, llm=None) -> None:
        self.llm = llm

    async def reason(self, scenes: list[Scene], topic: str = "") -> list[Scene]:
        if self.llm is not None and self.llm.available and scenes:
            try:
                enriched = await self._llm_reason(scenes, topic)
                if enriched:
                    return enriched
            except LLMUnavailable:
                pass
            except Exception as exc:
                log.warning("visual reasoning failed, using heuristic: %s", exc)
        for s in scenes:
            s.media = choose_media(s.narration or s.title)
            s.visual_goal = s.visual_goal or (" ".join(s.media.keywords) or s.narration[:50])
        return scenes

    async def _llm_reason(self, scenes: list[Scene], topic: str) -> list[Scene]:
        numbered = "\n".join(f"{i}. {s.narration}" for i, s in enumerate(scenes))
        raw = await self.llm.chat(
            "You are a video scene planner. For each narration line, decide the best b-roll. STRICT JSON.",
            f"Topic: {topic}\nLines:\n{numbered}\n\nReturn a JSON array; item i = "
            '{"type":"video|image|motion_graphics","visual_goal":str,"keywords":[str]}.',
            effort="fast", max_tokens=1500,
        )
        data = extract_json(raw)
        if not isinstance(data, list):
            return []
        for i, s in enumerate(scenes):
            item = data[i] if i < len(data) and isinstance(data[i], dict) else {}
            mtype = str(item.get("type", "video"))
            kws = [str(x) for x in (item.get("keywords") or []) if str(x).strip()][:6]
            s.media = MediaRequirement(type=mtype if mtype in ("video", "image", "motion_graphics") else "video",
                                       keywords=kws or keywords(s.narration))
            s.visual_goal = str(item.get("visual_goal") or "").strip() or (" ".join(s.media.keywords))
        return scenes


# --------------------------------------------------------------------------- #
# beat-level query generation (pipeline compat)
# --------------------------------------------------------------------------- #
def _heuristic_queries(beat: Beat) -> BeatQueries:
    kws = keywords(beat.text)
    shown = " ".join(kws) if kws else beat.text[:60]
    return BeatQueries(said=beat.text.strip(), shown=shown, keywords=kws)


# --------------------------------------------------------------------------- #
# Visual planning (Ch11) — decide HOW each segment is shown, BEFORE any
# retrieval or generation. One batched LLM call sees the whole script so it can
# pace the mix (no long runs of static images, graphics where they land hardest).
# --------------------------------------------------------------------------- #
_VISUAL_PLAN_SYSTEM = (
    "You are an expert visual director for narrated videos. You receive the "
    "video's niche and the full script split into numbered segments. For EACH "
    "segment, decide the single best visual treatment:\n\n"
    "- stock_video: real people doing real actions, scenes with motion, "
    "direct-address hooks and questions to the viewer, demonstrations. "
    "The default for anything a camera would naturally film.\n"
    "- stock_image: one static, concrete visual concept — a close-up detail "
    "(sock lines pressed into ankles), a simple object or setting mention "
    "(sitting in a chair, no pills), a brief aside that doesn't need motion.\n"
    "- ai_image: a specific scene that stock libraries are unlikely to have "
    "(unusual combinations, stylized illustration, anatomical views).\n"
    "- motion_graphics: professionally animated graphics AND text animations "
    "(kinetic typography, typewriter reveals, animated title cards, stat "
    "counters) are available and rendered automatically. Use for: numbers, "
    "ages, durations and statistics ('after 60', 'in under two minutes'), "
    "coined or quoted terms ('second heart'), exercise/section title cards "
    "('Exercise one, ankle pumps'), counts and rep timers, key phrases worth "
    "emphasizing word-by-word, and channel calls-to-action (comment, like, "
    "subscribe).\n\n"
    "Rules:\n"
    "- Think about what the VIEWER should see, not what the narrator says.\n"
    "- Prioritize motion: never plan more than two consecutive static images.\n"
    "- Every exercise/section introduction gets a motion_graphics title card.\n"
    "- Numbers and named concepts land harder as motion_graphics.\n"
    "- Use ai_image sparingly — only when stock will genuinely fail.\n"
    "- Use the niche to imagine what stock footage exists.\n\n"
    'Respond with STRICT JSON only: an array where item i is '
    '{"visual":"stock_video|stock_image|ai_image|motion_graphics"}.'
)

_VISUAL_TYPES = {"stock_video", "stock_image", "ai_image", "motion_graphics"}


async def plan_visuals(ctx: AgentContext, beats: list[Beat], niche: str = "") -> list[Beat]:
    """Assign each beat a visual treatment (one batched LLM call, whole script)."""
    if not beats:
        return beats
    if ctx.llm.available:
        try:
            numbered = "\n".join(f"{i}. {b.text.strip()}" for i, b in enumerate(beats))
            raw = await ctx.llm.chat(
                _VISUAL_PLAN_SYSTEM,
                f"Video Niche:\n{niche or 'general'}\n\nScript segments:\n{numbered}",
                effort="fast", max_tokens=1200, temperature=0.2,
            )
            data = extract_json(raw)
            if isinstance(data, list):
                for i, beat in enumerate(beats):
                    item = data[i] if i < len(data) and isinstance(data[i], dict) else {}
                    v = str(item.get("visual") or "").strip()
                    beat.visual = v if v in _VISUAL_TYPES else "stock_video"
                return beats
        except LLMUnavailable:
            pass
        except Exception as exc:
            log.warning("visual planning failed, using heuristic: %s", exc)
    for beat in beats:  # fallback: old image/video heuristic
        beat.visual = "stock_image" if choose_media(beat.text).type == "image" else "stock_video"
    return beats


# Niche-aware keyword extraction — one keyword per script segment (verbatim
# system prompt). The single keyword seeds stock video, stock image and AI-image
# search downstream.
_KEYWORD_SYSTEM = (
    "You are an expert stock footage keyword extractor for an AI video editor.\n\n"
    "You are given:\n1. The video's niche.\n2. A single script segment.\n\n"
    "Your task is to extract ONLY ONE highly searchable stock footage keyword or short "
    "phrase that best represents what should appear on screen for that specific script segment.\n\n"
    "Rules:\n"
    "- Use the niche as context when choosing the keyword.\n"
    "- Focus on what can be visually shown, not what is being implied.\n"
    "- Prioritize people and actions over objects.\n"
    "- If the niche suggests a specific type of person, include it in the keyword.\n"
    "  Examples: Senior Health -> senior; Fitness -> athlete; Medical -> doctor or patient; "
    "Education -> teacher or student; Business -> business people.\n"
    "- Ignore narration, opinions, metaphors, and abstract concepts.\n"
    "- Return the most common stock footage search phrase.\n"
    "- Prefer 2-4 words.\n"
    "- Output ONLY the keyword.\n- No punctuation.\n- No explanation."
)


def _clean_keyword(raw: str) -> str:
    """Keep the first line, strip punctuation/quotes, cap at 6 words."""
    line = next((ln for ln in (raw or "").splitlines() if ln.strip()), "")
    line = re.sub(r"[^\w\s-]", " ", line)
    return " ".join(line.split()[:6]).strip()


async def generate_queries(
    ctx: AgentContext, beats: list[Beat], topic: str = "", niche: str = ""
) -> list[Beat]:
    """Extract one niche-aware stock keyword per segment, LLM one-by-one."""
    if not beats:
        return beats
    niche_ctx = (niche or topic or "general").strip()
    for beat in beats:
        kw = ""
        if ctx.llm.available:
            try:
                raw = await ctx.llm.chat(
                    _KEYWORD_SYSTEM,
                    f"Video Niche:\n{niche_ctx}\n\nScript Segment:\n{beat.text.strip()}",
                    effort="fast", max_tokens=30, temperature=0.3,
                )
                kw = _clean_keyword(raw)
            except LLMUnavailable:
                pass
            except Exception as exc:
                log.warning("keyword extraction failed, using heuristic: %s", exc)
        if kw:
            beat.queries = BeatQueries(said=beat.text.strip(), shown=kw, keywords=[kw])
        else:
            beat.queries = _heuristic_queries(beat)
    return beats
