"""
Fact Reviewer (18.6) — every factual claim must be supported by research.

Extracts numeric/named claims from the narration and checks them against the
Research agent's :class:`KnowledgePackage`. Unsupported claims are flagged and
routed back to the Script/Research agents, reducing hallucinations.
"""

from __future__ import annotations

import re

from core.agents.reviewer.scoring import Critique, ProjectContext
from core.schemas.production import ReviewIssue
from core.utils.text import split_sentences

_NUM_RE = re.compile(r"\b\d[\d,\.]*\b")


class FactReviewer:
    category = "fact"

    async def review(self, ctx: ProjectContext) -> Critique:
        pkg = ctx.research
        cues = ctx.timeline.captions
        if pkg is None or not pkg.key_facts:
            # no research to verify against — neutral, mildly cautious
            return Critique(category=self.category, score=80,
                            issues=["no research package to verify claims against"])

        supported_numbers: set[str] = set()
        fact_text = " ".join(f"{f.subject} {f.predicate} {f.object}" for f in pkg.key_facts) + " " + pkg.summary
        supported_numbers |= set(_NUM_RE.findall(fact_text))

        unsupported: list[str] = []
        recs: list[ReviewIssue] = []
        for i, cue in enumerate(cues):
            for sent in split_sentences(cue.text):
                nums = {n for n in _NUM_RE.findall(sent) if len(n) >= 2}
                stray = nums - supported_numbers
                if stray:
                    unsupported.append(sent)
                    recs.append(ReviewIssue(category="fact", scene=i + 1, agent="research",
                                            priority="high",
                                            action=f"Verify claim: '{sent[:60]}' ({', '.join(stray)})."))
        score = max(0, 100 - len(unsupported) * 12)
        issues = [f"{len(unsupported)} unsupported factual claim(s)"] if unsupported else []
        return Critique(category=self.category, score=score, issues=issues, recommendations=recs[:8])
