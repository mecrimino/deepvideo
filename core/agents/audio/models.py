"""
Audio Intelligence models (17.18) — voice specs, music/sfx cues, mix plan.

The :class:`AudioPlan` (music style + ducking regions + per-beat emotion) is the
lightweight contract the pipeline consumes; the richer specs drive TTS, mixing
and the final :class:`AudioMetadata` (17.18).
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class VoiceSpec(BaseModel):
    """17.5 — controls for one narration segment."""

    text: str
    voice: str = "Documentary_Male_01"
    speed: float = 1.0
    pitch: float = 0.0
    emotion: str = "neutral"       # 17.6
    pause_after: float = 0.35      # 17.8
    ssml: str = ""


class DuckRegion(BaseModel):
    startSec: float
    endSec: float
    gain: float = 0.2              # 17.15 music level under speech


class MusicSelection(BaseModel):
    section: str
    style: str
    path: str = ""


class SFXCue(BaseModel):
    event: str
    atSec: float
    path: str = ""


class AudioPlan(BaseModel):
    music_style: str = "cinematic"
    section_music: dict[str, str] = Field(default_factory=dict)   # 17.9
    duck_regions: list[DuckRegion] = Field(default_factory=list)  # 17.15
    voices: list[VoiceSpec] = Field(default_factory=list)         # 17.5/17.6
    sfx: list[SFXCue] = Field(default_factory=list)               # 17.11
    ambience: str = ""                                            # 17.12
    narration_path: Optional[str] = None
    tts_available: bool = False


class AudioMetadata(BaseModel):
    """17.18 / 17.20 — the agent's result."""

    voice: str = "Documentary_Male_01"
    voice_track: str = ""
    music_track: str = ""
    music: str = ""
    effects: list[str] = Field(default_factory=list)
    ambience: str = ""
    duration: float = 0.0
    loudness: str = "-16 LUFS"
    language: str = "English"
    status: str = "success"
