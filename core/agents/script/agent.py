"""
Script Agent (Ch10) — the storytelling engine.

Turns a verified :class:`KnowledgePackage` into an engaging, factually accurate,
scene-annotated script (10.1). It never searches — research is already done
(10.3) — and never invents facts (10.14). Multiple specialised modules
collaborate through a LangGraph workflow (10.5/10.17) with multi-pass refinement
(10.12).

Built from scratch per Ch10 (folder layout 10.18) with tools.md tech: LangGraph +
LLM + LangChain-core + Pydantic + Loguru.
"""

from __future__ import annotations

from typing import Optional

from core.agents.base import AgentContext, BaseAgent
from core.agents.script.draft import DraftGenerator
from core.agents.script.graph import build_script_graph
from core.agents.script.hook import HookGenerator
from core.agents.script.models import KnowledgePackage, ScriptInput, ScriptOutput
from core.agents.script.outline import OutlineBuilder
from core.agents.script.planner import NarrativePlanner
from core.agents.script.reviewer import ScriptReviewer
from core.agents.script.state import ScriptState
from core.agents.script.timing import TimingAnalyzer
from core.agents.script.validator import FactValidator


class ScriptAgent(BaseAgent[KnowledgePackage, ScriptOutput]):
    name = "script"

    def __init__(self, ctx: AgentContext) -> None:
        super().__init__(ctx)
        self.max_revisions = 1
        self.planner = NarrativePlanner()
        self.outline = OutlineBuilder()
        self.hook = HookGenerator(self.llm)
        self.draft = DraftGenerator(self.llm)
        self.timing = TimingAnalyzer()
        self.validator = FactValidator()
        self.reviewer = ScriptReviewer(threshold=ctx.settings.review_threshold - 20)  # scripts pass ~70
        self._graph = build_script_graph(self)

    async def run(self, knowledge: KnowledgePackage) -> ScriptOutput:
        inp = self._input_from_context(knowledge)
        return await self.script(inp)

    async def script(self, inp: ScriptInput) -> ScriptOutput:
        self.ctx.emit("script.started", topic=inp.knowledge_package.topic)
        state: ScriptState = {"inp": inp, "revisions": 0}
        final: ScriptState = await self._graph.ainvoke(state)
        output = final["output"]
        wm = self.ctx.memory.working
        wm.set("script", output.model_dump())
        wm.set("scriptText", output.full_text)
        return output

    def _input_from_context(self, knowledge: KnowledgePackage) -> ScriptInput:
        wm = self.ctx.memory.working
        brief = wm.get("brief", {}) if isinstance(wm.get("brief"), dict) else {}
        return ScriptInput(
            knowledge_package=knowledge,
            target_duration=float(wm.get("target_seconds", brief.get("duration", 600)) or 600),
            audience=str(brief.get("audience", "general")),
            style=str(brief.get("style", "cinematic documentary")),
            language=str(brief.get("language", "English")),
        )
