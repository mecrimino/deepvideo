"""
Asset downloader (Ch20.6 cache everything / Ch13 B-roll retrieval).

Downloads a remote media URL into ``downloads/<provider>/`` once and returns the
local path; subsequent requests for the same URL are served from disk. A
thumbnail is extracted so the UI has a poster without re-fetching the media.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Optional

from core.config import get_settings
from core.providers.api_manager import get_api_manager
from core.tools.ffmpeg import make_thumbnail, probe
from core.utils.logging import get_logger

log = get_logger("download")


def _hashed_name(url: str, suffix: str) -> str:
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
    return f"{digest}{suffix}"


async def download_media(url: str, *, provider: str = "stock", suffix: str = ".mp4") -> Optional[Path]:
    """Fetch ``url`` into ``downloads/<provider>/`` (idempotent, cached on disk)."""
    if not url:
        return None
    settings = get_settings()
    dest_dir = settings.paths.downloads / provider
    dest = dest_dir / _hashed_name(url, suffix)
    try:
        await get_api_manager().download(url, dest)
        return dest
    except Exception as exc:
        log.warning("download failed for %s: %s", url[:80], exc)
        return None


async def download_with_thumb(
    url: str, *, provider: str = "stock", suffix: str = ".mp4"
) -> tuple[Optional[Path], Optional[Path]]:
    """Download media and extract a thumbnail; returns (media_path, thumb_path)."""
    media = await download_media(url, provider=provider, suffix=suffix)
    if media is None:
        return None, None
    thumb_dir = get_settings().paths.cache / "thumbnails"
    thumb = thumb_dir / (media.stem + ".jpg")
    info = await probe(media)
    at = min(1.0, (info.durationSec or 2.0) / 2)
    made = await make_thumbnail(media, thumb, at_sec=at)
    return media, made
