"""
Workflow Planner (5.4 Estimate Complexity + 5.9 Workflow Selection).

Not every project is a documentary (5.9). Each named workflow has its own
production pipeline: Documentary, Tutorial, Shorts, Podcast, Product Review,
Educational, News, History, Animation. This module (a) estimates complexity from
the brief, then (b) selects the workflow template and tailors its stages to the
required capabilities (5.8) — e.g. drop research for a simple short, add a
fact-check stage for factual formats, keep motion graphics only when needed.
Deterministic engineering (keeps the Director lightweight, 5.17).
"""

from __future__ import annotations

from typing import Optional

from core.agents.director.models import (
    Complexity,
    ComplexityLevel,
    ProductionBrief,
    RequiredCapabilities,
    WorkflowChoice,
)

# 5.9 named workflows. ``base`` is the ordered stage backbone; the planner then
# tailors it with the detected capabilities.
_WORKFLOWS: dict[str, dict] = {
    "documentary": {"name": "documentary", "base": ["research", "script", "scene", "assets", "audio", "timeline", "review", "export"]},
    "tutorial":    {"name": "tutorial",    "base": ["research", "script", "scene", "assets", "graphics", "audio", "timeline", "review", "export"]},
    "shorts":      {"name": "shorts",      "base": ["script", "scene", "assets", "audio", "timeline", "review", "export"]},
    "podcast":     {"name": "podcast",     "base": ["research", "script", "audio", "timeline", "review", "export"]},
    "product_review": {"name": "product_review", "base": ["research", "script", "scene", "assets", "graphics", "audio", "timeline", "review", "export"]},
    "educational": {"name": "educational", "base": ["research", "script", "scene", "assets", "graphics", "audio", "timeline", "review", "export"]},
    "news":        {"name": "news",        "base": ["research", "script", "scene", "assets", "graphics", "audio", "timeline", "review", "export"]},
    "history":     {"name": "history",     "base": ["research", "script", "scene", "assets", "audio", "timeline", "review", "export"]},
    "animation":   {"name": "animation",   "base": ["script", "scene", "graphics", "audio", "timeline", "review", "export"]},
    # aliases the interpreter may still emit
    "explainer":   {"name": "educational", "base": ["research", "script", "scene", "assets", "graphics", "audio", "timeline", "review", "export"]},
    "ranking":     {"name": "ranking_countdown", "base": ["research", "script", "scene", "assets", "graphics", "audio", "timeline", "review", "export"]},
    "story":       {"name": "narrative_story", "base": ["research", "script", "scene", "assets", "audio", "timeline", "review", "export"]},
    "ad":          {"name": "short_ad",    "base": ["script", "scene", "assets", "audio", "timeline", "review", "export"]},
}

# stages that may run at the same time (1.6 Parallel Execution)
_PARALLEL = [["image_search", "video_search", "music_search", "graphics"], ["audio", "subtitle"]]


class WorkflowPlanner:
    def __init__(self, llm=None) -> None:
        self.llm = llm

    # 5.4 — Estimate Complexity
    def estimate_complexity(self, brief: ProductionBrief) -> Complexity:
        factors: list[str] = []
        score = 0.0
        if brief.duration >= 600:
            score += 0.5; factors.append("long-form (10 min+)")
        elif brief.duration >= 180:
            score += 0.3; factors.append("mid-length (3-10 min)")
        else:
            score += 0.1; factors.append("short (<3 min)")
        if brief.video_type in ("ranking", "explainer", "educational", "tutorial", "news"):
            score += 0.2; factors.append(f"{brief.video_type} needs motion graphics")
        if brief.video_type in ("documentary", "history", "story"):
            score += 0.15; factors.append("research-heavy")
        if len(brief.topic.split()) >= 4:
            score += 0.1; factors.append("detailed topic")
        score = min(1.0, score)
        level = (
            ComplexityLevel.COMPLEX if score >= 0.66
            else ComplexityLevel.MODERATE if score >= 0.33
            else ComplexityLevel.SIMPLE
        )
        est_scenes = max(3, int(brief.duration / 6))
        return Complexity(
            level=level, score=round(score, 2), factors=factors,
            estimated_tasks=8 + (est_scenes // 4),
            estimated_minutes=round(2 + score * 12, 1),
        )

    # 5.9 — Choose Workflow (tailored by capabilities, 5.8)
    def choose_workflow(
        self,
        brief: ProductionBrief,
        complexity: Complexity,
        capabilities: Optional[RequiredCapabilities] = None,
    ) -> WorkflowChoice:
        tpl = _WORKFLOWS.get(brief.video_type, _WORKFLOWS["documentary"])
        stages = list(tpl["base"])
        caps = capabilities or RequiredCapabilities()

        # tailor to capabilities
        if not caps.research and "research" in stages:
            stages.remove("research")
        if caps.fact_checking and "research" in stages and "fact_check" not in stages:
            stages.insert(stages.index("research") + 1, "fact_check")
        if caps.motion_graphics and "graphics" not in stages:
            # add graphics right before timeline
            stages.insert(stages.index("timeline"), "graphics")
        if not caps.motion_graphics and "graphics" in stages:
            stages.remove("graphics")
        # a simple/short project can skip dedicated research (unless factual)
        if complexity.level == ComplexityLevel.SIMPLE and not caps.fact_checking and "research" in stages:
            stages.remove("research")

        return WorkflowChoice(
            name=tpl["name"],
            stages=stages,
            parallel_groups=[list(g) for g in _PARALLEL],
        )
