"""
Goal Analyzer (5.6) — turns the brief into a production strategy's intent.

The Director must *understand the user's goal* (5.3) before assigning work: what
are we actually trying to achieve, what does "good" look like, and what does the
Research agent need to find out. Produces a typed :class:`GoalAnalysis`. LLM when
available, deterministic template otherwise.
"""

from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage

import re

from core.agents.director.models import GoalAnalysis, ProductionBrief, RequiredCapabilities
from core.providers.llm.router import LLMUnavailable
from core.utils.logging import get_logger

_SYSTEM = (
    "You are a production director analysing a video goal. Output STRICT JSON."
)


class GoalAnalyzer:
    def __init__(self, llm) -> None:
        self.llm = llm
        self.log = get_logger("director.goal")

    async def analyze(self, brief: ProductionBrief) -> GoalAnalysis:
        if self.llm.available:
            try:
                ga = await self._llm_analyze(brief)
                if ga is not None:
                    return ga
            except LLMUnavailable:
                pass
            except Exception as exc:
                self.log.warning("goal analysis failed, using template: %s", exc)
        return self._template(brief)

    async def _llm_analyze(self, brief: ProductionBrief):
        system = SystemMessage(content=_SYSTEM)
        human = HumanMessage(
            content=(
                f"Brief: {brief.model_dump()}\n\n"
                "Return JSON: {\"objective\": str, \"goals\": [str], "
                "\"requirements\": [str], \"success_criteria\": [str], "
                "\"research_questions\": [str]}. 3-6 items per list."
            )
        )
        data = await self.llm.json(system.content, human.content, effort="fast")
        if not isinstance(data, dict):
            return None
        return GoalAnalysis(
            objective=str(data.get("objective", "")),
            goals=[str(x) for x in (data.get("goals") or [])][:6],
            requirements=[str(x) for x in (data.get("requirements") or [])][:6],
            success_criteria=[str(x) for x in (data.get("success_criteria") or [])][:6],
            research_questions=[str(x) for x in (data.get("research_questions") or [])][:8],
            capabilities=self.detect_capabilities(brief),
        )

    # 5.8 — decide which capabilities the prompt activates (5.5 reasoning)
    def detect_capabilities(self, brief: ProductionBrief) -> RequiredCapabilities:
        topic = brief.topic.lower()
        vtype = brief.video_type.lower()
        caps = RequiredCapabilities()
        # research/fact-checking matter most for factual formats
        caps.research = vtype in ("documentary", "explainer", "news", "history", "educational", "story", "ranking")
        caps.fact_checking = caps.research
        # motion graphics for data/ranking/explainer/educational formats
        caps.motion_graphics = vtype in ("ranking", "explainer", "educational", "news") or bool(
            re.search(r"\b(top \d+|statistic|percent|number|compare|timeline)\b", topic)
        )
        # maps when geography/places are involved
        caps.maps = bool(
            re.search(r"\b(country|countries|world|map|region|border|geography|nation|continent|war)\b", topic)
        )
        # everything narrated needs voice + subtitles + video/image + review
        caps.voice = caps.script = caps.subtitles = caps.review = True
        caps.image_search = caps.video_search = True
        return caps

    def _template(self, brief: ProductionBrief) -> GoalAnalysis:
        topic = brief.topic
        return GoalAnalysis(
            objective=f"Produce a {int(brief.duration)}s {brief.video_type} about {topic}.",
            goals=[
                f"Explain {topic} clearly and accurately",
                f"Hold attention for the full {int(brief.duration)} seconds",
                f"Match a {brief.style} visual style",
            ],
            requirements=[
                "Accurate, sourced facts",
                "Relevant footage for every beat",
                "Clear narration and synchronized captions",
            ],
            success_criteria=[
                "No unmatched or repeated shots",
                "Narration and captions aligned",
                "Passes automated quality review",
            ],
            research_questions=[
                f"What is {topic}?",
                f"Why does {topic} matter?",
                f"Key facts and milestones of {topic}?",
                f"Who are the key people behind {topic}?",
            ],
            capabilities=self.detect_capabilities(brief),
        )
