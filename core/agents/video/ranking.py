"""
Story-Aware Ranking (13.16) — more than visual quality.

    final = 0.40·semantic + 0.20·visual + 0.15·motion
          + 0.10·license  + 0.10·style  + 0.05·length

Motion honours a requested camera move (a "drone shot" request boosts drone/
tracking shots); length rewards clips that comfortably cover the target duration.
"""

from __future__ import annotations

from core.agents.video.models import VideoCandidate, VideoRequest
from core.memory.embedder import cosine

_W = {"semantic": 0.40, "visual": 0.20, "motion": 0.15, "license": 0.10, "style": 0.10, "length": 0.05}


class RankingEngine:
    def __init__(self, weights: dict | None = None) -> None:
        self.w = {**_W, **(weights or {})}

    def rank(self, candidates: list[VideoCandidate], request: VideoRequest) -> list[VideoCandidate]:
        for c in candidates:
            shot = c.best_shot
            semantic = shot.semantic if shot else c.semantic
            visual = shot.quality if shot else 0.5
            motion = self._motion_score(request, shot)
            style = max(0.5, min(1.0, 0.5 + cosine(f"{request.style} footage", " ".join(c.tags))))
            length = self._length_fit(c, request.duration)
            c.final_score = round(
                self.w["semantic"] * semantic + self.w["visual"] * visual
                + self.w["motion"] * motion + self.w["license"] * c.license_score
                + self.w["style"] * style + self.w["length"] * length, 4)
        candidates.sort(key=lambda c: c.final_score, reverse=True)
        return candidates

    def _motion_score(self, request: VideoRequest, shot) -> float:
        if shot is None:
            return 0.5
        if request.motion and request.motion.lower() in shot.camera.lower():
            return 1.0                                   # requested motion matched
        return round(0.5 + 0.5 * shot.motion_score, 3)   # some motion is cinematic

    @staticmethod
    def _length_fit(c: VideoCandidate, target: float) -> float:
        avail = c.best_shot.duration if c.best_shot else c.durationSec
        if avail <= 0:
            return 0.5
        return 1.0 if avail >= target else max(0.3, avail / target)
