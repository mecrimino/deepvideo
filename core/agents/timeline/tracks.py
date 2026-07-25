"""
Track Builder (15.3/15.6) — create the professional track layout.

Builds the shared :class:`Track`s the editor uses (main footage, b-roll, motion
graphics, titles, voice, music, sfx, ambient, captions). Empty tracks are pruned
by the optimizer later, so only the ones actually used survive.
"""

from __future__ import annotations

from core.agents.timeline.models import TRACK_LAYOUT, Track
from core.schemas.edl import Track as EdlTrack
from core.utils.ids import new_id


class TrackBuilder:
    def build(self) -> dict[str, EdlTrack]:
        """Return a {track_key: Track} map for the full professional layout."""
        return {
            spec.key: EdlTrack(id=new_id("trk_"), kind=spec.kind, name=spec.name, clips=[])
            for spec in TRACK_LAYOUT
        }
