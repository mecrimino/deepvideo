"""
Charts (16.12) — numbers are easier to understand visually.

Draws an animated-ready bar chart onto a transparent overlay with Pillow: bars
sized to the data, value labels, and category labels. "Sales increased 42%"
becomes two bars the viewer can compare at a glance.
"""

from __future__ import annotations


class ChartGraphic:
    def draw(self, draw, theme, typo, w: int, h: int, data: dict) -> None:
        labels = [str(l) for l in data.get("labels", [])][:6]
        values = [float(v) for v in data.get("values", [])][:6]
        if not values:
            return
        vmax = max(values) or 1.0
        area_w, area_h = int(w * 0.5), int(h * 0.4)
        x0, y0 = int(w * 0.08), int(h * 0.28)
        n = len(values)
        gap = area_w // (n * 2)
        bw = (area_w - gap * (n + 1)) // n
        font = typo.font(theme, "label", h)
        for i, v in enumerate(values):
            bh = int(area_h * (v / vmax))
            bx = x0 + gap + i * (bw + gap)
            by = y0 + area_h - bh
            draw.rectangle([bx, by, bx + bw, y0 + area_h], fill=theme.accent)
            draw.text((bx + bw // 2, by - 6), str(int(v)), font=font, fill=theme.text, anchor="mb")
            if i < len(labels):
                draw.text((bx + bw // 2, y0 + area_h + 6), labels[i], font=font, fill=theme.text, anchor="mt")
