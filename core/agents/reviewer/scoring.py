"""
Score Aggregator + Quality Scorecard (18.13).

Each critic returns a :class:`Critique` (a category score + issues +
recommendations). The aggregator combines them into a scorecard and an overall
score the Director compares against its passing threshold.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from pydantic import BaseModel, Field

from core.schemas.edl import Timeline
from core.schemas.production import KnowledgePackage, ReviewIssue, Scene


class Critique(BaseModel):
    category: str
    score: int = 100
    issues: list[str] = Field(default_factory=list)
    recommendations: list[ReviewIssue] = Field(default_factory=list)


@dataclass
class ProjectContext:
    """Everything the critics need to judge the project (18.4)."""

    timeline: Timeline
    scenes: list[Scene] = field(default_factory=list)
    research: Optional[KnowledgePackage] = None
    audio_plan: dict = field(default_factory=dict)
    render_package: dict = field(default_factory=dict)
    settings: Any = None


class ScoreAggregator:
    # category weights toward the overall score (18.13)
    _WEIGHTS = {
        "story": 0.22, "fact": 0.20, "visual": 0.18, "audio": 0.12,
        "timeline": 0.12, "motion": 0.08, "accessibility": 0.08,
    }

    def aggregate(self, critiques: list[Critique]) -> tuple[int, dict[str, int]]:
        scores = {c.category: c.score for c in critiques}
        total_w = sum(self._WEIGHTS.get(c.category, 0.1) for c in critiques) or 1.0
        overall = sum(c.score * self._WEIGHTS.get(c.category, 0.1) for c in critiques) / total_w
        return round(overall), scores
