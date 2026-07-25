"""
Automatic Clip Trimming (13.15) — return only the useful segment.

Instead of a 3-minute video, pick the best shot and trim a target-length window
centred in it, so the Timeline Agent receives exactly the clip it needs.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.agents.video.models import Shot
from core.tools.ffmpeg import trim_clip
from core.utils.logging import get_logger

log = get_logger("video.trim")


class ClipTrimmer:
    def window(self, shot: Shot, target: float) -> tuple[float, float]:
        """Centre a ``target``-second window inside the shot (clamped)."""
        dur = shot.duration
        if dur <= target:
            return shot.start, shot.end
        mid = (shot.start + shot.end) / 2
        start = max(shot.start, mid - target / 2)
        end = min(shot.end, start + target)
        return round(start, 2), round(end, 2)

    async def trim(self, video_path: str | Path, start: float, end: float) -> Optional[Path]:
        dest = Path(video_path).with_name(f"{Path(video_path).stem}.{int(start*10)}-{int(end*10)}.mp4")
        return await trim_clip(video_path, dest, start, end, reencode=True)
