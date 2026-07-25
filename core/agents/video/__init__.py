"""
Video Search & B-Roll Agent (Ch13) — the cinematographer.

Built from scratch per Ch13 (folder layout 13.19) with tools.md tech: Pexels/
Pixabay multi-provider search (13.6), **OpenCV** shot-boundary detection (13.8),
camera-motion analysis (13.11) and quality scoring (13.12), **FFmpeg** clip
trimming (13.15), optional **YOLO** objects (13.10), perceptual-hash de-dup
(13.14), story-aware ranking (13.16) and **Ch7 asset memory** reuse (13.18).
Reasons at the shot level — finds the right few seconds, not just the right file.
"""

from core.agents.video.agent import VideoSearchAgent
from core.agents.video.models import ClipResult, Shot, VideoCandidate, VideoRequest, VideoResult

__all__ = ["VideoSearchAgent", "VideoRequest", "VideoCandidate", "Shot", "ClipResult", "VideoResult"]
