"""
Query Generation (12.5) — expand keywords into many targeted queries.

    F-22 Raptor → F-22 Raptor takeoff, F-22 flying, F-22 side profile,
                  F-22 cockpit, F-22 afterburner, F-22 sunset, US Air Force F-22

Multiple targeted queries increase retrieval quality. LLM when available; else a
template appends cinematic view/angle modifiers to the scene keywords.
"""

from __future__ import annotations

from core.agents.image.models import SceneRequest
from core.providers.llm.router import LLMUnavailable
from core.utils.logging import get_logger
from core.utils.text import extract_json

log = get_logger("image.queries")

_MODIFIERS = ["", "close up", "wide shot", "side profile", "sunset", "cinematic", "high detail"]


class QueryGenerator:
    def __init__(self, llm=None) -> None:
        self.llm = llm

    async def generate(self, request: SceneRequest, *, limit: int = 7) -> list[str]:
        base = request.keywords or ([request.visual_goal] if request.visual_goal else [])
        base = [b for b in base if b.strip()]
        if not base:
            return []
        if self.llm is not None and self.llm.available:
            try:
                data = await self.llm.json(
                    "You expand a visual concept into targeted image-search queries. STRICT JSON array of strings.",
                    f'Visual goal: "{request.visual_goal}" keywords: {base} style: {request.style}. '
                    f"Give {limit} specific image search queries.",
                    effort="fast",
                )
                if isinstance(data, list) and data:
                    return [str(q).strip() for q in data if str(q).strip()][:limit]
            except LLMUnavailable:
                pass
            except Exception as exc:
                log.warning("query expansion failed: %s", exc)
        # template fallback — main keyword × view modifiers
        head = base[0]
        out = [f"{head} {m}".strip() for m in _MODIFIERS]
        out += base[1:]
        seen: list[str] = []
        for q in out:
            if q and q not in seen:
                seen.append(q)
        return seen[:limit]
