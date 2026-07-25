"""
Report Builder (18.16) — the structured, routable review output.

Assembles the shared :class:`ReviewReport` (overall score, per-category scores,
pass/fail, and recommendations that name scene + agent + priority + action) —
exactly the 18.16 format the Director uses to auto-route improvements.
"""

from __future__ import annotations

from core.schemas.production import ReviewIssue, ReviewReport


class ReportBuilder:
    def build(self, overall: int, scores: dict[str, int], recs: list[ReviewIssue],
              *, threshold: int) -> ReviewReport:
        return ReviewReport(
            overall_score=overall,
            passed=overall >= threshold,
            category_scores=scores,
            recommendations=recs,
        )
