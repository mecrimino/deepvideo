"""
Sound Effects (15.13) — sfx synced to visual/narration events.

Places each requested sound effect on the SFX track (A3) at its event time, so a
"rocket ignition" sfx lands exactly when the narration says "ignition".
"""

from __future__ import annotations

from core.agents.timeline.models import SoundEffect
from core.schemas.edl import AssetClipSource, TimeRange, TimelineClip
from core.utils.ids import new_id


class EffectsManager:
    def place(self, tracks: dict, sfx: list[SoundEffect], *, default_len: float = 1.5) -> None:
        for fx in sfx:
            start = max(0.0, fx.atSec)
            tracks["A3"].clips.append(TimelineClip(
                id=new_id("clip_"), label=fx.name,
                source=AssetClipSource(assetId=f"sfx:{fx.name}", inSec=0.0, outSec=default_len),
                range=TimeRange(startSec=round(start, 3), endSec=round(start + default_len, 3))))
