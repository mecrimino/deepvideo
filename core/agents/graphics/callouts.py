"""
Callouts (16.13) + Object Highlighting (16.14) + Kinetic Typography (16.15).

Callouts guide attention with a pointer + label; object highlighting draws an
animated outline around a Vision-detected bounding box; kinetic typography draws
a single emphasised word to be zoomed/held/faded by the animation engine.
"""

from __future__ import annotations

from typing import Optional


class CalloutGraphic:
    def draw_callout(self, draw, theme, typo, w: int, h: int, text: str, target: Optional[list] = None) -> None:
        font = typo.font(theme, "subtitle", h)
        tx, ty = (int(w * 0.5), int(h * 0.35))
        if target and len(target) >= 4:
            tx, ty = int((target[0] + target[2]) / 2), int(target[1])
        lx, ly = tx, ty - int(h * 0.15)
        draw.line([(tx, ty), (lx, ly)], fill=theme.accent, width=3)
        draw.polygon([(tx, ty), (tx - 8, ty - 12), (tx + 8, ty - 12)], fill=theme.accent)
        draw.text((lx, ly - 8), text, font=font, fill=theme.text, anchor="mb")

    def draw_highlight(self, draw, theme, w: int, h: int, bbox: list) -> None:
        if len(bbox) < 4:
            return
        draw.rectangle(bbox, outline=theme.accent, width=5)

    def draw_kinetic(self, draw, theme, typo, w: int, h: int, word: str) -> None:
        font = typo.font(theme, "title", h)
        draw.text((w // 2, h // 2), (word or "").upper(), font=font, fill=theme.accent, anchor="mm")
