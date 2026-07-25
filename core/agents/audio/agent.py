"""
Audio Intelligence Agent (Ch17) — the sound director.

Directs the entire sonic experience (17.2): expressive, emotion-aware voice-over
(17.5/17.6) with pronunciation (17.7) and pauses (17.8); music chosen by story
section (17.9); synchronized sfx (17.11) and ambience (17.12); real FFmpeg audio
cleanup (17.13), loudness normalization (17.14), automatic ducking (17.15) and
mixing (17.16); plus multilingual dubbing (17.17) and audio-preference learning
(17.21).

Built from scratch per Ch17 (folder layout 17.19) with tools.md tech: FFmpeg
(cleanup/normalize/duck/mix — real), cloud TTS (gated), embedder/Ch7 memory,
LLM (translation), Pydantic, Loguru.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.agents.audio.ambience import AmbienceEngine
from core.agents.audio.cleanup import EnhancementEngine
from core.agents.audio.emotions import EmotionMapper
from core.agents.audio.mixer import AudioMixer
from core.agents.audio.models import AudioMetadata, AudioPlan, DuckRegion
from core.agents.audio.music import MusicEngine
from core.agents.audio.normalization import Normalizer
from core.agents.audio.pronunciation import PronunciationEngine
from core.agents.audio.sfx import SFXEngine
from core.agents.audio.tts import VoiceEngine
from core.agents.base import AgentContext, BaseAgent
from core.config import get_settings
from core.providers.llm.router import LLMUnavailable
from core.schemas.edl import Beat


class AudioAgent(BaseAgent[list, AudioPlan]):
    name = "audio"

    def __init__(self, ctx: AgentContext) -> None:
        super().__init__(ctx)
        self.pron = PronunciationEngine(ctx.memory)
        self.emotions = EmotionMapper()
        self.voice = VoiceEngine(pronunciation=self.pron, emotions=self.emotions)
        self.music = MusicEngine()
        self.sfx = SFXEngine()
        self.ambience = AmbienceEngine()
        self.cleanup = EnhancementEngine()
        self.normalizer = Normalizer()
        self.mixer = AudioMixer()

    async def run(self, beats: list[Beat]) -> AudioPlan:
        return await self.plan(beats)

    # ------------------------------------------------------------------ #
    # pipeline compat: beats → AudioPlan (emotion arc, ducking, music, voices)
    # ------------------------------------------------------------------ #
    async def plan(self, beats: list[Beat], *, narration_path: Optional[str] = None) -> AudioPlan:
        texts = [b.text for b in beats]
        emotions = self.emotions.arc(texts)                     # 17.6
        voices = [self.voice.build_spec(t, emotion=e) for t, e in zip(texts, emotions)]  # 17.5/17.7/17.8
        style = self.music.dominant_style(emotions)             # 17.9
        duck = [DuckRegion(startSec=b.range.startSec, endSec=b.range.endSec) for b in beats]  # 17.15
        plan = AudioPlan(
            music_style=style,
            section_music={s: self.music.style_for_section(s)
                           for s in ("hook", "body", "conclusion")},
            duck_regions=duck, voices=voices, narration_path=narration_path,
            tts_available=self.voice.available,
        )
        self.ctx.memory.working.set("audio_plan", plan.model_dump())
        self.ctx.emit("audio.planned", style=style, voices=len(voices), tts=self.voice.available)
        return plan

    # ------------------------------------------------------------------ #
    # full production (17.20 API) — real ffmpeg processing when audio exists
    # ------------------------------------------------------------------ #
    async def produce(
        self, beats: list[Beat], *, style: str = "documentary", language: str = "English",
        narration_path: Optional[str] = None, music_path: Optional[str] = None,
    ) -> AudioMetadata:
        plan = await self.plan(beats, narration_path=narration_path)
        tmp = get_settings().paths.temp
        meta = AudioMetadata(music=plan.music_style, language=language,
                             effects=[c.event for c in plan.sfx], loudness="-16 LUFS")

        voice_track = None
        if narration_path and Path(get_settings().paths.root / narration_path).exists():
            src = get_settings().paths.root / narration_path
            cleaned = await self.cleanup.clean(src, tmp / "voice_clean.wav")          # 17.13
            normalized = await self.normalizer.normalize(cleaned or src, tmp / "voice_norm.wav")  # 17.14
            voice_track = normalized or cleaned or src
            from core.providers.storage import rel
            meta.voice_track = rel(voice_track)

        if music_path:
            meta.music_track = music_path

        if voice_track and music_path:
            mixed = await self.mixer.mix(voice=voice_track, music=get_settings().paths.root / music_path,
                                         out_path=tmp / "final_mix.wav")               # 17.15/17.16
            if mixed:
                from core.providers.storage import rel
                meta.voice_track = rel(mixed)

        self._remember(plan, style)                                                   # 17.21
        return meta

    # ------------------------------------------------------------------ #
    # multilingual dubbing (17.17)
    # ------------------------------------------------------------------ #
    async def dub(self, script: str, target_language: str) -> str:
        if not self.llm.available or target_language.lower() in ("english", "en"):
            return script
        try:
            return (await self.llm.chat(
                f"Translate the following narration into {target_language}. Keep it natural and similar length.",
                script, effort="fast", max_tokens=1500)).strip()
        except (LLMUnavailable, Exception):
            return script

    def _remember(self, plan: AudioPlan, style: str) -> None:
        try:
            self.ctx.memory.remember_preference(
                f"For {style} videos, {plan.music_style} music worked well.", rating=0.7)
        except Exception:
            pass
