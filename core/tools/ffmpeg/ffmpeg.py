"""
Async ffmpeg / ffprobe helpers.

ffmpeg + ffprobe are installed on PATH in this environment. These wrappers give
the agents the primitives they need — probing media, extracting thumbnails and
audio, and trimming clips — without every agent shelling out by hand. The heavy
final render lives in the Exporter agent (Ch7 stack, Layer 5).
"""

from __future__ import annotations

import asyncio
import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from core.utils.logging import get_logger

log = get_logger("ffmpeg")

_FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
_FFPROBE = shutil.which("ffprobe") or "ffprobe"


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


@dataclass
class MediaInfo:
    durationSec: float = 0.0
    width: int = 0
    height: int = 0
    fps: Optional[float] = None
    hasAudio: bool = False


async def _run(*args: str) -> tuple[int, bytes, bytes]:
    # Thread-based: asyncio subprocess transports break on the SelectorEventLoop
    # that `uvicorn --reload` uses on Windows (NotImplementedError).
    from core.utils.proc import run_exec

    return await run_exec(*args)


async def probe(path: str | Path) -> MediaInfo:
    """Return duration / dimensions / fps / audio-presence for a media file."""
    path = str(path)
    code, out, err = await _run(
        _FFPROBE, "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", path,
    )
    if code != 0:
        log.debug("ffprobe failed for %s: %s", path, err.decode("utf-8", "ignore")[:200])
        return MediaInfo()
    try:
        data = json.loads(out.decode("utf-8", "ignore"))
    except Exception:
        return MediaInfo()

    info = MediaInfo()
    fmt = data.get("format", {})
    info.durationSec = float(fmt.get("duration", 0) or 0)
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video" and info.width == 0:
            info.width = int(stream.get("width", 0) or 0)
            info.height = int(stream.get("height", 0) or 0)
            rate = stream.get("avg_frame_rate") or stream.get("r_frame_rate") or "0/1"
            try:
                num, den = rate.split("/")
                info.fps = round(float(num) / float(den), 3) if float(den) else None
            except Exception:
                info.fps = None
            if not info.durationSec:
                info.durationSec = float(stream.get("duration", 0) or 0)
        elif stream.get("codec_type") == "audio":
            info.hasAudio = True
    return info


async def make_thumbnail(src: str | Path, dest: str | Path, at_sec: float = 1.0) -> Optional[Path]:
    """Grab a single poster frame at ``at_sec`` seconds."""
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    code, _out, err = await _run(
        _FFMPEG, "-y", "-ss", str(max(0.0, at_sec)), "-i", str(src),
        "-frames:v", "1", "-q:v", "3", "-vf", "scale=480:-2", str(dest),
    )
    if code != 0 or not dest.exists():
        log.debug("thumbnail failed: %s", err.decode("utf-8", "ignore")[:200])
        return None
    return dest


async def extract_audio(src: str | Path, dest: str | Path, sample_rate: int = 16000) -> Optional[Path]:
    """Extract mono PCM/wav audio (16 kHz — ready for ASR)."""
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    code, _out, err = await _run(
        _FFMPEG, "-y", "-i", str(src), "-vn", "-ac", "1", "-ar", str(sample_rate), str(dest),
    )
    if code != 0 or not dest.exists():
        log.debug("extract_audio failed: %s", err.decode("utf-8", "ignore")[:200])
        return None
    return dest


async def trim_clip(
    src: str | Path, dest: str | Path, start: float, end: float, *, reencode: bool = True
) -> Optional[Path]:
    """Cut ``[start, end)`` out of ``src`` into ``dest`` (Ch13.15 clip trimming)."""
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dur = max(0.1, end - start)
    args = [_FFMPEG, "-y", "-ss", str(max(0.0, start)), "-i", str(src), "-t", str(dur)]
    if reencode:
        args += ["-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac"]
    else:
        args += ["-c", "copy"]
    args.append(str(dest))
    code, _out, err = await _run(*args)
    if code != 0 or not dest.exists():
        log.debug("trim failed: %s", err.decode("utf-8", "ignore")[:200])
        return None
    return dest
