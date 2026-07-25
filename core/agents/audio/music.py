"""
Music Engine (17.9) + Beat Synchronization (17.10).

Selects a music style per story section from scene metadata (hook→suspense,
history→cinematic, technical→minimal, action→epic, ending→inspirational) rather
than at random, resolving to a track in the local music library when available.
Beat detection finds musical beats so major cuts/title animations can snap to
them (17.10).
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.agents.audio.models import MusicSelection
from core.config import get_settings
from core.utils.logging import get_logger

log = get_logger("audio.music")

# 17.9 story section → music style
_SECTION_STYLE = {
    "hook": "suspense", "intro": "cinematic", "history": "cinematic",
    "background": "cinematic", "body": "minimal", "explanation": "minimal",
    "technical": "minimal", "action": "epic", "climax": "epic",
    "conclusion": "inspirational", "ending": "inspirational",
}
_EMOTION_STYLE = {
    "excited": "epic", "excitement": "epic", "serious": "cinematic",
    "suspense": "suspense", "tension": "suspense", "wonder": "inspirational",
    "inspirational": "inspirational", "calm": "minimal", "neutral": "minimal",
}


class MusicEngine:
    def __init__(self) -> None:
        self.library = get_settings().paths.assets / "music"

    def style_for_section(self, section: str) -> str:
        return _SECTION_STYLE.get(section.lower(), "cinematic")

    def style_for_emotion(self, emotion: str) -> str:
        return _EMOTION_STYLE.get(emotion.lower(), "cinematic")

    def select(self, sections: list[str]) -> list[MusicSelection]:
        return [MusicSelection(section=s, style=self.style_for_section(s),
                               path=self._find(self.style_for_section(s))) for s in sections]

    def dominant_style(self, emotions: list[str]) -> str:
        if not emotions:
            return "cinematic"
        styles = [self.style_for_emotion(e) for e in emotions]
        return max(set(styles), key=styles.count)

    def _find(self, style: str) -> str:
        """Return a library track matching the style, if one exists."""
        if not self.library.exists():
            return ""
        for p in self.library.glob("*"):
            if style in p.stem.lower() and p.suffix.lower() in (".mp3", ".wav", ".m4a", ".ogg"):
                from core.providers.storage import rel
                return rel(p)
        return ""

    def beats(self, wav_path: str | Path) -> list[float]:
        """17.10 — estimate beat times from a WAV via energy-onset peak picking.

        Reads a PCM WAV (produced by the mixer/normalizer) with the stdlib and
        finds rhythmic energy peaks — major cuts can snap to these.
        """
        try:
            import wave

            import numpy as np

            with wave.open(str(wav_path), "rb") as wf:
                rate = wf.getframerate()
                n = wf.getnframes()
                raw = wf.readframes(n)
            data = np.frombuffer(raw, dtype=np.int16).astype("float32")
            if data.size == 0:
                return []
            hop = max(1, rate // 100)  # 10 ms frames
            env = np.array([np.abs(data[i:i + hop]).mean() for i in range(0, len(data), hop)])
            if env.max() <= 0:
                return []
            env /= env.max()
            # onset = positive energy jump above a threshold
            diff = np.diff(env, prepend=env[0])
            thr = float(diff.mean() + 1.5 * diff.std())
            beats = [round(i * hop / rate, 3) for i, d in enumerate(diff)
                     if d > thr and (not diff[max(0, i - 15):i].max() > d)]
            return beats[:64]
        except Exception as exc:
            log.debug("beat detection failed: %s", exc)
            return []
