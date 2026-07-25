"""
Multi-Provider Search (12.6) — never depend on a single image source.

Queries Pexels and Pixabay (tools.md stock-image providers) in parallel across all
expanded queries and returns a de-duplicated candidate pool (12.7). If one
provider has nothing, another may. Availability is False with no keys (caller
then falls back to AI generation / a slot).
"""

from __future__ import annotations

from core.agents.image.models import ImageCandidate, SceneRequest
from core.providers.search.stock import get_stock
from core.utils.ids import new_id
from core.utils.logging import get_logger

log = get_logger("image.providers")


class ImageProviders:
    def __init__(self) -> None:
        self._stock = get_stock()

    @property
    def available(self) -> bool:
        return self._stock.available

    async def search(self, request: SceneRequest, queries: list[str], *, per_query: int = 10) -> list[ImageCandidate]:
        # note: each query costs 1 Pexels + 1 Pixabay request — callers keep
        # the query list short; we stop as soon as there's enough to rank.
        pooled: dict[str, ImageCandidate] = {}
        for query in queries:
            if len(pooled) >= 10:
                break  # plenty to rank — don't spend more API quota
            try:
                hits = await self._stock.search(query, kind="image", per_source=per_query)
            except Exception as exc:
                log.warning("image search failed for %r: %s", query, exc)
                continue
            for hit in hits:
                if hit.mediaUrl in pooled:
                    continue
                pooled[hit.mediaUrl] = ImageCandidate(
                    asset_id=new_id("img_"), provider=hit.source, query=query,
                    url=hit.mediaUrl, thumb_url=hit.thumbUrl, keywords=request.keywords,
                    width=hit.width, height=hit.height, tags=hit.tags,
                )
        log.info("pooled %d candidate images from %d queries", len(pooled), len(queries))
        return list(pooled.values())
