"""
Shared candidate model for the retrieval agents (Ch12/Ch13).

A :class:`Candidate` wraps a provider search hit with the scores the ranking
engine assigns. Candidates are lightweight (no download) until one is *picked*;
only then is the media fetched and trimmed (Ch20.9 load only active assets).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from core.providers.search.stock import StockResult
from core.schemas.pipeline import MatchCandidate


@dataclass
class Candidate:
    id: str
    stock: StockResult
    query: str
    semantic: float = 0.0      # semantic match (Ch12.14 / Ch13.16)
    quality: float = 0.0       # technical quality
    motion: float = 0.0        # motion suitability (video only)
    score: float = 0.0         # combined
    in_sec: Optional[float] = None
    out_sec: Optional[float] = None

    @property
    def thumb(self) -> str:
        return self.stock.thumbUrl

    @property
    def source(self) -> str:
        return self.stock.source

    def to_match(self) -> MatchCandidate:
        return MatchCandidate(
            clipId=self.id,
            score=round(self.score, 4),
            textScore=round(self.semantic, 4),
            visualScore=round(self.quality, 4),
            inSec=self.in_sec,
            outSec=self.out_sec,
        )
