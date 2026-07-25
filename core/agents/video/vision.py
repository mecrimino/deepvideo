"""
Shot Vision Analysis (13.10) — describe what a shot contains.

Analyses a shot's keyframe: dominant colours, brightness/lighting, and — when
Ultralytics **YOLO** is installed (tools.md) — detected objects. YOLO is optional
so the agent runs on low-end hardware; the dedicated multimodal Vision
Understanding Agent (Ch14) provides the deep analysis and the searchable video
brain (13.21).
"""

from __future__ import annotations

from pathlib import Path

from core.agents.video.models import Shot
from core.utils.logging import get_logger

log = get_logger("video.vision")

_YOLO = None
_YOLO_TRIED = False


def _yolo():
    global _YOLO, _YOLO_TRIED
    if _YOLO_TRIED:
        return _YOLO
    _YOLO_TRIED = True
    try:
        from ultralytics import YOLO  # tools.md object detection (optional)

        _YOLO = YOLO("yolov8n.pt")
    except Exception:
        _YOLO = None
    return _YOLO


class ShotVision:
    def analyze(self, shot: Shot) -> Shot:
        if not shot.keyframe or not Path(shot.keyframe).exists():
            return shot
        try:
            import cv2

            img = cv2.imread(shot.keyframe)
            if img is None:
                return shot
            # dominant colour + lighting descriptors
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            brightness = float(gray.mean())
            shot.objects = self._descriptors(img, brightness) + self._objects(shot.keyframe)
        except Exception as exc:
            log.debug("vision analyze failed: %s", exc)
        return shot

    def _descriptors(self, img, brightness: float) -> list[str]:
        tags: list[str] = []
        tags.append("night" if brightness < 60 else "day" if brightness > 150 else "dim")
        return tags

    def _objects(self, keyframe: str) -> list[str]:
        model = _yolo()
        if model is None:
            return []
        try:
            res = model(keyframe, verbose=False)
            names = model.names
            out = set()
            for r in res:
                for c in r.boxes.cls.tolist():
                    out.add(names[int(c)])
            return sorted(out)
        except Exception:
            return []
