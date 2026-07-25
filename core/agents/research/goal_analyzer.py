"""
Goal Understanding (9.5) — turn a request into a research goal.

    "Create a documentary about SpaceX" →
    {topic, type, audience, depth, target_duration}

Research requirements depend on the project goals: an expert explainer needs
deeper, more technical evidence than a general-audience short.
"""

from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage

from core.agents.research.models import ResearchGoal
from core.providers.llm.router import LLMUnavailable
from core.utils.logging import get_logger

log = get_logger("research.goal")


class GoalAnalyzer:
    def __init__(self, llm) -> None:
        self.llm = llm

    async def analyze(self, topic: str, *, hint: dict | None = None) -> ResearchGoal:
        hint = hint or {}
        if self.llm.available and not hint:
            try:
                data = await self.llm.json(
                    SystemMessage(content="You scope a research goal. STRICT JSON.").content,
                    HumanMessage(content=(
                        f'Topic/request: "{topic}"\nReturn JSON: {{"topic": str, "type": str, '
                        '"audience": "children|general|expert", '
                        '"depth": "basic|intermediate|expert", "target_duration": <seconds int>}.'
                    )).content,
                    effort="fast",
                )
                if isinstance(data, dict) and data.get("topic"):
                    return ResearchGoal(
                        topic=str(data["topic"]), type=str(data.get("type", "documentary")),
                        audience=str(data.get("audience", "general")),
                        depth=str(data.get("depth", "intermediate")),  # type: ignore[arg-type]
                        target_duration=float(data.get("target_duration", 600) or 600),
                    )
            except LLMUnavailable:
                pass
            except Exception as exc:
                log.warning("goal analysis failed: %s", exc)
        return ResearchGoal(
            topic=hint.get("topic", topic),
            type=hint.get("type", "documentary"),
            audience=hint.get("audience", "general"),
            depth=hint.get("depth", "intermediate"),
            target_duration=float(hint.get("target_duration", 600) or 600),
        )
