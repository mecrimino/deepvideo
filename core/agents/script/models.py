"""
Script Agent data models (10.3/10.4/10.15).

Inputs describe the project (knowledge package + duration/audience/style); outputs
are structured scenes + narration the Scene Planner consumes directly. The
:class:`ScriptOutput` exposes ``full_text`` (the assembled voice script) so
existing callers keep working.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

from core.schemas.production import KnowledgePackage  # 9.12 input contract


class ScriptInput(BaseModel):
    knowledge_package: KnowledgePackage
    target_duration: float = 600.0
    audience: str = "general"          # children | general | expert
    language: str = "English"
    style: str = "cinematic documentary"
    platform: str = "YouTube"


class SceneScript(BaseModel):
    """10.15 — a structured scene for downstream agents."""

    scene_id: int
    title: str = ""
    narration: str = ""
    visual_goal: str = ""              # 10.10 visual intent
    duration: float = 5.0
    emotion: str = "neutral"
    importance: Literal["low", "medium", "high"] = "medium"


class ScriptSection(BaseModel):
    """A narrative beat (10.6): hook/background/problem/discovery/climax/conclusion."""

    kind: str
    title: str = ""
    narration: str = ""
    target_duration: float = 0.0
    scenes: list[SceneScript] = Field(default_factory=list)


class ScriptOutput(BaseModel):
    """10.4 — richer than plain narration."""

    topic: str
    title: str = ""
    hook: str = ""
    outline: list[str] = Field(default_factory=list)
    chapters: list[ScriptSection] = Field(default_factory=list)
    scenes: list[SceneScript] = Field(default_factory=list)
    visual_notes: list[str] = Field(default_factory=list)
    citations: list[str] = Field(default_factory=list)
    voice_script: str = ""
    estimated_duration: float = 0.0
    status: str = "success"
    review_score: int = 0
    unsupported_claims: list[str] = Field(default_factory=list)

    @property
    def full_text(self) -> str:
        if self.voice_script:
            return self.voice_script
        parts = [self.hook] + [c.narration for c in self.chapters]
        return "\n\n".join(p.strip() for p in parts if p and p.strip())
