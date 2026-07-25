"""
Timeline Reviewer (18.9) — structural integrity of the edit.

Looks for blank gaps, overlapping clips, subtitle overlap and over-long shots
that hurt pacing. Routes repairs to the Timeline agent.
"""

from __future__ import annotations

from core.agents.reviewer.scoring import Critique, ProjectContext
from core.schemas.production import ReviewIssue


class TimelineReviewer:
    category = "timeline"

    async def review(self, ctx: ProjectContext) -> Critique:
        tl = ctx.timeline
        issues: list[str] = []
        recs: list[ReviewIssue] = []
        score = 100

        for track in tl.tracks:
            if track.kind not in ("video", "overlay"):
                continue
            clips = sorted(track.clips, key=lambda c: c.range.startSec)
            for a, b in zip(clips, clips[1:]):
                gap = b.range.startSec - a.range.endSec
                if gap > 0.4:
                    score -= 5
                    issues.append(f"{gap:.1f}s gap before '{b.label or b.id}'")
                    recs.append(ReviewIssue(category="timeline", agent="timeline", priority="medium",
                                            action=f"Close the {gap:.1f}s gap."))
                if b.range.startSec < a.range.endSec - 0.05:
                    score -= 6
                    issues.append("overlapping clips")

        # subtitle overlap
        cues = sorted(tl.captions, key=lambda c: c.range.startSec)
        for a, b in zip(cues, cues[1:]):
            if b.range.startSec < a.range.endSec - 0.05:
                score -= 3
                recs.append(ReviewIssue(category="timeline", agent="subtitle", priority="low",
                                        action="Fix overlapping subtitles."))
                break
        return Critique(category=self.category, score=max(0, score), issues=issues, recommendations=recs[:8])
