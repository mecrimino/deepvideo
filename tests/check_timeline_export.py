"""
Self-check for the exporter's timeline layout (run: python tests/check_timeline_export.py).

Renders a synthetic timeline — a gap, a base clip, an overlay lane covering part
of it, and a sound effect on an audio lane — and asserts the export really is a
composite: gaps stay black, the overlay covers only its own window, and the
sound lands at its timeline position rather than at 0.

Media is generated with ffmpeg and fed in by patching asset resolution, so the
check touches neither the clip catalog nor the user's projects.
"""

from __future__ import annotations

import asyncio
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from core.agents.exporter.agent import ExporterAgent  # noqa: E402
from core.schemas.edl import Timeline, TimelineClip  # noqa: E402

WORK = ROOT / "temp" / "check_export"
MEDIA = {
    "red": ["-f", "lavfi", "-i", "color=c=red:s=320x180:d=8:r=30"],
    "green": ["-f", "lavfi", "-i", "color=c=green:s=320x180:d=8:r=30"],
    "beep": ["-f", "lavfi", "-i", "sine=frequency=600:duration=2"],
}


def make_media() -> dict[str, Path]:
    WORK.mkdir(parents=True, exist_ok=True)
    out: dict[str, Path] = {}
    for name, args in MEDIA.items():
        dest = WORK / (f"{name}.wav" if name == "beep" else f"{name}.mp4")
        if not dest.exists():
            subprocess.run(["ffmpeg", "-v", "error", "-y", *args, str(dest)], check=True)
        out[name] = dest
    return out


def clip(clip_id: str, start: float, end: float) -> dict:
    return {
        "id": clip_id,
        "source": {"kind": "asset", "assetId": clip_id, "inSec": 0, "outSec": end - start},
        "range": {"startSec": start, "endSec": end},
    }


