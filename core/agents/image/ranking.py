"""
Asset Ranking (12.14) + Style Consistency (12.13).

Combines the signals into one score:

    final = 0.30·semantic + 0.25·technical + 0.20·aesthetic
          + 0.15·license  + 0.10·style

Style consistency keeps a project from mixing wildly different looks (photoreal vs
anime vs oil painting). Weights are tunable from user feedback (the design
improvement in 12.20).
"""

from __future__ import annotations

from core.agents.image.models import ImageCandidate, SceneRequest
from core.memory.embedder import cosine

_W = {"semantic": 0.30, "technical": 0.25, "aesthetic": 0.20, "license": 0.15, "style": 0.10}


class RankingEngine:
    def __init__(self, weights: dict | None = None) -> None:
        self.w = {**_W, **(weights or {})}

    def style_score(self, candidate: ImageCandidate, request: SceneRequest) -> float:
        # consistency between the desired style and the image's descriptors
        desc = " ".join([*candidate.tags, candidate.query])
        s = cosine(f"{request.style} photography style", desc)
        return round(max(0.5, min(1.0, 0.5 + s)), 3)  # floor 0.5, so style is a nudge

    def rank(self, candidates: list[ImageCandidate], request: SceneRequest) -> list[ImageCandidate]:
        for c in candidates:
            c.style_score = self.style_score(c, request)
            c.final_score = round(
                self.w["semantic"] * c.semantic_score
                + self.w["technical"] * c.technical_score
                + self.w["aesthetic"] * c.aesthetic_score
                + self.w["license"] * c.license_score
                + self.w["style"] * c.style_score,
                4,
            )
        candidates.sort(key=lambda c: c.final_score, reverse=True)
        return candidates
