"""
AI Image Generation provider (Ch12.16 / Ch20 cloud).

Generates an image from a text prompt via a Cloudflare Worker (if configured) or
**Pollinations** (keyless, always available). Used as the fallback when no
suitable stock image exists — turning an empty scene into real generated footage.
Downloads are cached on disk (Ch20.6), so the same prompt is never regenerated.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from core.config import get_settings
from core.providers.api_manager import get_api_manager
from core.utils.logging import get_logger

log = get_logger("image.gen")


class ImageGenerator:
    def __init__(self) -> None:
        s = get_settings()
        self.cf_url = s.cf_image_worker_url
        self.cf_secret = s.cf_image_worker_secret
        self.pollinations = s.pollinations_image_url
        self.dir = s.paths.cache / "images"
        self.dir.mkdir(parents=True, exist_ok=True)
        self._api = get_api_manager()

    @property
    def available(self) -> bool:
        return bool(self.cf_url or self.pollinations)

    def _dest(self, prompt: str, w: int, h: int) -> Path:
        digest = hashlib.sha256(f"{prompt}|{w}x{h}".encode()).hexdigest()[:16]
        return self.dir / f"gen_{digest}.jpg"

    async def generate(self, prompt: str, *, width: int = 1280, height: int = 720) -> Optional[Path]:
        if not prompt.strip() or not self.available:
            return None
        dest = self._dest(prompt, width, height)
        if dest.exists() and dest.stat().st_size > 1000:      # cache hit (20.6)
            return dest

        # 1) Cloudflare Worker (if configured)
        if self.cf_url:
            try:
                url = (f"{self.cf_url.rstrip('/')}/?prompt={quote(prompt)}"
                       f"&width={width}&height={height}&secret={quote(self.cf_secret)}")
                await self._api.download(url, dest)
                if dest.exists() and dest.stat().st_size > 1000:
                    return dest
            except Exception as exc:
                log.debug("CF image worker failed: %s", exc)

        # 2) Pollinations (keyless)
        if self.pollinations:
            try:
                base = self.pollinations.format(prompt=quote(prompt))
                url = f"{base}?width={width}&height={height}&nologo=true"
                await self._api.download(url, dest)
                if dest.exists() and dest.stat().st_size > 1000:
                    log.info("generated image for %r", prompt[:50])
                    return dest
            except Exception as exc:
                log.warning("pollinations generation failed: %s", exc)
        return None


_generator: Optional[ImageGenerator] = None


def get_image_generator() -> ImageGenerator:
    global _generator
    if _generator is None:
        _generator = ImageGenerator()
    return _generator
