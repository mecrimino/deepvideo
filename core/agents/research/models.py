"""
Research contracts (9.5/9.6/9.10/9.12) — typed structures the pipeline produces.

The final :class:`KnowledgePackage` and :class:`Fact` are the shared studio
contracts (from ``core.schemas.production``) so the Script Agent consumes the
package directly (9.2/9.12 structured communication). Everything else here is
research-internal.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# shared downstream contract (9.12) — do not redefine
from core.schemas.production import Fact, KnowledgePackage  # noqa: F401

__all__ = ["ResearchGoal", "ResearchQuestion", "SourcedFact", "Contradiction",
           "Fact", "KnowledgePackage"]


class ResearchGoal(BaseModel):
    """9.5 — what the research must satisfy."""

    topic: str
    type: str = "documentary"
    audience: str = "general"
    depth: Literal["basic", "intermediate", "expert"] = "intermediate"
    target_duration: float = 600.0  # seconds


class ResearchQuestion(BaseModel):
    """9.6 — one investigable question + its planned sources (9.7)."""

    id: int
    question: str
    category: str = "general"       # history | technical | recent | people | future ...
    sources: list[str] = Field(default_factory=list)  # 9.7 chosen source types
    answered: bool = False


class SourcedFact(BaseModel):
    """9.9 atomic fact + the evidence supporting it (9.11 confidence factors)."""

    subject: str
    predicate: str
    object: str
    question_id: Optional[int] = None
    source_ids: list[str] = Field(default_factory=list)
    source_titles: list[str] = Field(default_factory=list)
    authority: float = 0.5
    published: str = ""
    confidence: float = 0.5

    def key(self) -> str:
        return f"{self.subject.lower().strip()}|{self.predicate.lower().strip()}"

    def to_fact(self) -> Fact:
        return Fact(subject=self.subject, predicate=self.predicate, object=self.object,
                    confidence=self.confidence, sources=self.source_titles or self.source_ids)


class Contradiction(BaseModel):
    """9.10 — one predicate with conflicting objects across sources."""

    subject: str
    predicate: str
    values: list[str] = Field(default_factory=list)
    chosen: str = ""
    resolved: bool = False
    note: str = ""
