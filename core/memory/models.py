"""
Memory records (7.18) — the typed shapes every memory operation uses.

A :class:`MemoryRecord` is the generic unit stored in the vector + SQLite backing.
The typed models (Episode, Preference, AssetMemory, Procedure) are convenience
structures the typed-memory facades serialize into records, mirroring the human
memory forms in 7.2.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

from core.utils.ids import new_id, now_iso


class MemoryKind(str, Enum):
    WORKING = "working"        # 7.4
    LONG_TERM = "long_term"    # 7.5
    EPISODIC = "episodic"      # 7.6
    SEMANTIC = "semantic"      # 7.7
    PROCEDURAL = "procedural"  # 7.8
    PREFERENCE = "preference"  # 7.9
    ASSET = "asset"            # 7.10


class MemoryRecord(BaseModel):
    id: str = Field(default_factory=lambda: new_id("mem_"))
    kind: MemoryKind = MemoryKind.LONG_TERM
    scope: str = "global"                 # project id / "global" / "preferences" (7.19 privacy)
    text: str = ""                        # the searchable content
    metadata: dict[str, Any] = Field(default_factory=dict)
    rating: float = 0.5                   # user rating 0..1 (7.14)
    confidence: float = 0.5               # 7.14
    uses: int = 0                         # usage frequency (7.14)
    archived: bool = False                # 7.15 (compressed → original archived)
    created_at: float = 0.0
    updated_at: float = 0.0
    created_iso: str = Field(default_factory=now_iso)


class RankFactors(BaseModel):
    """7.14 — the factors that combine into an overall score."""

    similarity: float = 0.0
    recency: float = 0.0
    rating: float = 0.0
    confidence: float = 0.0
    usage: float = 0.0
    overall: float = 0.0


class MemoryHit(BaseModel):
    id: str
    kind: str
    text: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    score: float = 0.0
    similarity: float = 0.0
    factors: Optional[RankFactors] = None


# --------------------------------------------------------------------------- #
# Typed memory structures (7.6 / 7.8 / 7.9 / 7.10)
# --------------------------------------------------------------------------- #
class Episode(BaseModel):
    project_id: str
    topic: str
    problems: list[str] = Field(default_factory=list)
    solution: str = ""
    result_rating: float = 0.5

    def to_text(self) -> str:
        probs = "; ".join(self.problems) or "none"
        return (
            f"Project {self.project_id} — {self.topic}. Problems: {probs}. "
            f"Solution: {self.solution or 'n/a'}. Result: {self.result_rating:.2f}/1.0."
        )


class Preference(BaseModel):
    key: str          # e.g. "voice", "subtitle_color", "transition", "music"
    value: str        # e.g. "ElevenLabs Voice A", "yellow", "fade", "cinematic"

    def to_text(self) -> str:
        return f"Preferred {self.key}: {self.value}"


class AssetMemory(BaseModel):
    asset_id: str
    source: str = ""            # pexels / pixabay / user / generated
    license: str = ""
    tags: list[str] = Field(default_factory=list)
    scenes_used: list[int] = Field(default_factory=list)
    quality_score: float = 0.0
    path: str = ""

    def to_text(self) -> str:
        return f"Asset {self.asset_id} ({self.source}) tags: {', '.join(self.tags)}"


class Procedure(BaseModel):
    name: str          # "render 4K", "normalize audio", "create lower thirds"
    steps: list[str] = Field(default_factory=list)

    def to_text(self) -> str:
        return f"How to {self.name}: " + " -> ".join(self.steps)
