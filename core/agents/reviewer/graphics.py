"""
Motion Graphics Reviewer (18.10) — do the graphics help, not distract?

Evaluates the render package for readability (text length), timing (graphics fit
within their scene) and count (not too busy). Routes fixes to the Graphics agent.
"""

from __future__ import annotations

from core.agents.reviewer.scoring import Critique, ProjectContext
from core.schemas.production import ReviewIssue


class GraphicsReviewer:
    category = "motion"

    async def review(self, ctx: ProjectContext) -> Critique:
        elements = (ctx.render_package or {}).get("elements", [])
        if not elements:
            return Critique(category=self.category, score=100)  # none is fine
        issues: list[str] = []
        recs: list[ReviewIssue] = []
        score = 100
        for e in elements:
            text = str(e.get("text", ""))
            if len(text) > 90:
                score -= 4
                issues.append("overlong graphic text")
                recs.append(ReviewIssue(category="motion", scene=e.get("scene_id"), agent="graphics",
                                        priority="low", action="Shorten graphic text for readability."))
            if e.get("end", 0) <= e.get("start", 0):
                score -= 5
                recs.append(ReviewIssue(category="motion", scene=e.get("scene_id"), agent="graphics",
                                        priority="medium", action="Fix graphic timing (zero duration)."))
        # too many graphics on screen at once hurts clarity
        by_scene: dict = {}
        for e in elements:
            by_scene[e.get("scene_id")] = by_scene.get(e.get("scene_id"), 0) + 1
        busy = [s for s, n in by_scene.items() if n > 3]
        if busy:
            score -= 6
            issues.append(f"{len(busy)} scene(s) with too many graphics")
        return Critique(category=self.category, score=max(0, score), issues=issues, recommendations=recs[:6])
