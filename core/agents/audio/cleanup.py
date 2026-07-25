"""
Audio Cleanup / Enhancement Engine (17.13) — standardise quality before mixing.

Runs a real FFmpeg filter chain (tools.md):

    highpass (hum removal) → afftdn (noise reduction) → equalizer (presence EQ)
    → acompressor (compression) → alimiter (limiter)

so every imported clip meets the same quality bar.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.tools.ffmpeg.ffmpeg import _run
from core.utils.logging import get_logger

log = get_logger("audio.cleanup")

_CHAIN = (
    "highpass=f=80,"                               # remove low hum/rumble
    "afftdn=nf=-25,"                               # spectral noise reduction
    "equalizer=f=3000:t=q:w=1:g=2,"               # presence lift for clarity
    "acompressor=threshold=-18dB:ratio=3:attack=5:release=120,"
    "alimiter=limit=0.95"                          # safety limiter
)


class EnhancementEngine:
    async def clean(self, in_path: str | Path, out_path: str | Path) -> Optional[Path]:
        out = Path(out_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        code, _o, err = await _run("ffmpeg", "-y", "-i", str(in_path), "-af", _CHAIN, str(out))
        if code != 0 or not out.exists():
            log.warning("cleanup failed: %s", err.decode("utf-8", "ignore")[:200])
            return None
        return out
