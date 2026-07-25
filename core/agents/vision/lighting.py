"""
Colour Analysis (14.15) + Lighting Analysis (14.16).

Extracts dominant colours (k-means) for colour matching / mood, and classifies
lighting (night / golden hour / daylight / overcast / indoor-studio) from
brightness and warm-vs-cool balance — used to keep visual continuity between
scenes.
"""

from __future__ import annotations

from core.utils.logging import get_logger

log = get_logger("vision.lighting")

# hue(0-179 OpenCV) → colour name
_HUES = [(10, "red"), (20, "orange"), (33, "yellow"), (85, "green"),
         (100, "cyan"), (130, "blue"), (160, "purple"), (180, "red")]


def _hue_name(h: float, s: float, v: float) -> str:
    if v < 40:
        return "black"
    if s < 30:
        return "white" if v > 180 else "gray"
    for bound, name in _HUES:
        if h <= bound:
            return name
    return "red"


class ColorLightingAnalyzer:
    def colors(self, frame, *, k: int = 4) -> list[str]:
        try:
            import cv2
            import numpy as np

            small = cv2.resize(frame, (80, 45)).reshape(-1, 3).astype("float32")
            crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
            _c, labels, centers = cv2.kmeans(small, k, None, crit, 3, cv2.KMEANS_PP_CENTERS)
            counts = np.bincount(labels.flatten(), minlength=k)
            order = counts.argsort()[::-1]
            names: list[str] = []
            for i in order:
                b, g, r = centers[i]
                hsv = cv2.cvtColor(np.uint8([[[b, g, r]]]), cv2.COLOR_BGR2HSV)[0][0]
                name = _hue_name(float(hsv[0]), float(hsv[1]), float(hsv[2]))
                if name not in names:
                    names.append(name)
            return names[:4]
        except Exception as exc:
            log.debug("colour analysis failed: %s", exc)
            return []

    def lighting(self, frame) -> str:
        try:
            import cv2
            import numpy as np

            hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
            v = float(hsv[..., 2].mean())
            b, g, r = [float(frame[..., i].mean()) for i in range(3)]
            warmth = r - b  # warm (>0) vs cool (<0)
            if v < 55:
                return "night"
            if warmth > 25 and v < 160:
                return "golden_hour"
            if warmth > 25:
                return "sunset"
            if v > 190 and abs(warmth) < 15:
                return "studio"
            if warmth < -10:
                return "overcast"
            return "daylight"
        except Exception:
            return "unknown"
