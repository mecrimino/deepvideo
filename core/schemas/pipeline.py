"""
Run / pipeline contracts — pydantic mirror of ``shared/types/pipeline.ts``.

These describe a generation run and the artefacts each stage produces. The
frontend flow/processing screens render them verbatim, so field names match the
TS side exactly.
"""

from __future__ import annotations

from typing import Literal, Optional, Union

from pydantic import BaseModel, Field

from core.schemas.edl import Beat, GenerationSlot, Timeline, Transcript

PipelineStage = Literal["segment", "queries", "retrieve", "rerank", "pick", "history"]
StageStatus = Literal["pending", "running", "done", "failed"]


class MatchCandidate(BaseModel):
    clipId: str
    score: float
    textScore: float = 0.0
    visualScore: float = 0.0
    inSec: Optional[float] = None
    outSec: Optional[float] = None


class RetrievePick(BaseModel):
    beatId: str
    kind: Literal["retrieve"] = "retrieve"
    candidate: MatchCandidate


class GeneratePick(BaseModel):
    beatId: str
    kind: Literal["generate"] = "generate"
    slot: GenerationSlot


PickDecision = Union[RetrievePick, GeneratePick]


class StageResult(BaseModel):
    stage: PipelineStage
    status: StageStatus = "pending"
    startedAt: Optional[str] = None
    finishedAt: Optional[str] = None
    output: Optional[object] = None
    error: Optional[str] = None


class SegmentThumb(BaseModel):
    url: str
    source: str


class SegmentPick(BaseModel):
    source: str
    score: float
    status: Literal["auto", "auto-fallback", "review", "none"]
    thumb: Optional[str] = None


class SegmentProgress(BaseModel):
    beatId: str
    text: str
    keyword: Optional[str] = None
    # Planned visual: stock_video | stock_image | ai_image | motion_graphics
    visual: Optional[str] = None
    pooled: Optional[int] = None
    thumbs: list[SegmentThumb] = Field(default_factory=list)
    pick: Optional[SegmentPick] = None


class RunProgressInfo(BaseModel):
    model: Optional[Literal["mini", "pro"]] = None
    niche: Optional[str] = None
    segments: list[SegmentProgress] = Field(default_factory=list)


class PipelineInput(BaseModel):
    script: Optional[str] = None
    audioPath: Optional[str] = None


class PipelineRun(BaseModel):
    id: str
    createdAt: str
    status: StageStatus = "pending"
    stage: PipelineStage = "segment"
    stages: list[StageResult] = Field(default_factory=list)
    input: PipelineInput = Field(default_factory=PipelineInput)
    transcript: Optional[Transcript] = None
    beats: Optional[list[Beat]] = None
    picks: Optional[list[PickDecision]] = None
    timeline: Optional[Timeline] = None
    progress: Optional[RunProgressInfo] = None


class PipelineSettings(BaseModel):
    retrieveTopK: int = 12
    matchThreshold: float = 0.35
    visualWeight: float = 0.5
    maxBeatSec: float = 6.0
