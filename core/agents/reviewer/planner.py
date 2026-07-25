"""
Improvement Planner (18.14) — route fixes to the right agent, not a full rebuild.

Collects every critic's recommendation, de-duplicates, orders by priority, and
produces the routed task list: each issue names the responsible agent and the
specific fix so only that part is regenerated (18.14), saving computation.
"""

from __future__ import annotations

from core.agents.reviewer.scoring import Critique
from core.schemas.production import ReviewIssue

_PRIORITY = {"high": 0, "medium": 1, "low": 2}


class ImprovementPlanner:
    def plan(self, critiques: list[Critique]) -> list[ReviewIssue]:
        recs: list[ReviewIssue] = []
        seen: set[tuple] = set()
        for c in critiques:
            for r in c.recommendations:
                key = (r.agent, r.scene, r.action)
                if key in seen:
                    continue
                seen.add(key)
                recs.append(r)
        recs.sort(key=lambda r: _PRIORITY.get(r.priority, 3))
        return recs
