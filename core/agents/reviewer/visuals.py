"""
Visual Reviewer (18.7) — clip relevance and quality.

Evaluates footage: clips flagged as weak matches, unfilled (generation-slot)
scenes, duplicate shots and low match scores. Routes replacements to the Video/
Image search agents (18.14).
"""

from __future__ import annotations

from core.agents.reviewer.scoring import Critique, ProjectContext
from core.schemas.production import ReviewIssue


class VisualReviewer:
    category = "visual"

    async def review(self, ctx: ProjectContext) -> Critique:
        clips = [c for t in ctx.timeline.tracks if t.kind in ("video", "overlay") for c in t.clips]
        if not clips:
            return Critique(category=self.category, score=0,
                            issues=["no footage on the timeline"],
                            recommendations=[ReviewIssue(category="visual", agent="video_search",
                                                         priority="high", action="Retrieve footage for every scene.")])
        issues: list[str] = []
        recs: list[ReviewIssue] = []
        weak = 0
        seen: dict[str, int] = {}
        for i, c in enumerate(clips, 1):
            key = getattr(c.source, "assetId", None) or getattr(getattr(c.source, "slot", None), "prompt", "")
            seen[key] = seen.get(key, 0) + 1
            if c.review:
                weak += 1
                recs.append(ReviewIssue(category="visual", scene=i, agent="video_search",
                                        priority="medium",
                                        action=f"Replace weak clip for '{c.label or c.id}'."))
            if c.matchScore is not None and ctx.settings and c.matchScore < ctx.settings.match_threshold:
                recs.append(ReviewIssue(category="visual", scene=i, agent="video_search",
                                        priority="low", action="Consider a more relevant clip."))
        dupes = sum(v - 1 for v in seen.values() if v > 1)
        if dupes:
            issues.append(f"{dupes} duplicate shot(s)")
            recs.append(ReviewIssue(category="visual", agent="video_search", priority="medium",
                                    action="Diversify repeated footage."))
        if weak:
            issues.append(f"{weak} weak/placeholder clip(s)")
        score = max(0, 100 - weak * 6 - dupes * 5)
        return Critique(category=self.category, score=score, issues=issues, recommendations=recs[:10])
