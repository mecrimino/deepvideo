"""
Aesthetic Scoring (12.10) — technical quality is not enough.

Estimates visual appeal from colorfulness (Hasler–Süsstrunk), contrast and
resolution using OpenCV/Pillow on the thumbnail — a proxy for professional
composition, colour balance, lighting and cinematic feel. Falls back to an
aspect/resolution proxy when no image is available.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.agents.image.models import ImageCandidate
from core.utils.logging import get_logger

log = get_logger("image.aesthetics")


class AestheticScorer:
    def score(self, candidate: ImageCandidate, image_path: Optional[Path] = None) -> float:
        res = min(1.0, (candidate.width or 0) / 1920.0) if candidate.width else 0.5
        if image_path is None or not Path(image_path).exists():
            return round(0.6 * res + 0.4 * 0.6, 3)  # neutral aesthetic prior
        try:
            import cv2
            import numpy as np

            img = cv2.imread(str(image_path))
            if img is None:
                return round(res, 3)
            b, g, r = cv2.split(img.astype("float"))
            rg = np.absolute(r - g)
            yb = np.absolute(0.5 * (r + g) - b)
            colorfulness = float(np.sqrt(rg.std() ** 2 + yb.std() ** 2)
                                 + 0.3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2))
            color_score = min(1.0, colorfulness / 80.0)
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            contrast = min(1.0, float(gray.std()) / 70.0)
            return round(0.40 * color_score + 0.35 * contrast + 0.25 * res, 3)
        except Exception as exc:
            log.debug("aesthetic scoring failed: %s", exc)
            return round(res, 3)
