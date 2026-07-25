"""
Clip Scheduler (15.5/15.8/15.15) — place, trim and extend clips.

Places each scene's chosen asset on the right video track at the scene's time
(15.5), trims the asset to the scene duration (15.8), and — when the asset is
shorter than the scene needs — picks a smart extension strategy (slow-motion,
loop, or hold) rather than leaving a gap (15.15).
"""

from __future__ import annotations

from typing import Optional

from core.agents.timeline.models import TimelineBuildInput
from core.schemas.edl import (
    AssetClipSource,
    ClipAsset,
    GenerateClipSource,
    GenerationSlot,
    TimeRange,
    TimelineClip,
)
from core.schemas.production import Scene
from core.utils.ids import new_id
from core.utils.logging import get_logger

log = get_logger("timeline.scheduler")


class ClipScheduler:
    def schedule(self, inp: TimelineBuildInput, tracks: dict) -> None:
        for scene in inp.scenes:
            rng = TimeRange(startSec=round(scene.range_start, 3), endSec=round(scene.range_end, 3))
            clip = self._clip_for(scene, inp, rng)
            if clip is None:
                continue
            # b-roll/motion-graphics go on V2/V3, main footage on V1
            key = "V3" if (scene.media and scene.media.type == "motion_graphics") else "V1"
            tracks[key].clips.append(clip)

    def _clip_for(self, scene: Scene, inp: TimelineBuildInput, rng: TimeRange) -> Optional[TimelineClip]:
        asset_id = inp.assets_by_scene.get(scene.scene_id)
        asset = inp.assets.get(asset_id) if asset_id else None
        need = rng.duration

        if asset is not None:
            in_sec, out_sec = self._trim(asset, need)          # 15.8
            label = (scene.visual_goal or scene.title or "")[:40]
            extend = self._extension(asset, need)              # 15.15
            meta_label = f"{label}{(' · ' + extend) if extend else ''}"
            return TimelineClip(
                id=new_id("clip_"), beatId=str(scene.scene_id),
                source=AssetClipSource(assetId=asset.id, inSec=in_sec, outSec=out_sec),
                range=rng, label=meta_label,
                review=(extend == "alt_needed"),
            )
        # no asset → generation slot (never a hole)
        slot = GenerationSlot(id=new_id("slot_"), beatId=str(scene.scene_id),
                              prompt=(scene.visual_goal or scene.narration)[:120], durationSec=need)
        return TimelineClip(id=new_id("clip_"), beatId=str(scene.scene_id),
                            source=GenerateClipSource(slot=slot), range=rng,
                            label=(scene.visual_goal or scene.title)[:40], review=True)

    def _trim(self, asset: ClipAsset, need: float) -> tuple[float, float]:
        """15.8 — take a centred ``need``-second window from the asset."""
        avail = asset.durationSec or need
        if avail <= need:
            return 0.0, round(avail, 3)
        start = max(0.0, (avail - need) / 2)
        return round(start, 3), round(start + need, 3)

    def _extension(self, asset: ClipAsset, need: float) -> str:
        """15.15 — strategy when the clip is shorter than the scene."""
        avail = asset.durationSec or 0.0
        if avail >= need:
            return ""
        ratio = need / avail if avail else 999
        if ratio <= 1.5:
            return "slow_motion"   # mild → slow down
        if ratio <= 2.5:
            return "loop"          # moderate → loop
        return "alt_needed"        # too short → flag for an alternative clip
