"""
Kokoro TTS provider (Ch17.5 Voice Engine, tools.md: Kokoro TTS local).

Talks to the local **Kokoro-ONNX** Text-to-Speech server (default
``http://localhost:8001``). It is a genuine, keyless, run-locally voice engine:
54 voices across 8 languages, real WAV synthesis. When the server is not running
the provider reports ``available == False`` and callers degrade gracefully
(the pipeline falls back to any user-supplied narration).

API used (see the server's ``/docs``):
  GET  /health            → liveness
  GET  /voices            → {voices:[{name,language,language_code,gender,gender_label}], count}
  GET  /preview/{voice}   → audio/wav sample
  POST /tts               → {filename,url,duration,sample_rate}   (voice+text+speed)
  GET  /audio/{filename}  → audio/wav of a generated clip
"""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Optional

import httpx

from core.config import get_settings
from core.utils.logging import get_logger

log = get_logger("voice.kokoro")

# Kokoro rejects text longer than this per request; longer scripts are chunked.
_MAX_CHARS = 4800


class KokoroTTS:
    def __init__(self, base_url: str, *, enabled: bool = True) -> None:
        self.base_url = base_url.rstrip("/")
        self.enabled = enabled
        self._reachable: Optional[bool] = None  # cached health probe

    # ------------------------------------------------------------------ #
    # availability
    # ------------------------------------------------------------------ #
    def available(self, *, force: bool = False) -> bool:
        """Cheap, cached liveness probe. Never raises."""
        if not self.enabled:
            return False
        if self._reachable is not None and not force:
            return self._reachable
        try:
            with httpx.Client(timeout=2.0) as client:
                ok = client.get(f"{self.base_url}/health").status_code == 200
        except Exception:
            ok = False
        self._reachable = ok
        return ok

    # ------------------------------------------------------------------ #
    # voice catalog
    # ------------------------------------------------------------------ #
    async def voices(self) -> list[dict]:
        """Return the server's voice list (empty when unreachable)."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(f"{self.base_url}/voices")
                res.raise_for_status()
                return res.json().get("voices", [])
        except Exception as exc:
            log.warning("kokoro /voices failed: %s", exc)
            return []

    async def preview(self, voice: str) -> Optional[bytes]:
        """Fetch a short canned sample for one voice (for the picker's play button)."""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.get(f"{self.base_url}/preview/{voice}")
                res.raise_for_status()
                return res.content
        except Exception as exc:
            log.warning("kokoro /preview/%s failed: %s", voice, exc)
            return None

    # ------------------------------------------------------------------ #
    # synthesis
    # ------------------------------------------------------------------ #
    async def synthesize(self, text: str, *, voice: str, speed: float = 1.0) -> Optional[bytes]:
        """Synthesize ``text`` to a single WAV (bytes). Chunks long text and joins."""
        chunks = _chunk(text, _MAX_CHARS)
        if not chunks:
            return None
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                parts: list[bytes] = []
                for chunk in chunks:
                    wav = await self._synth_one(client, chunk, voice=voice, speed=speed)
                    if wav is None:
                        return None
                    parts.append(wav)
        except Exception as exc:
            log.warning("kokoro synthesis failed: %s", exc)
            return None
        return parts[0] if len(parts) == 1 else _concat_wav(parts)

    async def _synth_one(
        self, client: httpx.AsyncClient, text: str, *, voice: str, speed: float
    ) -> Optional[bytes]:
        res = await client.post(
            f"{self.base_url}/tts",
            json={"text": text, "voice": voice, "speed": speed},
        )
        res.raise_for_status()
        data = res.json()
        if not data.get("success") or not data.get("filename"):
            return None
        audio = await client.get(f"{self.base_url}/audio/{data['filename']}")
        audio.raise_for_status()
        return audio.content


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _chunk(text: str, limit: int) -> list[str]:
    """Split text into <=limit-char chunks on sentence boundaries where possible."""
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= limit:
        return [text]
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks: list[str] = []
    cur = ""
    for s in sentences:
        if len(cur) + len(s) + 1 > limit and cur:
            chunks.append(cur.strip())
            cur = ""
        # a single sentence longer than the limit: hard-split it
        while len(s) > limit:
            chunks.append(s[:limit])
            s = s[limit:]
        cur = f"{cur} {s}".strip()
    if cur:
        chunks.append(cur.strip())
    return chunks


def _concat_wav(parts: list[bytes]) -> bytes:
    """Concatenate PCM WAV byte blobs into one WAV (same format assumed).

    Uses the stdlib ``wave`` module so no ffmpeg round-trip is needed for the
    common (single-voice, same sample-rate) case.
    """
    import io
    import wave

    frames: list[bytes] = []
    params = None
    for blob in parts:
        with wave.open(io.BytesIO(blob), "rb") as w:
            if params is None:
                params = w.getparams()
            frames.append(w.readframes(w.getnframes()))
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setparams(params)  # type: ignore[arg-type]
        for f in frames:
            w.writeframes(f)
    return out.getvalue()


@lru_cache(maxsize=1)
def get_tts() -> KokoroTTS:
    s = get_settings()
    return KokoroTTS(s.tts_base_url, enabled=s.tts_enabled)
