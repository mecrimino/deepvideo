"""
Project Serialization (15.17/15.18) — internal JSON + professional export.

    timeline → internal JSON → renderer → video
             → OpenTimelineIO  → professional editor (Premiere/Resolve/FCP)

The internal JSON is the shared :class:`Timeline` the renderer consumes. For
interchange with professional editors we export **OpenTimelineIO** (tools.md
timeline format), the industry-standard timeline representation.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.config import get_settings
from core.providers.storage import rel
from core.schemas.edl import Timeline
from core.utils.logging import get_logger

log = get_logger("timeline.serializer")


class ProjectSerializer:
    def to_json(self, timeline: Timeline) -> dict:
        return timeline.model_dump()

    @property
    def otio_available(self) -> bool:
        try:
            import opentimelineio  # noqa: F401

            return True
        except Exception:
            return False

    def to_otio(self, timeline: Timeline, assets: Optional[dict] = None):
        """Build an OpenTimelineIO timeline (industry-standard interchange)."""
        import opentimelineio as otio

        fps = timeline.fps or 30
        otl = otio.schema.Timeline(name=timeline.id)
        assets = assets or {}

        def rt(sec: float):
            return otio.opentime.RationalTime(round(sec * fps), fps)

        for track in timeline.tracks:
            kind = otio.schema.TrackKind.Audio if track.kind == "audio" else otio.schema.TrackKind.Video
            otrack = otio.schema.Track(name=track.name, kind=kind)
            cursor = 0.0
            for clip in sorted(track.clips, key=lambda c: c.range.startSec):
                if clip.range.startSec - cursor > 0.01:  # gap
                    gap_dur = clip.range.startSec - cursor
                    otrack.append(otio.schema.Gap(
                        source_range=otio.opentime.TimeRange(rt(0), rt(gap_dur))))
                dur = clip.range.duration
                media = otio.schema.MissingReference()
                aid = getattr(clip.source, "assetId", None)
                if aid and aid in assets:
                    path = assets[aid].get("path") if isinstance(assets[aid], dict) else getattr(assets[aid], "path", "")
                    if path:
                        media = otio.schema.ExternalReference(target_url=path)
                oclip = otio.schema.Clip(
                    name=clip.label or clip.id, media_reference=media,
                    source_range=otio.opentime.TimeRange(rt(0), rt(dur)))
                otrack.append(oclip)
                cursor = clip.range.endSec
            if len(otrack):
                otl.tracks.append(otrack)
        return otl

    def export_otio(self, timeline: Timeline, *, assets: Optional[dict] = None) -> Optional[str]:
        """Write an ``.otio`` file next to the project and return its rel path."""
        if not self.otio_available:
            return None
        try:
            import opentimelineio as otio

            otl = self.to_otio(timeline, assets)
            out = get_settings().paths.projects / timeline.id / f"{timeline.id}.otio"
            out.parent.mkdir(parents=True, exist_ok=True)
            otio.adapters.write_to_file(otl, str(out))
            return rel(out)
        except Exception as exc:
            log.warning("otio export failed: %s", exc)
            return None
