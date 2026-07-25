"""
Timeline Graphics (16.10) — for historical topics.

    1990 ──► 2000 ──► 2010 ──► 2025

Draws a horizontal timeline with year markers that the renderer animates as the
narration progresses.
"""

from __future__ import annotations


class TimelineGraphic:
    def draw(self, draw, theme, typo, w: int, h: int, data: dict) -> None:
        years = [str(y) for y in data.get("years", [])][:6]
        if not years:
            return
        y = int(h * 0.82)
        x0, x1 = int(w * 0.08), int(w * 0.92)
        draw.line([(x0, y), (x1, y)], fill=theme.accent, width=4)
        font = typo.font(theme, "label", h)
        n = len(years)
        for i, yr in enumerate(years):
            x = x0 + int((x1 - x0) * (i / max(1, n - 1)))
            draw.ellipse([x - 8, y - 8, x + 8, y + 8], fill=theme.accent)
            draw.text((x, y - 22), yr, font=font, fill=theme.text, anchor="mb")
