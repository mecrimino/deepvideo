"""
Timeline Agent (Ch15) — the master editor.

Built from scratch per Ch15 (folder layout 15.19) with tools.md tech: the shared
**Pydantic** Timeline (the editor's data model), **OpenTimelineIO** export for
professional editors (15.18), FFmpeg-ready trim points, Loguru. Assembles tracks,
clips, narration, subtitles, music (with ducking, 15.12), sfx, transitions and a
hierarchical project (15.21) into one coherent, editable timeline.
"""

from core.agents.timeline.agent import TimelineAgent
from core.agents.timeline.models import (
    HProject,
    SoundEffect,
    TimelineBuildInput,
    TimelineResult,
)

__all__ = ["TimelineAgent", "TimelineBuildInput", "TimelineResult", "HProject", "SoundEffect"]
