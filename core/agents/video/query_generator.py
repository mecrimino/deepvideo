"""
Query Expansion (13.5) — one scene concept → many targeted video queries.

    Rocket Launch → Falcon 9 launch, rocket ignition, launch pad, rocket takeoff,
                    launch smoke, aerial rocket footage

Multiple queries improve coverage across providers. LLM when available; else a
template appends motion/shot modifiers suited to b-roll.
"""

from __future__ import annotations

from core.agents.video.models import VideoRequest
from core.providers.llm.router import LLMUnavailable
from core.utils.logging import get_logger

log = get_logger("video.queries")

_MODIFIERS = ["", "footage", "cinematic", "aerial", "slow motion", "close up", "wide shot"]


class QueryGenerator:
    def __init__(self, llm=None) -> None:
        self.llm = llm

    async def generate(self, request: VideoRequest, *, limit: int = 8) -> list[str]:
        base = [k for k in (request.keywords or [request.visual_goal]) if k and k.strip()]
        if not base:
            return []
        if self.llm is not None and self.llm.available:
            try:
                data = await self.llm.json(
                    "You expand a b-roll concept into targeted stock-video queries. STRICT JSON array of strings.",
                    f'Visual goal: "{request.visual_goal}" keywords: {base} style: {request.style}. '
                    f"Give {limit} specific video search queries.",
                    effort="fast",
                )
                if isinstance(data, list) and data:
                    return [str(q).strip() for q in data if str(q).strip()][:limit]
            except LLMUnavailable:
                pass
            except Exception as exc:
                log.warning("video query expansion failed: %s", exc)
        head = base[0]
        out = [f"{head} {m}".strip() for m in _MODIFIERS] + base[1:]
        seen: list[str] = []
        for q in out:
            if q and q not in seen:
                seen.append(q)
        return seen[:limit]
