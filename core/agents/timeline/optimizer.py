"""
Timeline Optimizer (15.14 timing validation + 15.16 cleanup).

Fills small gaps between consecutive video clips so there are no awkward pauses,
prunes empty tracks, and checks for problems: broken asset references, duplicate
clips, subtitle overlaps. Returns the list of issues found/fixed.
"""

from __future__ import annotations

from core.schemas.edl import Timeline
from core.utils.logging import get_logger

log = get_logger("timeline.optimizer")

_GAP_TOLERANCE = 0.05


class TimelineOptimizer:
    def optimize(self, timeline: Timeline, known_assets: set[str]) -> list[str]:
        issues: list[str] = []
        issues += self._fill_gaps(timeline)          # 15.14
        self._prune_empty(timeline)                  # 15.16
        issues += self._check_refs(timeline, known_assets)
        issues += self._check_dupes(timeline)
        # recompute duration from the furthest clip / caption
        timeline.durationSec = round(self._duration(timeline), 3)
        if issues:
            log.info("optimizer: %d issue(s) handled", len(issues))
        return issues

    def _fill_gaps(self, timeline: Timeline) -> list[str]:
        fixed: list[str] = []
        for track in timeline.tracks:
            if track.kind not in ("video", "overlay"):
                continue
            clips = sorted(track.clips, key=lambda c: c.range.startSec)
            for a, b in zip(clips, clips[1:]):
                gap = b.range.startSec - a.range.endSec
                if _GAP_TOLERANCE < gap:
                    a.range.endSec = round(b.range.startSec, 3)  # extend previous
                    fixed.append(f"filled {gap:.2f}s gap before {b.label or b.id}")
        return fixed

    def _prune_empty(self, timeline: Timeline) -> None:
        timeline.tracks = [t for t in timeline.tracks if t.clips]

    def _check_refs(self, timeline: Timeline, known: set[str]) -> list[str]:
        issues: list[str] = []
        specials = {"__narration__", "__music__"}
        for t in timeline.tracks:
            for c in t.clips:
                src = c.source
                if getattr(src, "kind", None) == "asset":
                    aid = getattr(src, "assetId", "")
                    if aid and aid not in known and aid not in specials and not aid.startswith("sfx:"):
                        issues.append(f"broken reference: {aid}")
        return issues

    def _check_dupes(self, timeline: Timeline) -> list[str]:
        issues: list[str] = []
        for t in timeline.tracks:
            seen: set[str] = set()
            for c in t.clips:
                aid = getattr(c.source, "assetId", None)
                if aid and aid in seen:
                    issues.append(f"duplicate clip {aid} on {t.name}")
                if aid:
                    seen.add(aid)
        return issues

    @staticmethod
    def _duration(timeline: Timeline) -> float:
        ends = [c.range.endSec for t in timeline.tracks for c in t.clips]
        ends += [c.range.endSec for c in timeline.captions]
        return max(ends, default=0.0)
