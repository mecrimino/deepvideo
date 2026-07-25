"""
Camera Motion Detection (13.11) — static / pan / tilt / zoom / tracking.

Camera movement changes how a scene feels. Using OpenCV dense optical flow
(Farnebäck) between frames of a shot, this classifies the dominant motion: near-
zero → static; strong horizontal → pan; vertical → tilt; radial divergence →
zoom; mixed steady motion → tracking. The Scene Planner can request a motion type
(13.11) and this lets ranking honour it.
"""

from __future__ import annotations

from pathlib import Path

from core.agents.video.models import Shot
from core.utils.logging import get_logger

log = get_logger("video.motion")


class MotionAnalyzer:
    def analyze(self, video_path: str | Path, shot: Shot) -> tuple[str, float]:
        try:
            import cv2
            import numpy as np
        except Exception:
            return "static", 0.0
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            return "static", 0.0
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(shot.start * fps))
        ok, prev = cap.read()
        if not ok:
            cap.release()
            return "static", 0.0
        prev_g = cv2.cvtColor(cv2.resize(prev, (160, 90)), cv2.COLOR_BGR2GRAY)

        dxs, dys, divs = [], [], []
        frames_read = 0
        end_frame = int(shot.end * fps)
        while cap.get(cv2.CAP_PROP_POS_FRAMES) < end_frame and frames_read < 30:
            ok, cur = cap.read()
            if not ok:
                break
            cur_g = cv2.cvtColor(cv2.resize(cur, (160, 90)), cv2.COLOR_BGR2GRAY)
            flow = cv2.calcOpticalFlowFarneback(prev_g, cur_g, None, 0.5, 2, 15, 2, 5, 1.2, 0)
            dxs.append(float(flow[..., 0].mean()))
            dys.append(float(flow[..., 1].mean()))
            # zoom: outward/inward radial component (corners vs centre)
            h, w = flow.shape[:2]
            left = flow[:, : w // 2, 0].mean()
            right = flow[:, w // 2 :, 0].mean()
            divs.append(float(right - left))
            prev_g = cur_g
            frames_read += 1
        cap.release()
        if not dxs:
            return "static", 0.0

        adx, ady, adiv = abs(np.mean(dxs)), abs(np.mean(dys)), abs(np.mean(divs))
        mag = float(np.sqrt(np.mean(dxs) ** 2 + np.mean(dys) ** 2))
        motion_score = min(1.0, mag / 3.0)
        if mag < 0.3 and adiv < 0.3:
            return "static", motion_score
        if adiv > max(adx, ady) and adiv > 0.5:
            return "zoom", motion_score
        if adx > ady * 1.5:
            return "pan", motion_score
        if ady > adx * 1.5:
            return "tilt", motion_score
        return "tracking", motion_score
