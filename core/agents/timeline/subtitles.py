"""
Subtitle Placement (15.11) — position caption cues on the narration clock.

The Subtitle agent provides the cue timings; the Timeline agent places them on
the captions track and fixes any overlaps so two cues never show at once.
"""

from __future__ import annotations

from core.schemas.edl import CaptionCue


class SubtitlePlacer:
    def place(self, captions: list[CaptionCue]) -> list[CaptionCue]:
        cues = sorted(captions, key=lambda c: c.range.startSec)
        for a, b in zip(cues, cues[1:]):
            if b.range.startSec < a.range.endSec:      # overlap → trim the earlier
                a.range.endSec = round(b.range.startSec, 3)
        return cues
