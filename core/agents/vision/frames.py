"""
Frame Extraction (14.5) — sample frames intelligently, not every frame.

A static interview needs ~1 fps; fast sports footage needs many more. This
measures motion (frame-to-frame difference) on a quick pass and picks a sampling
rate accordingly, balancing accuracy and speed. Images return a single frame.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.utils.logging import get_logger

log = get_logger("vision.frames")

_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


class FrameExtractor:
    def is_image(self, path: str | Path) -> bool:
        return Path(path).suffix.lower() in _IMAGE_EXT

    def extract(self, path: str | Path, *, max_frames: int = 24):
        """Return a list of (timestamp, frame ndarray)."""
        try:
            import cv2
        except Exception:
            return []
        p = Path(path)
        if self.is_image(p):
            img = cv2.imread(str(p))
            return [(0.0, img)] if img is not None else []

        cap = cv2.VideoCapture(str(p))
        if not cap.isOpened():
            return []
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
        duration = (total / fps) if fps else 0.0

        every = self._sampling_interval(cap, fps)
        step = max(1, int(fps * every))
        frames, idx = [], 0
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        while len(frames) < max_frames:
            ok, frame = cap.read()
            if not ok:
                break
            if idx % step == 0:
                frames.append((round(idx / fps, 2), frame))
            idx += 1
        cap.release()
        log.info("extracted %d frames (every %.2fs) from %.1fs video", len(frames), every, duration)
        return frames

    def _sampling_interval(self, cap, fps: float) -> float:
        """Static → 1s; dynamic → ~0.25s, based on measured motion."""
        try:
            import cv2

            pos = cap.get(cv2.CAP_PROP_POS_FRAMES)
            ok, a = cap.read()
            ok2, b = cap.read()
            cap.set(cv2.CAP_PROP_POS_FRAMES, pos)
            if not (ok and ok2):
                return 1.0
            import numpy as np

            ga = cv2.cvtColor(cv2.resize(a, (160, 90)), cv2.COLOR_BGR2GRAY)
            gb = cv2.cvtColor(cv2.resize(b, (160, 90)), cv2.COLOR_BGR2GRAY)
            motion = float(np.abs(ga.astype("int") - gb.astype("int")).mean())
            return 0.25 if motion > 8 else 0.5 if motion > 3 else 1.0
        except Exception:
            return 1.0
