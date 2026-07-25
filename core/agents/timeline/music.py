"""
Background Music (15.12) — support the narration, don't overpower it.

Places a music bed on the Music track (A2) and computes ducking regions: wherever
narration plays, the music dips (e.g. to 20%) and rises again in the gaps. The
Timeline agent produces the ducking plan; the exporter applies the volume
automation at render.
"""

from __future__ import annotations

from typing import Optional

from core.agents.timeline.models import DuckRegion
from core.schemas.edl import AssetClipSource, CaptionCue, TimeRange, TimelineClip
from core.utils.ids import new_id


class MusicManager:
    def place(self, tracks: dict, *, music_path: Optional[str], duration: float,
              captions: list[CaptionCue]) -> list[DuckRegion]:
        if not music_path or duration <= 0:
            return []
        tracks["A2"].clips.append(TimelineClip(
            id=new_id("clip_"), label="Music",
            source=AssetClipSource(assetId="__music__", inSec=0.0, outSec=duration),
            range=TimeRange(startSec=0.0, endSec=duration)))
        # duck under every caption/narration span (15.12)
        return [DuckRegion(startSec=c.range.startSec, endSec=c.range.endSec) for c in captions]
