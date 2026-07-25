"""
OCR — Reading On-Screen Text (14.8).

Reads headlines, captions, dates and statistics from frames with **PaddleOCR**
(tools.md), so clips become searchable by their on-screen text ("show every clip
mentioning Blackwell"). PaddleOCR loads lazily (first use downloads its models);
if unavailable, returns nothing gracefully.
"""

from __future__ import annotations

from pathlib import Path

from core.utils.logging import get_logger

log = get_logger("vision.ocr")

_OCR = None
_TRIED = False


def _engine():
    global _OCR, _TRIED
    if _TRIED:
        return _OCR
    _TRIED = True
    try:
        from paddleocr import PaddleOCR

        _OCR = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
        log.info("PaddleOCR loaded")
    except Exception as exc:
        log.info("PaddleOCR unavailable (%s)", exc)
        _OCR = None
    return _OCR


class OCREngine:
    @property
    def available(self) -> bool:
        return _engine() is not None

    def read(self, frame_or_path, *, min_conf: float = 0.6) -> list[str]:
        engine = _engine()
        if engine is None:
            return []
        try:
            import numpy as np

            target = frame_or_path if isinstance(frame_or_path, np.ndarray) else str(frame_or_path)
            result = engine.ocr(target, cls=True)
            out: list[str] = []
            for block in (result or []):
                for line in (block or []):
                    txt, conf = line[1]
                    if conf >= min_conf and txt.strip():
                        out.append(txt.strip())
            return out
        except Exception as exc:
            log.debug("ocr failed: %s", exc)
            return []
