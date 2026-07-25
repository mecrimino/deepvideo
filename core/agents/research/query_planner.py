"""
Question Generation (9.6) — ask questions before searching.

Instead of searching the bare topic, the agent generates a research plan: a set
of specific, categorised questions (who/why/history/technical/recent/future).
The number scales with the target depth/duration. LLM-driven, with a solid
deterministic template fallback.
"""

from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage

from core.agents.research.models import ResearchGoal, ResearchQuestion
from core.providers.llm.router import LLMUnavailable
from core.utils.logging import get_logger

log = get_logger("research.questions")

_CATEGORIES = ("overview", "history", "technical", "people", "recent", "future")


class QueryPlanner:
    def __init__(self, llm) -> None:
        self.llm = llm

    async def generate(self, goal: ResearchGoal) -> list[ResearchQuestion]:
        n = 20 if goal.target_duration >= 600 else 10 if goal.target_duration >= 180 else 6
        if self.llm.available:
            try:
                data = await self.llm.json(
                    SystemMessage(content="You are a documentary researcher planning an investigation. STRICT JSON.").content,
                    HumanMessage(content=(
                        f'Topic: "{goal.topic}" (audience {goal.audience}, depth {goal.depth}).\n'
                        f"Generate {n} specific research questions as a JSON array of "
                        '{"question": str, "category": '
                        '"overview|history|technical|people|recent|future"}.'
                    )).content,
                    effort="fast", max_tokens=1200,
                )
                if isinstance(data, list) and data:
                    return [
                        ResearchQuestion(id=i + 1, question=str(q.get("question", "")).strip(),
                                         category=str(q.get("category", "general")))
                        for i, q in enumerate(data) if isinstance(q, dict) and q.get("question")
                    ][:n]
            except LLMUnavailable:
                pass
            except Exception as exc:
                log.warning("question generation failed: %s", exc)
        return self._template(goal, n)

    def _template(self, goal: ResearchGoal, n: int) -> list[ResearchQuestion]:
        t = goal.topic
        base = [
            (f"What is {t}?", "overview"),
            (f"Why is {t} important?", "overview"),
            (f"What is the history of {t}?", "history"),
            (f"How does {t} work technically?", "technical"),
            (f"What are the key specifications of {t}?", "technical"),
            (f"Who are the key people behind {t}?", "people"),
            (f"What are recent developments in {t}?", "recent"),
            (f"What are the major milestones of {t}?", "history"),
            (f"What challenges or failures involved {t}?", "history"),
            (f"What is the future of {t}?", "future"),
        ]
        return [ResearchQuestion(id=i + 1, question=q, category=c) for i, (q, c) in enumerate(base[:n])]
