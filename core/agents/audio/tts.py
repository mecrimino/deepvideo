"""
Voice Engine (17.5) — turn narration into natural speech.

Builds an SSML/prompt from the text with pronunciation fixes (17.7), emotion
(17.6) and pauses (17.8), then synthesizes via the local **Kokoro-ONNX** TTS
server (tools.md: Kokoro TTS, keyless + run-locally). When that server is not
running, synthesis is honestly gated — ``available`` is False and callers fall
back to any user-supplied narration.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.agents.audio.emotions import EmotionMapper
from core.agents.audio.models import VoiceSpec
from core.agents.audio.pronunciation import PronunciationEngine
from core.config import get_settings
from core.providers.voice import get_tts
from core.utils.logging import get_logger

log = get_logger("audio.tts")


class VoiceEngine:
    def __init__(self, *, pronunciation: PronunciationEngine, emotions: EmotionMapper) -> None:
        self.pron = pronunciation
        self.emotions = emotions
        self.tts = get_tts()  # local Kokoro TTS
        self.default_voice = get_settings().default_voice

    @property
    def available(self) -> bool:
        return self.tts.available()

    def build_spec(self, text: str, *, emotion: str, voice: Optional[str] = None,
                   pause_after: float = 0.35) -> VoiceSpec:
        spoken = self.pron.apply(text)                 # 17.7
        ssml = self._ssml(spoken, emotion, pause_after)  # 17.6 + 17.8
        speed = {"excited": 1.08, "calm": 0.94, "serious": 0.96}.get(emotion, 1.0)
        return VoiceSpec(text=spoken, voice=voice or self.default_voice, emotion=emotion,
                         speed=speed, pause_after=pause_after, ssml=ssml)

    def _ssml(self, text: str, emotion: str, pause: float) -> str:
        rate = {"excited": "fast", "calm": "slow", "serious": "slow"}.get(emotion, "medium")
        return (f'<speak><prosody rate="{rate}">{text}</prosody>'
                f'<break time="{int(pause*1000)}ms"/></speak>')

    async def synthesize_text(self, text: str, out: Path, *, voice: Optional[str] = None,
                              speed: float = 1.0) -> Optional[Path]:
        """Synthesize a whole narration string to a WAV at ``out``. Real audio.

        Returns the written path, or None when the TTS server is unavailable or
        synthesis fails (callers then keep any user-supplied narration).
        """
        if not self.available:
            log.info("Kokoro TTS not reachable — voice synthesis skipped")
            return None
        wav = await self.tts.synthesize(text, voice=voice or self.default_voice, speed=speed)
        if not wav:
            return None
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(wav)
        log.info("synthesized narration (%d bytes) → %s", len(wav), out)
        return out

    async def synthesize(self, specs: list[VoiceSpec], out: Path) -> Optional[Path]:
        """Synthesize a list of narration segments into one WAV (segment order)."""
        if not self.available or not specs:
            return None
        text = " ".join(s.text for s in specs).strip()
        voice = specs[0].voice or self.default_voice
        return await self.synthesize_text(text, out, voice=voice)
