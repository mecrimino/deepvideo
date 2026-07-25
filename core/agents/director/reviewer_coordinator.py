"""
Reviewer Coordinator (5.6) — the Director requests quality review before export.

Self-Review is a core principle (1.6): nothing exports before an automated
review. This module requests that review through an injected reviewer callable
(the Reviewer agents arrive in Ch18). If no reviewer is wired yet, it honestly
reports the review as *requested but not performed* — it never fakes a pass, so
the Export Controller correctly holds export back.
"""

from __future__ import annotations

from typing import Awaitable, Callable, Optional

from core.agents.director.models import ReviewOutcome
from core.utils.logging import get_logger

# A reviewer is any async callable that returns (passed, score, issues).
Reviewer = Callable[[dict], Awaitable[ReviewOutcome]]


class ReviewerCoordinator:
    def __init__(self, reviewer: Optional[Reviewer] = None, threshold: int = 90) -> None:
        self.reviewer = reviewer
        self.threshold = threshold
        self.log = get_logger("director.review")

    async def request_review(self, context: dict) -> ReviewOutcome:
        if self.reviewer is None:
            self.log.info("review requested but no reviewer wired (awaiting Ch18)")
            return ReviewOutcome(requested=True, performed=False, passed=False, score=0)
        try:
            outcome = await self.reviewer(context)
            outcome.requested = True
            outcome.performed = True
            outcome.passed = outcome.score >= self.threshold if outcome.score else outcome.passed
            self.log.info("review score=%d passed=%s", outcome.score, outcome.passed)
            return outcome
        except Exception as exc:
            self.log.warning("review failed: %s", exc)
            return ReviewOutcome(requested=True, performed=False, passed=False, issues=[str(exc)])
