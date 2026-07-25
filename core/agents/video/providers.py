"""
Multi-Provider Search (13.6) — merge results from several video providers.

Queries Pexels and Pixabay (tools.md stock-video providers) across all expanded
queries and returns a de-duplicated candidate pool. Availability is False with no
keys (caller then falls back — 13.17).
"""

from __future__ import annotations

from core.agents.video.models import VideoCandidate, VideoRequest
from core.providers.search.stock import get_stock
from core.utils.logging import get_logger

log = get_logger("video.providers")


class VideoProviders:
    def __init__(self) -> None:
        self._stock = get_stock()

    @property
    def available(self) -> bool:
        return self._stock.available

    async def search(self, request: VideoRequest, queries: list[str], *, per_query: int = 6) -> list[VideoCandidate]:
        pooled: dict[str, VideoCandidate] = {}
        for query in queries:
            if len(pooled) >= 10:
                break  # plenty to rank — don't spend more API quota
            try:
                hits = await self._stock.search(query, kind="video", per_source=per_query)
            except Exception as exc:
                log.warning("video search failed for %r: %s", query, exc)
                continue
            for hit in hits:
                if not hit.mediaUrl or hit.mediaUrl in pooled:
                    continue
                pooled[hit.mediaUrl] = VideoCandidate(
                    provider=hit.source, query=query, url=hit.mediaUrl, thumb_url=hit.thumbUrl,
                    width=hit.width, height=hit.height, durationSec=hit.durationSec or 0.0,
                    tags=hit.tags,
                )
        log.info("pooled %d candidate videos from %d queries", len(pooled), len(queries))
        return list(pooled.values())
