"""ScriptState — carried through the 10.17 script workflow (LangGraph)."""

from __future__ import annotations

from typing import TypedDict

from core.agents.script.models import ScriptInput, ScriptOutput, ScriptSection


class ScriptState(TypedDict, total=False):
    inp: ScriptInput
    sections: list[ScriptSection]
    outline: list[str]
    facts_by_section: list[list[str]]
    hook: str
    output: ScriptOutput
    revisions: int
