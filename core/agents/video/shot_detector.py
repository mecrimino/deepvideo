"""
Shot Boundary Detection (13.8) — split a video into shots (the searchable units).

Samples frames with OpenCV and compares consecutive colour histograms; a large
change marks a cut. Produces :class:`Shot`s with start/end times and a mid-shot
keyframe path for downstream analysis. Falls back to a single whole-video shot if
detection isn't possible.
"""

from __future__ import annotations

from pathlib import Path

from core.agents.video.models import Shot
from core.config import get_settings
from core.utils.logging import get_logger

log = get_logger("video.shots")

_CUT_THRESHOLD = 0.45   # Bhattacharyya distance for a shot change
_MIN_SHOT_SEC = 1.0


class ShotDetector:
    def detect(self, video_path: str | Path, *, every_sec: float = 0.4) -> list[Shot]:
        try:
            import cv2
        except Exception:
            return []
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            return []
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        total = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
        duration = (total / fps) if fps else 0.0
        step = max(1, int(fps * every_sec))

        samples: list[tuple[float, "any"]] = []
        boundaries: list[float] = []
        prev_hist = None
        idx = 0
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if idx % step == 0:
                ts = idx / fps
                small = cv2.resize(frame, (160, 90))
                hist = cv2.calcHist([small], [0, 1, 2], None, [8, 8, 8], [0, 256, 0, 256, 0, 256])
                cv2.normalize(hist, hist)
                if prev_hist is not None:
                    diff = cv2.compareHist(prev_hist, hist, cv2.HISTCMP_BHATTACHARYYA)
                    if diff > _CUT_THRESHOLD:
                        boundaries.append(ts)
                prev_hist = hist
                samples.append((ts, small))
            idx += 1
        cap.release()

        if duration <= 0 and samples:
            duration = samples[-1][0] + every_sec
        cuts = [0.0] + boundaries + [round(duration, 2)]
        shots: list[Shot] = []
        sid = 1
        for i in range(len(cuts) - 1):
            s, e = cuts[i], cuts[i + 1]
            if e - s < _MIN_SHOT_SEC:
                continue
            shot = Shot(shot_id=sid, start=round(s, 2), end=round(e, 2))
            shot.keyframe = self._save_keyframe(samples, (s + e) / 2, sid)
            shots.append(shot)
            sid += 1
        if not shots and duration > 0:
            shots = [Shot(shot_id=1, start=0.0, end=round(duration, 2))]
        log.info("detected %d shots in %.1fs video", len(shots), duration)
        return shots

    def _save_keyframe(self, samples, at: float, sid: int) -> str:
        if not samples:
            return ""
        try:
            import cv2

            _ts, frame = min(samples, key=lambda p: abs(p[0] - at))
            out = get_settings().paths.cache / "videos" / f"kf_{sid}_{int(at*10)}.jpg"
            out.parent.mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(out), frame)
            return str(out)
        except Exception:
            return ""
