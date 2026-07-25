"""
Typography Engine (16.7) — readable, consistent text.

Sizes text by hierarchy (title / subtitle / body), wraps long lines to a safe
length, and loads theme fonts (with a Pillow default fallback). Keeps a
consistent visual hierarchy so graphics don't look noisy.
"""

from __future__ import annotations

import textwrap

from core.agents.graphics.themes import Theme
from core.utils.logging import get_logger

log = get_logger("graphics.type")

# hierarchy → font size as a fraction of frame height
_SIZES = {"title": 0.075, "subtitle": 0.042, "body": 0.03, "label": 0.026, "stat": 0.12}
_WRAP = {"title": 22, "subtitle": 34, "body": 44, "label": 30, "stat": 12}


class TypographyEngine:
    def font(self, theme: Theme, level: str, frame_h: int):
        from PIL import ImageFont

        size = max(14, int(frame_h * _SIZES.get(level, 0.03)))
        path = theme.font if level in ("title", "stat", "subtitle") else theme.font_regular
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            try:
                return ImageFont.truetype(theme.font, size)
            except Exception:
                return ImageFont.load_default()

    def wrap(self, text: str, level: str) -> str:
        return "\n".join(textwrap.wrap(text or "", width=_WRAP.get(level, 40))) or (text or "")
