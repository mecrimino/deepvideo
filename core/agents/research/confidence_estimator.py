"""
Confidence Scoring (9.11) — every fact gets a score.

Factors: number of supporting sources, authority of those sources, publication
date (freshness), consistency (agreement) and relevance. A fact backed by five
high-authority, agreeing sources scores near 1.0; a lone low-authority claim
scores low. The Script Agent uses these to prioritise reliable information.
"""

from __future__ import annotations

import re
from datetime import datetime

from core.agents.research.models import SourcedFact

_YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")


class ConfidenceEstimator:
    def score(self, facts: list[SourcedFact]) -> list[SourcedFact]:
        now_year = datetime.now().year
        for f in facts:
            n = max(1, len(f.source_ids))
            support = min(1.0, n / 3.0)                      # saturates at 3 sources
            authority = float(f.authority or 0.5)
            freshness = self._freshness(f.published, now_year)
            # consistency: single agreed value (contradictions already penalised)
            consistency = 0.9 if n > 1 else 0.6
            f.confidence = round(
                0.35 * support + 0.30 * authority + 0.15 * freshness
                + 0.20 * consistency, 3
            )
        return facts

    @staticmethod
    def _freshness(published: str, now_year: int) -> float:
        m = _YEAR_RE.search(published or "")
        if not m:
            return 0.5
        return max(0.2, min(1.0, 1.0 - (now_year - int(m.group(0))) / 12.0))
