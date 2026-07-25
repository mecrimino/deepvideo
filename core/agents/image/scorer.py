"""
Vision-Based Quality Analysis (12.8) + Semantic Matching (12.9).

Technical quality is measured with **OpenCV** (tools.md) on the downloaded
thumbnail: resolution, sharpness (variance of Laplacian), exposure (mean
brightness) and noise. Semantic match uses the project embedder to check the
image's tags/query actually mean what the scene needs — so a museum photo doesn't
win a "fighter taking off" scene. Falls back to metadata-only scoring when no
image is downloaded.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.agents.image.models import ImageCandidate, SceneRequest
from core.memory.embedder import cosine
from core.utils.logging import get_logger

log = get_logger("image.scorer")


class VisionScorer:
    # ---- 12.9 semantic --------------------------------------------- #
    def semantic(self, candidate: ImageCandidate, request: SceneRequest) -> float:
        target = request.visual_goal or " ".join(request.keywords)
        haystack = " ".join([candidate.query, *candidate.tags, *candidate.keywords])
        return round(cosine(target, haystack), 3)

    # ---- 12.8 technical -------------------------------------------- #
    def technical(self, candidate: ImageCandidate, image_path: Optional[Path] = None) -> float:
        # resolution component always available from metadata
        res = min(1.0, (candidate.height or 0) / 1080.0) if candidate.height else 0.4
        if image_path is None or not Path(image_path).exists():
            return round(res, 3)
        try:
            import cv2

            img = cv2.imread(str(image_path))
            if img is None:
                return round(res, 3)
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            # sharpness: variance of the Laplacian (blurry → low)
            sharp = min(1.0, cv2.Laplacian(gray, cv2.CV_64F).var() / 800.0)
            # exposure: mean brightness, ideal ~80–180 of 255
            mean = float(gray.mean())
            exposure = 1.0 - min(1.0, abs(mean - 130) / 130.0)
            # noise proxy: high-frequency std after blur subtraction
            blur = cv2.GaussianBlur(gray, (3, 3), 0)
            noise = float((gray.astype("float") - blur).std())
            noise_score = 1.0 - min(1.0, noise / 25.0)
            return round(0.40 * res + 0.30 * sharp + 0.20 * exposure + 0.10 * noise_score, 3)
        except Exception as exc:
            log.debug("technical scoring failed: %s", exc)
            return round(res, 3)
