"""FFmpeg / ffprobe wrappers (Ch5 rendering primitives)."""

from core.tools.ffmpeg.ffmpeg import (
    MediaInfo,
    extract_audio,
    ffmpeg_available,
    make_thumbnail,
    probe,
    trim_clip,
)

__all__ = [
    "MediaInfo", "probe", "make_thumbnail", "extract_audio", "trim_clip",
    "ffmpeg_available",
]
