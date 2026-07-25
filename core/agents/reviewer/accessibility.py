"""
Accessibility Reviewer (18.11) — is the content accessible to everyone?

Checks caption coverage, subtitle readability (words-per-cue and reading speed)
and caption timing. Future versions can add contrast / colour-blind-palette
checks. Routes fixes to the Subtitle agent.
"""

from __future__ import annotations

from core.agents.reviewer.scoring import Critique, ProjectContext
from core.agents.script.utils import words  # reuse word count
from core.schemas.production import ReviewIssue

_MAX_CPS = 20  # readable characters per second


class AccessibilityReviewer:
    category = "accessibility"

    async def review(self, ctx: ProjectContext) -> Critique:
        tl = ctx.timeline
        clips = [c for t in tl.tracks if t.kind in ("video", "overlay") for c in t.clips]
        cues = tl.captions
        issues: list[str] = []
        recs: list[ReviewIssue] = []
        score = 100

        if clips and not cues:
            score -= 30
            issues.append("no captions")
            recs.append(ReviewIssue(category="accessibility", agent="subtitle", priority="high",
                                    action="Generate subtitles for accessibility."))

        fast = 0
        long_cues = 0
        for c in cues:
            dur = max(0.1, c.range.duration)
            cps = len(c.text) / dur
            if cps > _MAX_CPS:
                fast += 1
            if words(c.text) > 14:
                long_cues += 1
        if fast:
            score -= min(20, fast * 3)
            issues.append(f"{fast} caption(s) too fast to read")
            recs.append(ReviewIssue(category="accessibility", agent="subtitle", priority="medium",
                                    action="Split fast captions into shorter cues."))
        if long_cues:
            score -= min(12, long_cues * 2)
            issues.append(f"{long_cues} overly long caption(s)")
        return Critique(category=self.category, score=max(0, score), issues=issues, recommendations=recs[:6])
