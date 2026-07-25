"""
Production-stage contracts produced/consumed by the specialist agents.

  - Research  → :class:`KnowledgePackage`  (Ch9.12)
  - Script    → :class:`ScriptDraft`       (Ch6/Ch1)
  - Planner   → :class:`TaskPlan`          (Ch6.14)
  - Scene     → :class:`ScenePlan`         (Ch11.5 / 11.17)
  - Reviewer  → :class:`ReviewReport`      (Ch18.16)
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# --------------------------------------------------------------------------- #
# Director (Ch5) — interpreted user goal
# --------------------------------------------------------------------------- #


class ProductionBrief(BaseModel):
    topic: str
    video_type: str = "documentary"  # documentary | explainer | ranking | story | ad
    duration: float = 90.0           # seconds
    style: str = "cinematic"
    language: str = "English"
    niche: Optional[str] = None


# --------------------------------------------------------------------------- #
# Research (Ch9)
# --------------------------------------------------------------------------- #


class Fact(BaseModel):
    subject: str
    predicate: str
    object: str
    confidence: float = 0.5
    sources: list[str] = Field(default_factory=list)


class KnowledgePackage(BaseModel):
    topic: str
    summary: str = ""
    key_facts: list[Fact] = Field(default_factory=list)
    timeline: list[str] = Field(default_factory=list)
    technical_specs: list[str] = Field(default_factory=list)
    important_people: list[str] = Field(default_factory=list)
    citations: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    confidence: float = 0.5


# --------------------------------------------------------------------------- #
# Script (Ch1 / Ch6)
# --------------------------------------------------------------------------- #


class ScriptSection(BaseModel):
    kind: Literal["hook", "intro", "body", "ending"]
    text: str


class ScriptDraft(BaseModel):
    topic: str
    title: str = ""
    sections: list[ScriptSection] = Field(default_factory=list)

    @property
    def full_text(self) -> str:
        return "\n\n".join(s.text.strip() for s in self.sections if s.text.strip())


# --------------------------------------------------------------------------- #
# Planner (Ch6)
# --------------------------------------------------------------------------- #


class TaskNode(BaseModel):
    id: int
    name: str
    agent: str = ""
    priority: Literal["low", "medium", "high"] = "medium"
    depends_on: list[int] = Field(default_factory=list)
    status: Literal["pending", "running", "done", "failed"] = "pending"


class TaskPlan(BaseModel):
    project: str
    tasks: list[TaskNode] = Field(default_factory=list)
    checkpoints: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Scene planner (Ch11)
# --------------------------------------------------------------------------- #

MediaType = Literal["video", "image", "motion_graphics"]


class MediaRequirement(BaseModel):
    type: MediaType = "video"
    keywords: list[str] = Field(default_factory=list)


class GraphicElement(BaseModel):
    type: str  # title, lower_third, stat, map, timeline, callout ...
    text: str = ""
    start: float = 0.0
    end: float = 0.0
    animation: str = "fade"


class Scene(BaseModel):
    scene_id: int
    title: str = ""
    narration: str = ""
    duration: float = 5.0
    emotion: str = "neutral"
    importance: Literal["low", "medium", "high"] = "medium"
    visual_goal: str = ""
    media: MediaRequirement = Field(default_factory=MediaRequirement)
    camera_motion: str = "static"
    transition: str = "hard_cut"
    overlays: list[str] = Field(default_factory=list)
    graphics: list[GraphicElement] = Field(default_factory=list)
    # populated by the scene splitter so the Timeline agent can align to audio
    range_start: float = 0.0
    range_end: float = 0.0


class ScenePlan(BaseModel):
    topic: str
    scenes: list[Scene] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Reviewer (Ch18)
# --------------------------------------------------------------------------- #

ReviewCategory = Literal[
    "visual", "audio", "story", "fact", "timeline", "motion", "accessibility"
]


class ReviewIssue(BaseModel):
    category: ReviewCategory
    scene: Optional[int] = None
    agent: str = ""
    priority: Literal["low", "medium", "high"] = "medium"
    action: str = ""


class ReviewReport(BaseModel):
    overall_score: int = 0
    passed: bool = False
    category_scores: dict[str, int] = Field(default_factory=dict)
    recommendations: list[ReviewIssue] = Field(default_factory=list)
