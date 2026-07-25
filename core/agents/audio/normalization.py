"""
Loudness Normalization (17.14) — consistent perceived volume (EBU R128).

Uses FFmpeg's ``loudnorm`` to bring any asset to a target integrated loudness
(default −16 LUFS, YouTube-friendly) with true-peak limiting, so voice, music and
sfx don't jump in volume.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.tools.ffmpeg.ffmpeg import _run
from core.utils.logging import get_logger

log = get_logger("audio.norm")


class Normalizer:
    async def normalize(self, in_path: str | Path, out_path: str | Path,
                        *, target_lufs: float = -16.0, true_peak: float = -1.5) -> Optional[Path]:
        out = Path(out_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        af = f"loudnorm=I={target_lufs}:TP={true_peak}:LRA=11"
        code, _o, err = await _run("ffmpeg", "-y", "-i", str(in_path), "-af", af, str(out))
        if code != 0 or not out.exists():
            log.warning("normalize failed: %s", err.decode("utf-8", "ignore")[:200])
            return None
        return out
