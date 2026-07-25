"""
Audio Synchronization (15.7) — narration drives the edit.

Places the continuous narration on the Voice track (A1) spanning the whole
timeline; every video clip and subtitle is already positioned on the same
narration clock, so voice, picture and captions line up.
"""

from __future__ import annotations

from typing import Optional

from core.schemas.edl import AssetClipSource, TimeRange, TimelineClip
from core.utils.ids import new_id


class AudioSync:
    def sync(self, tracks: dict, *, audio_path: Optional[str], duration: float) -> None:
        if not audio_path or duration <= 0:
            return
        voice = TimelineClip(
            id=new_id("clip_"), label="Narration",
            source=AssetClipSource(assetId="__narration__", inSec=0.0, outSec=duration),
            range=TimeRange(startSec=0.0, endSec=duration),
        )
        tracks["A1"].clips.append(voice)
