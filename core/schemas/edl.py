"""
EDL / timeline domain model — pydantic mirror of ``shared/types/edl.ts``.

Conventions (kept identical to the TS side):
  - all times are SECONDS (float) on the project clock;
  - intervals are half-open ``[startSec, endSec)``;
  - ids are opaque strings.

Field names use the TS camelCase spelling so JSON round-trips through the Node
gateway to the frontend editor without any remapping.
"""

from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel, Field


class TimeRange(BaseModel):
    startSec: float
    endSec: float

    @property
    def duration(self) -> float:
        return max(0.0, self.endSec - self.startSec)


class Word(BaseModel):
    text: str
    startSec: float
    endSec: float
    confidence: Optional[float] = None


class Transcript(BaseModel):
    text: str
    words: list[Word] = Field(default_factory=list)
    language: str = "en"
    durationSec: float = 0.0


class BeatQueries(BaseModel):
    said: str
    shown: str
    keywords: list[str] = Field(default_factory=list)


class Beat(BaseModel):
    id: str
    text: str
    range: TimeRange
    queries: Optional[BeatQueries] = None
    # Planned visual treatment (Ch11 scene planning), decided BEFORE retrieval:
    # stock_video | stock_image | ai_image | motion_graphics
    visual: Optional[str] = None


class ClipAsset(BaseModel):
    id: str
    path: str
    durationSec: float
    width: int
    height: int
    fps: Optional[float] = None
    tags: list[str] = Field(default_factory=list)
    thumbPath: Optional[str] = None
    source: Literal["user", "stock"] = "stock"
    license: Optional[str] = None


class GenerationSlot(BaseModel):
    id: str
    beatId: str
    prompt: str
    durationSec: float
    status: Literal["pending", "generating", "done", "failed"] = "pending"
    assetId: Optional[str] = None


class AssetClipSource(BaseModel):
    kind: Literal["asset"] = "asset"
    assetId: str
    inSec: float
    outSec: float


class GenerateClipSource(BaseModel):
    kind: Literal["generate"] = "generate"
    slot: GenerationSlot


ClipSource = Union[AssetClipSource, GenerateClipSource]


class TimelineClip(BaseModel):
    id: str
    beatId: Optional[str] = None
    source: ClipSource
    range: TimeRange
    label: Optional[str] = None
    review: Optional[bool] = None
    matchScore: Optional[float] = None
    # Look preset applied to this clip: `lookId` labels it in the editor,
    # `look` is the ffmpeg filter chain the exporter appends.
    lookId: Optional[str] = None
    look: Optional[str] = None
    # Editing Lab recipe this clip was composed from (preset id + control
    # values), so the editor can re-render the same shot with new settings.
    shotSpec: Optional[dict] = None
    # Playback gain for audio-track clips (1.0 = unity).
    gain: Optional[float] = None


TrackKind = Literal["video", "overlay", "audio", "captions"]


class Track(BaseModel):
    id: str
    kind: TrackKind
    name: str
    clips: list[TimelineClip] = Field(default_factory=list)
    muted: Optional[bool] = None
    locked: Optional[bool] = None


class CaptionCue(BaseModel):
    id: str
    text: str
    range: TimeRange


class Timeline(BaseModel):
    id: str
    fps: float = 30
    width: int = 1920
    height: int = 1080
    durationSec: float = 0.0
    audioPath: Optional[str] = None
    tracks: list[Track] = Field(default_factory=list)
    captions: list[CaptionCue] = Field(default_factory=list)


class Project(BaseModel):
    id: str
    title: str
    createdAt: str
    updatedAt: str
    timeline: Timeline
    transcript: Optional[Transcript] = None
    beats: Optional[list[Beat]] = None
