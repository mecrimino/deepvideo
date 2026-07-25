"""
Object Detection (14.6) — identify important objects with label/confidence/box.

Uses **Ultralytics YOLO** (tools.md) when installed. It's optional so the agent
runs on low-end hardware; without it, detection returns nothing and the rest of
the vision stack (OCR, composition, colour, lighting, captioning) still works.
"""

from __future__ import annotations

from core.agents.vision.metadata import DetectedObject
from core.utils.logging import get_logger

log = get_logger("vision.objects")

_MODEL = None
_TRIED = False


def _model():
    global _MODEL, _TRIED
    if _TRIED:
        return _MODEL
    _TRIED = True
    try:
        from ultralytics import YOLO

        _MODEL = YOLO("yolov8n.pt")
        log.info("YOLO loaded for object detection")
    except Exception:
        _MODEL = None
    return _MODEL


class ObjectDetector:
    @property
    def available(self) -> bool:
        return _model() is not None

    def detect(self, frame, *, conf: float = 0.35) -> list[DetectedObject]:
        model = _model()
        if model is None:
            return []
        try:
            res = model(frame, verbose=False, conf=conf)
            names = model.names
            out: list[DetectedObject] = []
            for r in res:
                for box in r.boxes:
                    cls = int(box.cls[0])
                    xyxy = [int(v) for v in box.xyxy[0].tolist()]
                    out.append(DetectedObject(label=names[cls], confidence=round(float(box.conf[0]), 3), bbox=xyxy))
            return out
        except Exception as exc:
            log.debug("detection failed: %s", exc)
            return []
