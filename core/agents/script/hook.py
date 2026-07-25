"""
Hook Generator (10.7) — the first 5–30 seconds decide if viewers stay.

Creates an opening using a surprising fact, mystery, question, contradiction,
future-promise or emotional angle — grounded in the research so it is punchy but
true. LLM when available; otherwise a pattern applied to the highest-confidence
fact.
"""

from __future__ import annotations

from core.agents.script.models import ScriptInput
from core.agents.script.prompts import HOOK_SYSTEM, audience_style
from core.providers.llm.router import LLMUnavailable
from core.utils.logging import get_logger

log = get_logger("script.hook")


class HookGenerator:
    def __init__(self, llm) -> None:
        self.llm = llm

    async def generate(self, inp: ScriptInput) -> str:
        pkg = inp.knowledge_package
        if self.llm.available and pkg.key_facts:
            try:
                facts = "\n".join(f"- {f.subject} {f.predicate} {f.object}" for f in pkg.key_facts[:8])
                hook = await self.llm.chat(
                    HOOK_SYSTEM,
                    f"Topic: {pkg.topic}\nAudience style: {audience_style(inp.audience)}\n"
                    f"Facts:\n{facts}\n\nWrite ONE hook sentence.",
                    effort="smart", max_tokens=120,
                )
                if hook.strip():
                    return hook.strip().strip('"')
            except LLMUnavailable:
                pass
            except Exception as exc:
                log.warning("hook generation failed: %s", exc)
        return self._template(inp)

    def _template(self, inp: ScriptInput) -> str:
        pkg = inp.knowledge_package
        if pkg.key_facts:
            f = pkg.key_facts[0]
            return f"What if everything you knew about {pkg.topic} started with one fact: {f.subject} {f.predicate} {f.object}?"
        return f"What makes {pkg.topic} so remarkable? Let's find out."
