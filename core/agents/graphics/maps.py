"""
Maps (16.11) — animated paths help viewers understand movement and geography.

    "The aircraft flew from Alaska to Japan." → Alaska ●───────►● Japan

Draws a stylized map with labelled points connected by an animated-ready path
(no external map tiles required — a clean abstract representation).
"""

from __future__ import annotations


class MapGraphic:
    def draw(self, draw, theme, typo, w: int, h: int, data: dict) -> None:
        points = data.get("points", [])  # [(name, x_frac, y_frac), ...]
        if len(points) < 1:
            return
        font = typo.font(theme, "label", h)
        px = [(name, int(w * fx), int(h * fy)) for (name, fx, fy) in points]
        # path
        for (n1, x1, y1), (n2, x2, y2) in zip(px, px[1:]):
            draw.line([(x1, y1), (x2, y2)], fill=theme.accent, width=4)
            # arrow head
            draw.polygon([(x2, y2), (x2 - 14, y2 - 7), (x2 - 14, y2 + 7)], fill=theme.accent)
        for name, x, y in px:
            draw.ellipse([x - 9, y - 9, x + 9, y + 9], fill=theme.text, outline=theme.accent, width=3)
            draw.text((x, y - 20), name, font=font, fill=theme.text, anchor="mb")
