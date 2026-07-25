"""
Structured data contracts for the whole core (Ch2.12 / Ch1.6).

Agents exchange these typed objects, never free-form paragraphs. The EDL/timeline
models are a 1:1 mirror of ``shared/types/edl.ts`` so the Node gateway can pass
timelines straight through to the frontend editor.
"""

from core.schemas.edl import (
    Beat,
    BeatQueries,
    CaptionCue,
    ClipAsset,
    ClipSource,
    GenerationSlot,
    Project,
    TimeRange,
    Timeline,
    TimelineClip,
    Track,
    Transcript,
    Word,
)
from core.schemas.pipeline import (
    MatchCandidate,
    PickDecision,
    PipelineRun,
    PipelineSettings,
    RunProgressInfo,
    SegmentProgress,
    StageResult,
)
from core.schemas.production import (
    Fact,
    KnowledgePackage,
    ProductionBrief,
    ReviewIssue,
    ReviewReport,
    Scene,
    ScenePlan,
    ScriptDraft,
    TaskNode,
    TaskPlan,
)

__all__ = [
    "TimeRange", "Word", "Transcript", "Beat", "BeatQueries", "ClipAsset",
    "GenerationSlot", "ClipSource", "TimelineClip", "Track", "CaptionCue",
    "Timeline", "Project", "MatchCandidate", "PickDecision", "StageResult",
    "SegmentProgress", "RunProgressInfo", "PipelineRun", "PipelineSettings",
    "KnowledgePackage", "Fact", "ScriptDraft", "Scene", "ScenePlan",
    "TaskNode", "TaskPlan", "ReviewIssue", "ReviewReport", "ProductionBrief",
]
