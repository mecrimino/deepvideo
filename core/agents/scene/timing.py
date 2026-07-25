"""
Timing Estimator (11.11) + Visual Density (11.10).

Estimates each scene's duration from its narration (~150 wpm) and assigns a
visual-density rating so high-impact beats (hook, climax, conclusion) get richer
visuals than routine explanation.
"""

from __future__ import annotations

from core.schemas.production import Scene
from core.utils.text import estimate_speech_sec

# 11.10 — density by narrative importance / position
_DENSITY = {"high": 5, "medium": 3, "low": 2}


class TimingEstimator:
    def estimate(self, scenes: list[Scene], *, max_scene_sec: float = 9.0) -> list[Scene]:
        cursor = 0.0
        for i, s in enumerate(scenes):
            dur = s.duration or estimate_speech_sec(s.narration)
            dur = max(2.0, min(max_scene_sec, dur))
            s.duration = round(dur, 2)
            s.range_start = round(cursor, 2)
            s.range_end = round(cursor + dur, 2)
            cursor += dur
            # 11.10 density → importance (first/last scenes are high-impact)
            if i == 0 or i == len(scenes) - 1:
                s.importance = "high"
            s.graphics = s.graphics  # unchanged; density is recorded via importance
        return scenes

    @staticmethod
    def density(scene: Scene) -> int:
        return _DENSITY.get(scene.importance, 3)

    def total(self, scenes: list[Scene]) -> float:
        return round(sum(s.duration for s in scenes), 2)
