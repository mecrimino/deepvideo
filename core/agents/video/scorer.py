"""
Clip Quality Scoring (13.12) + Semantic Matching (13.13).

Scores each shot's keyframe with OpenCV (sharpness, lighting, stability) and its
semantic relevance with the embedder (does the shot's objects/tags mean what the
scene asked for — 13.13, so a rocket *on the pad* loses to a rocket *launching*).
"""

from __future__ import annotations

from pathlib import Path

from core.agents.video.models import Shot, VideoRequest
from core.memory.embedder import cosine
from core.utils.logging import get_logger

log = get_logger("video.scorer")


class ShotScorer:
    def quality(self, shot: Shot) -> float:
        res = 0.5
        if not shot.keyframe or not Path(shot.keyframe).exists():
            shot.quality = res
            return res
        try:
            import cv2

            img = cv2.imread(shot.keyframe)
            if img is None:
                shot.quality = res
                return res
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            sharp = min(1.0, cv2.Laplacian(gray, cv2.CV_64F).var() / 800.0)
            mean = float(gray.mean())
            lighting = 1.0 - min(1.0, abs(mean - 130) / 130.0)
            stability = 1.0 - min(1.0, shot.motion_score)  # steadier = better (13.12)
            q = round(0.45 * sharp + 0.30 * lighting + 0.25 * stability, 3)
            shot.quality = q
            return q
        except Exception as exc:
            log.debug("quality scoring failed: %s", exc)
            shot.quality = res
            return res

    def semantic(self, shot: Shot, request: VideoRequest, video_tags: list[str]) -> float:
        target = request.visual_goal or " ".join(request.keywords)
        haystack = " ".join([*shot.objects, *video_tags, *request.keywords])
        shot.semantic = round(cosine(target, haystack), 3)
        return shot.semantic
