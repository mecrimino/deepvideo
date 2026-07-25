"""
Image downloader — fetch thumbnails (for scoring) and full images (for use).

Thumbnails are small and cheap, so vision scoring (12.8) runs on them for the
whole shortlist; only the winner's full-resolution image is downloaded for the
timeline.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.tools.downloader import download_media


class ImageDownloader:
    async def thumb(self, candidate) -> Optional[Path]:
        url = candidate.thumb_url or candidate.url
        if not url:
            return None
        return await download_media(url, provider=f"{candidate.provider}_thumb", suffix=".jpg")

    async def full(self, candidate) -> Optional[Path]:
        url = candidate.url or candidate.thumb_url
        if not url:
            return None
        return await download_media(url, provider=candidate.provider, suffix=".jpg")
