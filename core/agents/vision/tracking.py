"""
Object Tracking (14.7) — link the same object across frames.

Rather than detecting objects independently per frame, this matches detections
between consecutive frames by label + bounding-box overlap (IoU), producing
tracks. Tracks enable motion/continuity reasoning and de-duplicated object lists.
"""

from __future__ import annotations

from core.agents.vision.metadata import DetectedObject


def _iou(a: list[int], b: list[int]) -> float:
    if len(a) < 4 or len(b) < 4:
        return 0.0
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0, ix2 - ix1), max(0, iy2 - iy1)
    inter = iw * ih
    if inter == 0:
        return 0.0
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    return inter / (area_a + area_b - inter)


class ObjectTracker:
    def track(self, frames_detections: list[list[DetectedObject]], *, iou_thresh: float = 0.3) -> list[dict]:
        """Return tracks: [{label, count, first_frame, last_frame}]."""
        tracks: list[dict] = []
        for fi, dets in enumerate(frames_detections):
            for d in dets:
                match = None
                for t in tracks:
                    if t["label"] == d.label and t["last_frame"] == fi - 1 and _iou(t["bbox"], d.bbox) >= iou_thresh:
                        match = t
                        break
                if match:
                    match.update(bbox=d.bbox, last_frame=fi, count=match["count"] + 1)
                else:
                    tracks.append({"label": d.label, "bbox": d.bbox, "count": 1,
                                   "first_frame": fi, "last_frame": fi})
        return tracks
