"""
Audio Intelligence Agent (Ch17) — the sound director.

Built from scratch per Ch17 (folder layout 17.19) with tools.md tech: **FFmpeg**
does the real work — cleanup (17.13 afftdn/highpass/compressor/limiter), loudness
normalization (17.14 loudnorm/EBU R128), automatic ducking (17.15
sidechaincompress) and mixing (17.16 amix). Adds emotion-aware narration (17.6),
a pronunciation dictionary (17.7), pauses (17.8), story-based music selection
(17.9), sfx/ambience, multilingual dubbing (17.17) and audio-preference learning
(17.21). Cloud TTS synthesis is honestly gated (no voice key here).
"""

from core.agents.audio.agent import AudioAgent
from core.agents.audio.models import AudioMetadata, AudioPlan, DuckRegion, VoiceSpec

__all__ = ["AudioAgent", "AudioPlan", "AudioMetadata", "VoiceSpec", "DuckRegion"]
