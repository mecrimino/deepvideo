"""
Timeline models (15.4/15.6/15.17/15.21).

The Timeline Agent's output is the shared :class:`Timeline` (the frontend
editor's data model) so it round-trips to the UI and the renderer unchanged.
This module adds the build input, the professional track layout (15.6), audio
ducking (15.12), and the hierarchical project model (15.21).
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

# shared editor contract
from core.schemas.edl import (  # noqa: F401
    CaptionCue,
    ClipAsset,
    Timeline,
    TimelineClip,
    TimeRange,
    Track,
)
from core.schemas.production import Scene


# 15.6 — professional track layout. Each maps to a shared TrackKind.
class TrackSpec(BaseModel):
    key: str        # V1, V2, V3, V4, A1, A2, A3, A4, CC
    name: str
    kind: Literal["video", "overlay", "audio", "captions"]


TRACK_LAYOUT: list[TrackSpec] = [
    TrackSpec(key="V1", name="V1 · Main Footage", kind="video"),
    TrackSpec(key="V2", name="V2 · B-roll", kind="video"),
    TrackSpec(key="V3", name="V3 · Motion Graphics", kind="overlay"),
    TrackSpec(key="V4", name="V4 · Titles", kind="overlay"),
    TrackSpec(key="A1", name="A1 · Voice", kind="audio"),
    TrackSpec(key="A2", name="A2 · Music", kind="audio"),
    TrackSpec(key="A3", name="A3 · Sound Effects", kind="audio"),
    TrackSpec(key="A4", name="A4 · Ambient", kind="audio"),
    TrackSpec(key="CC", name="Captions", kind="captions"),
]


class DuckRegion(BaseModel):
    """15.12 — lower music while narration plays."""

    startSec: float
    endSec: float
    gain: float = 0.2  # music level during speech (vs 1.0 idle)


class SoundEffect(BaseModel):
    """15.13 — an sfx cue synced to a visual/narration event."""

    name: str
    atSec: float
    path: str = ""


class TimelineBuildInput(BaseModel):
    scenes: list[Scene] = Field(default_factory=list)
    assets_by_scene: dict[int, str] = Field(default_factory=dict)   # scene_id -> asset id
    assets: dict[str, ClipAsset] = Field(default_factory=dict)      # asset id -> ClipAsset
    captions: list[CaptionCue] = Field(default_factory=list)
    audio_path: Optional[str] = None
    music_path: Optional[str] = None
    sfx: list[SoundEffect] = Field(default_factory=list)
    fps: float = 30
    width: int = 1920
    height: int = 1080


# --------------------------------------------------------------------------- #
# Hierarchical project model (15.21)
# --------------------------------------------------------------------------- #
class HClip(BaseModel):
    kind: str            # video | image | audio | graphics
    ref: str             # asset id / clip id
    start: float
    end: float


class HScene(BaseModel):
    scene_id: int
    title: str = ""
    clips: list[HClip] = Field(default_factory=list)


class HSequence(BaseModel):
    title: str
    scenes: list[HScene] = Field(default_factory=list)


class HProject(BaseModel):
    title: str
    sequences: list[HSequence] = Field(default_factory=list)


class TimelineResult(BaseModel):
    timeline: Timeline
    hierarchical: Optional[HProject] = None
    duration: float = 0.0
    duck_regions: list[DuckRegion] = Field(default_factory=list)
    status: str = "success"
