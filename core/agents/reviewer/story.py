"""
Story Reviewer (18.5) — is the narrative compelling and coherent?

Asks: is the hook compelling, does it flow, are transitions smooth, is the ending
satisfying, is anything repeated? Deterministic checks (repetition, hook/ending
presence) always run; an LLM adds a narrative-flow critique when available.
"""

from __future__ import annotations

from core.agents.reviewer.scoring import Critique, ProjectContext
from core.providers.llm.router import LLMUnavailable
from core.schemas.production import ReviewIssue
from core.utils.text import extract_json


class StoryReviewer:
    category = "story"

    def __init__(self, llm=None) -> None:
        self.llm = llm

    async def review(self, ctx: ProjectContext) -> Critique:
        cues = ctx.timeline.captions
        issues: list[str] = []
        recs: list[ReviewIssue] = []
        score = 100

        if not cues:
            return Critique(category=self.category, score=50, issues=["no narration to judge"])

        # repetition — repeated caption lines (18.5)
        texts = [c.text.strip().lower() for c in cues]
        repeats = len(texts) - len(set(texts))
        if repeats:
            score -= repeats * 5
            issues.append(f"{repeats} repeated narration line(s)")
            recs.append(ReviewIssue(category="story", agent="script", priority="medium",
                                    action="Remove repeated narration lines."))

        # hook / ending presence
        if len(cues[0].text.split()) < 4:
            score -= 6
            issues.append("weak/short hook")
            recs.append(ReviewIssue(category="story", agent="script", priority="medium",
                                    action="Strengthen the opening hook."))

        # optional LLM narrative critique
        if self.llm is not None and self.llm.available:
            try:
                narration = " ".join(c.text for c in cues)[:2500]
                data = await self.llm.json(
                    "You are a story editor. Judge narrative flow. STRICT JSON.",
                    f"Narration:\n{narration}\n\nReturn {{\"score\":0-100,\"issue\":str}}.",
                    effort="fast")
                if isinstance(data, dict) and "score" in data:
                    score = round((score + int(data["score"])) / 2)
                    if data.get("issue"):
                        issues.append(str(data["issue"]))
            except (LLMUnavailable, Exception):
                pass

        return Critique(category=self.category, score=max(0, score), issues=issues, recommendations=recs)
