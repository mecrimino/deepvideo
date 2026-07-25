"""
Script Agent (Ch10) — the storytelling engine.

Built from scratch per Ch10 (folder layout 10.18) with tools.md tech: a
**LangGraph** multi-pass workflow (10.12/10.17) over **Pydantic** models, driven
by **LLM + LangChain-core** for hooks/narration, with **Loguru** logs. Converts a
verified research package into engaging, fact-protected (10.14), scene-annotated
narration (10.10) for the Scene Planner — it never invents facts.
"""

from core.agents.script.agent import ScriptAgent
from core.agents.script.models import (
    ScriptInput,
    ScriptOutput,
    ScriptSection,
    SceneScript,
)

__all__ = ["ScriptAgent", "ScriptInput", "ScriptOutput", "ScriptSection", "SceneScript"]
