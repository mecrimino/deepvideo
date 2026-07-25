"""
Layout Engine (16.8) — place graphics without covering the subject.

Uses the Vision agent's subject bounding box (when available) to choose a safe
region for an overlay: if the subject is on the left, text goes right, and vice
versa. Falls back to conventional positions (titles centred, lower-thirds bottom-
left) within a safe margin.
"""

from __future__ import annotations

from typing import Optional


class LayoutEngine:
    SAFE = 0.06  # safe-area margin as a fraction of the frame

    def position(self, gtype: str, w: int, h: int, subject_bbox: Optional[list] = None) -> tuple[int, int, str]:
        """Return (x, y, anchor) for the graphic's origin."""
        m = int(min(w, h) * self.SAFE)
        if gtype in ("title", "subtitle", "kinetic"):
            return w // 2, int(h * 0.42), "mm"
        if gtype in ("lower_third",):
            return m, int(h * 0.78), "lm"
        if gtype in ("stat", "chart", "comparison"):
            x = self._opposite_x(w, subject_bbox, m)
            return x, int(h * 0.30), "lm" if x < w // 2 else "rm"
        if gtype in ("timeline",):
            return m, int(h * 0.80), "lm"
        if gtype in ("callout", "highlight", "arrow"):
            return w // 2, int(h * 0.55), "mm"
        return m, m, "lt"

    def _opposite_x(self, w: int, bbox: Optional[list], margin: int) -> int:
        if not bbox or len(bbox) < 4:
            return int(w * 0.60)
        cx = (bbox[0] + bbox[2]) / 2
        return margin if cx > w / 2 else int(w * 0.58)  # place opposite the subject
