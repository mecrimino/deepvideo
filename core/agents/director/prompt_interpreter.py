"""
Prompt Interpreter (5.6) — free-form request → structured :class:`ProductionBrief`.

    Input:  "Create a YouTube documentary about Tesla."
    Output: {"video_type":"documentary","topic":"Tesla",
             "duration":600,"style":"cinematic","language":"English"}

Uses the LLM (OpenRouter/Groq via the router) with **LangChain-core** message
types for the prompt, and a deterministic heuristic fallback so the Director
still interprets a goal with zero keys configured.
"""

from __future__ import annotations

import re

from langchain_core.messages import HumanMessage, SystemMessage

from core.agents.director.models import ProductionBrief
from core.providers.llm.router import LLMUnavailable
from core.utils.logging import get_logger

_SYSTEM = (
    "You interpret a user's video request into a structured production brief. "
    "Return STRICT JSON only."
)


class PromptInterpreter:
    def __init__(self, llm) -> None:
        self.llm = llm
        self.log = get_logger("director.interpret")

    async def interpret(self, prompt: str) -> ProductionBrief:
        if self.llm.available:
            try:
                brief = await self._llm_interpret(prompt)
                if brief is not None:
                    return brief
            except LLMUnavailable:
                pass
            except Exception as exc:
                self.log.warning("llm interpret failed, using heuristic: %s", exc)
        return self._heuristic(prompt)

    async def _llm_interpret(self, prompt: str):
        system = SystemMessage(content=_SYSTEM)
        human = HumanMessage(
            content=(
                f'User request: "{prompt}"\n\n'
                'Return JSON: {"topic": str, "video_type": '
                '"documentary|tutorial|shorts|podcast|product_review|educational|'
                'news|history|animation", "duration": <seconds int>, '
                '"style": str, "language": str}.'
            )
        )
        data = await self.llm.json(system.content, human.content, effort="fast")
        if not isinstance(data, dict) or not data.get("topic"):
            return None
        return ProductionBrief(
            topic=str(data["topic"]).strip(),
            video_type=str(data.get("video_type", "documentary")),
            duration=float(data.get("duration", 90) or 90),
            style=str(data.get("style", "cinematic")),
            language=str(data.get("language", "English")),
        )

    # ------------------------------------------------------------------ #
    def _heuristic(self, prompt: str) -> ProductionBrief:
        p = prompt.lower()
        video_type = "documentary"
        if any(w in p for w in ("tutorial", "how to", "how-to", "step by step", "guide")):
            video_type = "tutorial"
        elif any(w in p for w in ("short", "#shorts", "reel", "tiktok")):
            video_type = "shorts"
        elif "podcast" in p:
            video_type = "podcast"
        elif any(w in p for w in ("review", "unboxing", "vs ", "comparison")):
            video_type = "product_review"
        elif any(w in p for w in ("explain", "what is", "educational", "lesson", "how does", "how do")):
            video_type = "educational"
        elif any(w in p for w in ("news", "breaking", "report")):
            video_type = "news"
        elif re.search(r"\bhistory\b|\bhistorical\b|\bevolution of\b", p):
            video_type = "history"
        elif any(w in p for w in ("animation", "animated", "cartoon", "motion graphic")):
            video_type = "animation"
        elif any(w in p for w in ("top ", "ranking", "best ", "countdown")):
            video_type = "educational"  # ranking handled as educational/motion-graphics heavy

        duration = 90.0
        m = re.search(r"(\d+)\s*[-\s]?\s*(min|minute|sec|second)", p)
        if m:
            n = float(m.group(1))
            duration = n * 60 if m.group(2).startswith("min") else n

        topic = prompt.strip()
        # drop trailing "..., 10 minutes, cinematic" style qualifier clauses
        topic = re.sub(
            r",\s*\d+\s*(min|minute|minutes|sec|second|seconds).*$", "", topic, flags=re.I
        )
        topic = re.sub(r"^\s*(make|create|generate|produce|build)\s+", "", topic, flags=re.I)
        topic = re.sub(r"^\s*(a|an|the)\s+", "", topic, flags=re.I)
        topic = re.sub(r"^\s*\d+[-\s]*(min|minute|minutes|sec|second|seconds)\s+", "", topic, flags=re.I)
        # leading platform word (YouTube documentary about …)
        topic = re.sub(r"^\s*(youtube|instagram|tiktok|linkedin|facebook)\s+", "", topic, flags=re.I)
        topic = re.sub(
            r"^\s*(short|long|quick|cinematic|epic)?\s*"
            r"(video|documentary|short|clip|film|explainer|story)\s+"
            r"(about|on|of|covering)?\s*",
            "", topic, flags=re.I,
        )
        topic = re.sub(r"^\s*(about|on|of)\s+", "", topic, flags=re.I).strip(" .,")
        return ProductionBrief(
            topic=topic or prompt.strip(), video_type=video_type, duration=duration
        )
