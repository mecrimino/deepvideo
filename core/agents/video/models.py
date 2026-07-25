"""
Video Search data models (13.9/13.20).

Unlike images, videos are evaluated at the **shot** level: a candidate video is
split into shots, each with its own camera/quality/semantic metadata, and the
best shot is trimmed into a timeline-ready clip.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from core.utils.ids import new_id


class VideoRequest(BaseModel):
    """13.20 — a scene's video requirement from the Scene Planner."""

    scene_id: int = 0
    visual_goal: str = ""
    keywords: list[str] = Field(default_factory=list)
    style: str = "cinematic"
    duration: float = 6.0             # desired clip length (seconds)
    motion: str = ""                  # preferred camera motion (13.11), optional
    minimum_resolution: str = "1920x1080"


class Shot(BaseModel):
    """13.8/13.9 — one shot inside a video, the searchable unit."""

    shot_id: int
    video_id: str = ""
    start: float = 0.0
    end: float = 0.0
    camera: str = "static"            # 13.11
    objects: list[str] = Field(default_factory=list)  # 13.10 (optional YOLO)
    quality: float = 0.0              # 13.12
    semantic: float = 0.0             # 13.13
    motion_score: float = 0.0
    keyframe: str = ""

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)


class VideoCandidate(BaseModel):
    """13.4 — a candidate video (before shot analysis)."""

    video_id: str = Field(default_factory=lambda: new_id("vid_"))
    provider: str = ""
    query: str = ""
    url: str = ""
    thumb_url: str = ""
    width: int = 0
    height: int = 0
    durationSec: float = 0.0
    tags: list[str] = Field(default_factory=list)
    license: str = "unknown"
    license_score: float = 0.0
    local_path: str = ""
    shots: list[Shot] = Field(default_factory=list)
    best_shot: Optional[Shot] = None
    semantic: float = 0.0
    final_score: float = 0.0


class ClipResult(BaseModel):
    """13.15/13.20 — a trimmed, timeline-ready clip."""

    video_id: str = ""
    provider: str = ""
    url: str = ""
    local_path: str = ""
    start: float = 0.0
    end: float = 0.0
    camera: str = "static"
    quality: float = 0.0
    final_score: float = 0.0
    width: int = 0
    height: int = 0


class VideoResult(BaseModel):
    scene_id: int = 0
    clip: Optional[ClipResult] = None
    alternatives: list[ClipResult] = Field(default_factory=list)
    status: str = "success"
    pooled: int = 0
