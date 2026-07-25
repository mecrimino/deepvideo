"""
Export Controller (5.6) — the Director approves (or withholds) the export.

The final gate. Export is approved only when the quality review passed
(Self-Review, 1.6) and no task hard-failed. Otherwise it withholds export and
states why, so the improvement loop (Layer 6) can act. The Director *approves*
export; the actual render is the Exporter agent's job (Layer 5).
"""

from __future__ import annotations

from core.agents.director.models import ExportDecision, ReviewOutcome, TaskResult
from core.utils.logging import get_logger


class ExportController:
    def __init__(self) -> None:
        self.log = get_logger("director.export")

    def decide(self, review: ReviewOutcome, results: list[TaskResult]) -> ExportDecision:
        hard_failures = [r for r in results if r.status == "failed"]
        if hard_failures:
            reason = f"{len(hard_failures)} task(s) failed and could not be recovered."
            return ExportDecision(approved=False, reason=reason)

        if not review.performed:
            return ExportDecision(
                approved=False,
                reason="Quality review not yet performed — export held (Self-Review, 1.6).",
            )
        if not review.passed:
            issues = "; ".join(review.issues[:3]) or f"score {review.score} below threshold"
            return ExportDecision(approved=False, reason=f"Review did not pass: {issues}.")

        self.log.info("export approved (review score %d)", review.score)
        return ExportDecision(approved=True, reason=f"Review passed (score {review.score}).")
