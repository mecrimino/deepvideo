"""
Video downloader + frame extraction.

Downloads a candidate video once (yt-dlp/httpx via the shared downloader, cached
on disk) and extracts frames for shot detection and analysis using OpenCV.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.tools.downloader import download_media
from core.utils.logging import get_logger

log = get_logger("video.download")


class VideoDownloader:
    async def download(self, candidate) -> Optional[Path]:
        url = candidate.url or candidate.thumb_url
        if not url:
            return None
        path = await download_media(url, provider=candidate.provider, suffix=".mp4")
        if path is not None:
            candidate.local_path = str(path)
        return path

    def sample_frames(self, video_path: str | Path, *, every_sec: float = 0.5, max_frames: int = 240):
        """Yield (timestamp, frame) pairs sampled from the video (OpenCV)."""
        try:
            import cv2
        except Exception:
            return
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            return
        fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
        step = max(1, int(fps * every_sec))
        idx = 0
        yielded = 0
        try:
            while yielded < max_frames:
                ok, frame = cap.read()
                if not ok:
                    break
                if idx % step == 0:
                    yield (idx / fps, frame)
                    yielded += 1
                idx += 1
        finally:
            cap.release()