def pixel(video: Path, at: float) -> tuple[int, int, int]:
    """The centre pixel at `at` seconds, as RGB."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", str(at), "-i", str(video),
         "-frames:v", "1", "-vf", "crop=2:2:(iw-2)/2:(ih-2)/2", "-f", "rawvideo",
         "-pix_fmt", "rgb24", "-"],
        capture_output=True, check=True,
    ).stdout
    return raw[0], raw[1], raw[2]


def loudness(video: Path, at: float, span: float) -> float:
    err = subprocess.run(
        ["ffmpeg", "-hide_banner", "-ss", str(at), "-t", str(span), "-i", str(video),
         "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True,
    ).stderr
    line = next(x for x in err.splitlines() if "max_volume" in x)
    return float(line.split("max_volume:")[1].replace("dB", "").strip())


def main() -> None:
    media = make_media()
    exporter = ExporterAgent()
    # Feed the graph directly: no catalog lookups, no side effects.
    exporter._resolve_asset = lambda c: media[c.id]  # type: ignore[method-assign]

    timeline = Timeline.model_validate({
        "id": "tl_check", "fps": 30, "width": 320, "height": 180, "durationSec": 10,
        "tracks": [
            # Earlier tracks stack above later ones — green is the overlay.
            {"id": "ov", "kind": "overlay", "name": "Layer 2", "clips": [clip("green", 4, 6)]},
            {"id": "vid", "kind": "video", "name": "Video", "clips": [clip("red", 2, 8)]},
            {"id": "aud", "kind": "audio", "name": "Audio 1", "clips": [clip("beep", 6, 8)]},
        ],
        "captions": [],
    })

    out = asyncio.run(exporter.render(timeline, job_id="check_export", width=320, height=180))

    duration = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)],
        capture_output=True, text=True, check=True,
    ).stdout.strip())
    assert abs(duration - 10) < 0.4, f"expected a 10s export, got {duration}"

    r, g, b = pixel(out, 1)
    assert r < 40 and g < 40 and b < 40, f"gap before the first clip should be black, got {(r, g, b)}"
    r, g, b = pixel(out, 3)
    assert r > 150 and g < 90, f"base clip should show at 3s, got {(r, g, b)}"
    r, g, b = pixel(out, 5)
    assert g > 90 and r < 90, f"overlay lane should cover the base at 5s, got {(r, g, b)}"
    r, g, b = pixel(out, 7)
    assert r > 150 and g < 90, f"base clip should be back at 7s, got {(r, g, b)}"

    assert loudness(out, 6.2, 1) > -20, "the sound effect should be audible inside its range"
    assert loudness(out, 3, 1) < -60, "audio outside the clip's range should be silent"
    print(f"ok — {out} is a real composite (layers, gaps and placed audio all hold)")

    check_batched(exporter, media)
    check_shot_audio(exporter, media)
    check_micro_gaps(exporter, media)


def check_micro_gaps(exporter: ExporterAgent, media: dict[str, Path]) -> None:
    """
    A few-ms gap between clips is a trim artifact, not an intended black beat —
    the exporter closes it so no black flashes between clips. A real gap
    (hundreds of ms) must still render as black.
    """
    def frame_is_black(video: Path, at: float) -> bool:
        r, g, b = pixel(video, at)
        return r < 30 and g < 30 and b < 30

    micro = Timeline.model_validate({  # red 0–2, green 2.04–4.04 → 40 ms gap
        "id": "tl_micro", "fps": 30, "width": 160, "height": 90, "durationSec": 4.04,
        "tracks": [{"id": "v", "kind": "video", "name": "V",
                    "clips": [clip("red", 0, 2), clip("green", 2.04, 4.04)]}],
        "captions": [],
    })
    exporter._resolve_asset = lambda c: media[c.id]  # type: ignore[method-assign]
    out = asyncio.run(exporter.render(micro, job_id="check_export_microgap", width=160, height=90))
    assert not frame_is_black(out, 2.02), "a 40 ms gap should be closed, not shown as black"

    real = Timeline.model_validate({  # red 0–2, green 2.5–4.5 → 500 ms gap
        "id": "tl_gap", "fps": 30, "width": 160, "height": 90, "durationSec": 4.5,
        "tracks": [{"id": "v", "kind": "video", "name": "V",
                    "clips": [clip("red", 0, 2), clip("green", 2.5, 4.5)]}],
        "captions": [],
    })
    out = asyncio.run(exporter.render(real, job_id="check_export_realgap", width=160, height=90))
    assert frame_is_black(out, 2.25), "a real 500 ms gap should still render as black"
    print(f"ok — {out} closes ms-scale gaps but keeps real black beats")


def check_shot_audio(exporter: ExporterAgent, media: dict[str, Path]) -> None:
    """
    A composed preset shot (a card, a title…) sits on a VIDEO/overlay lane but
    bakes its sfx into its own file. That audio must still reach the export —
    only for shots (marked by shotSpec), so ordinary B-roll stays muted.
    """
    with_sound = Path(WORK) / "shot_with_sfx.mp4"
    if not with_sound.exists():
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y",
             "-f", "lavfi", "-i", "color=c=blue:s=320x180:d=3:r=30",
             "-f", "lavfi", "-i", "sine=frequency=660:duration=3",
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(with_sound)],
            check=True,
        )

    shot = {
        "id": "shot", "shotSpec": {"presetId": "card_pop", "values": {}},
        "source": {"kind": "asset", "assetId": "shot", "inSec": 0, "outSec": 3},
        "range": {"startSec": 4, "endSec": 7},
    }
    timeline = Timeline.model_validate({
        "id": "tl_shot", "fps": 30, "width": 320, "height": 180, "durationSec": 10,
        "tracks": [
            {"id": "ov", "kind": "overlay", "name": "L2", "clips": [shot]},
            {"id": "vid", "kind": "video", "name": "V", "clips": [clip("red", 0, 10)]},
        ],
        "captions": [],
    })
    exporter._resolve_asset = lambda c: with_sound if c.id == "shot" else media["red"]  # type: ignore[method-assign]

    out = asyncio.run(exporter.render(timeline, job_id="check_export_shotaudio", width=320, height=180))
    assert loudness(out, 5, 1) > -30, "the shot's baked sfx should be audible in its window"
    assert loudness(out, 1, 1) < -55, "audio before the shot should be silent"
    print(f"ok — {out} carries a composed shot's baked sfx into the render")


def check_batched(exporter: ExporterAgent, media: dict[str, Path]) -> None:
    """
    A long timeline can't fit every clip in one ffmpeg command (Windows argv
    limit), so the exporter renders in windows and concatenates. Force several
    windows on a small timeline and prove an overlay straddling a window
    boundary still covers only its own range, with no seam or length change.
    """
    base = [clip(f"r{i}", i * 2, i * 2 + 2) for i in range(6)]  # 0..12, sequential
    timeline = Timeline.model_validate({
        "id": "tl_batch", "fps": 30, "width": 320, "height": 180, "durationSec": 12,
        "tracks": [
            {"id": "ov", "kind": "overlay", "name": "L2", "clips": [clip("green", 3, 9)]},
            {"id": "vid", "kind": "video", "name": "V", "clips": base},
        ],
        "captions": [],
    })
    exporter._resolve_asset = lambda c: media["green"] if c.id == "green" else media["red"]  # type: ignore[method-assign]
    exporter._WINDOW_CLIPS = 2  # tiny, so 12s splits into several windows

    out = asyncio.run(exporter.render(timeline, job_id="check_export_batched", width=320, height=180))
    duration = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(out)],
        capture_output=True, text=True, check=True,
    ).stdout.strip())
    assert abs(duration - 12) < 0.4, f"batched export should be 12s, got {duration}"

    for at, want in {1: "red", 4: "green", 7: "green", 11: "red"}.items():
        r, g, b = pixel(out, at)
        got = "red" if r > 120 and g < 90 else "green" if g > 90 and r < 90 else f"({r},{g},{b})"
        assert got == want, f"at {at}s across windows wanted {want}, got {got}"

    print(f"ok — {out} batches into windows without losing layers or length")


if __name__ == "__main__":
    main()
