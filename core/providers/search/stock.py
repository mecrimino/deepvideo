"""
Stock media search — Pexels + Pixabay (Ch12/Ch13 multi-provider search).

Both providers are queried, normalised to a single :class:`StockResult` shape
(identical to the frontend ``StockResult`` type), de-duplicated and returned.
Results are cached by the API manager, so repeated queries are free (Ch20.6).
When no key is configured the provider simply yields nothing and the caller
falls back to AI generation or a placeholder slot (Ch12.16).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional

from core.config import get_settings
from core.providers.api_manager import KeyPool, get_api_manager
from core.utils.logging import get_logger

log = get_logger("stock")

MediaKind = Literal["video", "image"]


@dataclass
class StockResult:
    id: str
    source: str  # "pexels" | "pixabay"
    kind: MediaKind
    thumbUrl: str
    mediaUrl: str  # video file URL or full image URL
    width: int = 0
    height: int = 0
    durationSec: Optional[float] = None
    tags: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "id": self.id,
            "source": self.source,
            "thumbUrl": self.thumbUrl,
            "videoUrl": self.mediaUrl,
            "width": self.width,
            "height": self.height,
            "durationSec": self.durationSec,
        }


class StockProvider:
    def __init__(self) -> None:
        s = get_settings()
        self._pexels = KeyPool(list(s.pexels_keys))
        self._pixabay = KeyPool(list(s.pixabay_keys))
        self._api = get_api_manager()

    @property
    def available(self) -> bool:
        return bool(self._pexels or self._pixabay)

    async def search(
        self, query: str, *, kind: MediaKind = "video", per_source: int = 8
    ) -> list[StockResult]:
        pexels: list[StockResult] = []
        pixabay: list[StockResult] = []
        if self._pexels:
            try:
                pexels = await self._search_pexels(query, kind, per_source)
            except Exception as exc:
                log.warning("pexels search failed: %s", exc)
        if self._pixabay:
            try:
                pixabay = await self._search_pixabay(query, kind, per_source)
            except Exception as exc:
                log.warning("pixabay search failed: %s", exc)
        # Interleave 50-50 so ranking sees a balanced pool — appending pexels
        # first made every tie (and therefore every pick) land on pexels.
        merged: list[StockResult] = []
        for a, b in zip(pexels, pixabay):
            merged += [a, b]
        longer = pexels if len(pexels) > len(pixabay) else pixabay
        merged += longer[min(len(pexels), len(pixabay)):]
        return _dedupe(merged)

    # ------------------------------------------------------------------ #
    # Pexels
    # ------------------------------------------------------------------ #
    async def _search_pexels(self, query: str, kind: MediaKind, n: int) -> list[StockResult]:
        if kind == "video":
            url = "https://api.pexels.com/videos/search"
        else:
            url = "https://api.pexels.com/v1/search"
        data = await self._api.request(
            "GET",
            url,
            pool=self._pexels,
            auth_prefix="",  # Pexels uses a raw key, no "Bearer "
            params={"query": query, "per_page": n},
            cache_key=f"pexels:{kind}:{query}:{n}",
        )
        out: list[StockResult] = []
        if kind == "video":
            for v in (data or {}).get("videos", []):
                files = sorted(
                    v.get("video_files", []),
                    key=lambda f: (f.get("width") or 0),
                    reverse=True,
                )
                if not files:
                    continue
                best = files[0]
                out.append(
                    StockResult(
                        id=f"pexels-{v.get('id')}",
                        source="pexels",
                        kind="video",
                        thumbUrl=v.get("image", ""),
                        mediaUrl=best.get("link", ""),
                        width=best.get("width", 0) or v.get("width", 0),
                        height=best.get("height", 0) or v.get("height", 0),
                        durationSec=float(v.get("duration", 0) or 0) or None,
                    )
                )
        else:
            for p in (data or {}).get("photos", []):
                src = p.get("src", {})
                out.append(
                    StockResult(
                        id=f"pexels-{p.get('id')}",
                        source="pexels",
                        kind="image",
                        thumbUrl=src.get("medium", ""),
                        mediaUrl=src.get("large2x") or src.get("original", ""),
                        width=p.get("width", 0),
                        height=p.get("height", 0),
                    )
                )
        return out

    # ------------------------------------------------------------------ #
    # Pixabay
    # ------------------------------------------------------------------ #
    async def _search_pixabay(self, query: str, kind: MediaKind, n: int) -> list[StockResult]:
        base = "https://pixabay.com/api/videos/" if kind == "video" else "https://pixabay.com/api/"
        data = await self._api.request(
            "GET",
            base,
            pool=self._pixabay,          # rotate on 429 — key lives in the query string
            key_in="param",
            param_key_name="key",
            params={"q": query, "per_page": max(3, n), "safesearch": "true"},
            cache_key=f"pixabay:{kind}:{query}:{n}",
        )
        out: list[StockResult] = []
        for hit in (data or {}).get("hits", []):
            if kind == "video":
                streams = hit.get("videos", {})
                best = streams.get("large") or streams.get("medium") or streams.get("small") or {}
                out.append(
                    StockResult(
                        id=f"pixabay-{hit.get('id')}",
                        source="pixabay",
                        kind="video",
                        thumbUrl=f"https://i.vimeocdn.com/video/{hit.get('picture_id')}_640x360.jpg"
                        if hit.get("picture_id")
                        else best.get("thumbnail", ""),
                        mediaUrl=best.get("url", ""),
                        width=best.get("width", 0),
                        height=best.get("height", 0),
                        durationSec=float(hit.get("duration", 0) or 0) or None,
                        tags=[t.strip() for t in (hit.get("tags") or "").split(",") if t.strip()],
                    )
                )
            else:
                out.append(
                    StockResult(
                        id=f"pixabay-{hit.get('id')}",
                        source="pixabay",
                        kind="image",
                        thumbUrl=hit.get("previewURL", ""),
                        mediaUrl=hit.get("largeImageURL") or hit.get("webformatURL", ""),
                        width=hit.get("imageWidth", 0),
                        height=hit.get("imageHeight", 0),
                        tags=[t.strip() for t in (hit.get("tags") or "").split(",") if t.strip()],
                    )
                )
        return out


def _dedupe(results: list[StockResult]) -> list[StockResult]:
    seen: set[str] = set()
    out: list[StockResult] = []
    for r in results:
        if not r.mediaUrl or r.mediaUrl in seen:
            continue
        seen.add(r.mediaUrl)
        out.append(r)
    return out


_stock: Optional[StockProvider] = None


def get_stock() -> StockProvider:
    global _stock
    if _stock is None:
        _stock = StockProvider()
    return _stock
