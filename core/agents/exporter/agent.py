"""
Exporter agent (Ch2 Layer 5 "Rendering", Ch20) — composites a Timeline to MP4.

Engineering, not AI: each video-track clip becomes a normalised segment (scaled
and padded to the target frame), segments are concatenated, narration audio is
muxed in, and captions are optionally burned. Beats with no matched footage
render as a themed caption slate (a solid background with the narration text) so
the export is always a complete, watchable video — never a hole — even with zero
API keys configured.
"""

from __future__ import annotations

import asyncio
import shutil
from pathlib import Path
from typing import Callable, Optional

from core.config import get_settings
from core.providers.storage import get_asset, rel
from core.schemas.edl import Timeline, TimelineClip
from core.tools.ffmpeg.ffmpeg import _run  # low-level runner (async)
from core.tools.ffmpeg.ffmpeg import probe as ff_probe
from core.utils.logging import get_logger

log = get_logger("exporter")

# Windows font for drawtext (escaped drive colon per this project's env quirk).
_FONT = "C\\:/Windows/Fonts/arialbd.ttf"

ProgressFn = Callable[[float, str], None]


def _esc_drawtext(text: str) -> str:
    """Escape text for ffmpeg drawtext."""
    text = text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’")
    text = text.replace("%", "\\%")
    # wrap long lines every ~34 chars so captions fit the frame
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > 34:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    return "\n".join(lines[:6])


def _drawtext(text: str, h: int) -> str:
    """A leading-comma drawtext clause that boxes `text` low in the frame."""
    return (
        f",drawtext=fontfile='{_FONT}':text='{_esc_drawtext(text)}':"
        f"fontcolor=white:fontsize={max(24, h // 24)}:box=1:boxcolor=black@0.5:"
        f"boxborderw=12:x=(w-text_w)/2:y=h-text_h-{h // 12}:line_spacing=8"
    )


class ExporterAgent:
    name = "exporter"

    def __init__(self, work_dir: Optional[Path] = None) -> None:
        settings = get_settings()
        self._work_root = work_dir or settings.paths.temp / "render"

    async def render(
        self,
        timeline: Timeline,
        *,
        job_id: str,
        fmt: str = "mp4",
        width: Optional[int] = None,
        height: Optional[int] = None,
        burn_captions: bool = True,
        on_progress: Optional[ProgressFn] = None,
    ) -> Path:
        w = width or timeline.width or 1920
        h = height or timeline.height or 1080
        fps = int(timeline.fps or 30)
        work = self._work_root / job_id
        if work.exists():
            shutil.rmtree(work, ignore_errors=True)
        work.mkdir(parents=True, exist_ok=True)

        def progress(p: float, msg: str) -> None:
            if on_progress:
                on_progress(max(0.0, min(1.0, p)), msg)

        self._close_micro_gaps(timeline)
        placed = self._video_clips(timeline)
        if not placed:
            raise RuntimeError("nothing to render — timeline has no video clips")
        total = max(
            timeline.durationSec,
            max((c.range.endSec for c in placed), default=0.0),
        )

        progress(0.1, f"compositing {len(placed)} clip(s)")
        composite = await self._composite(
            placed, timeline, work, total, w, h, fps, burn_captions, progress
        )

        progress(0.85, "muxing audio")
        out = work / f"output.{fmt}"
        final = await self._mux_audio(composite, timeline, out)

        # publish to projects-visible location and return repo-relative path
        progress(1.0, "done")
        return final

    # A gap this short between two visual clips is an editing/trim artifact
    # (seen: 20–40 ms), not an intended black beat. Closing it stops the black
    # canvas flashing through between clips in the export.
    _GAP_SNAP = 0.1

    def _close_micro_gaps(self, timeline: Timeline) -> None:
        """Extend a visual clip to meet the next one when the gap is tiny."""
        for track in timeline.tracks:
            if track.kind not in ("video", "overlay"):
                continue
            ordered = sorted(track.clips, key=lambda c: c.range.startSec)
            for cur, nxt in zip(ordered, ordered[1:]):
                gap = nxt.range.startSec - cur.range.endSec
                if 0.0 < gap <= self._GAP_SNAP:
                    # Grow the clip's on-screen window; span is taken from the
                    # range, so ffmpeg simply decodes the few extra ms of source.
                    cur.range.endSec = nxt.range.startSec

    # ------------------------------------------------------------------ #
    def _video_clips(self, timeline: Timeline) -> list[TimelineClip]:
        """
        Visual clips in DRAW order: the base video track first, then overlay
        lanes from the bottom up (earlier tracks stack above later ones, which
        is the order the editor shows), each lane left to right in time.
        """
        video = [t for t in timeline.tracks if t.kind == "video"]
        overlays = [t for t in timeline.tracks if t.kind == "overlay"]
        clips: list[TimelineClip] = []
        for track in [*video, *reversed(overlays)]:
            clips.extend(sorted(track.clips, key=lambda c: c.range.startSec))
        return clips

    # A window's ffmpeg call opens EVERY clip's decoder at once (filter_complex
    # has no lazy inputs), so the cap bounds concurrent decoders — not just the
    # Windows ~32k argv limit. High-res sources (a 4K clip decodes into hundreds
    # of MB) mean even a few dozen at once can exhaust RAM, so keep this small; a
    # 10-minute timeline just becomes more, cheaper windows.
    _WINDOW_CLIPS = 10

    async def _composite(
        self,
        clips: list[TimelineClip],
        timeline: Timeline,
        work: Path,
        total: float,
        w: int,
        h: int,
        fps: int,
        burn: bool,
        progress: Optional[ProgressFn] = None,
    ) -> Path:
        """
        Put every clip where the editor put it — clips at their real start times
        over a black canvas (gaps stay black), overlay lanes above the base,
        captions burned on top. For long timelines this is done in time windows
        that are concatenated, so no single ffmpeg command carries more than
        `_WINDOW_CLIPS` inputs; short edits render in one pass.

        Progress climbs through the 0.10–0.80 band as windows finish, so a
        many-minute composite doesn't sit frozen at 10%.
        """
        cues = [c for c in (timeline.captions if burn else []) if c.text.strip()]
        windows = self._windows(clips, total)

        if len(windows) == 1:
            (w0, w1) = windows[0]
            return await self._render_window(clips, cues, w0, w1 - w0, work / "composite.mp4", w, h, fps)

        segments: list[Path] = []
        for i, (w0, w1) in enumerate(windows):
            if progress:
                progress(0.1 + 0.7 * (i / len(windows)), f"compositing {i + 1}/{len(windows)}")
            sub = [c for c in clips if c.range.startSec < w1 and c.range.endSec > w0]
            subcues = [c for c in cues if c.range.startSec < w1 and c.range.endSec > w0]
            seg = work / f"win_{i:03d}.mp4"
            segments.append(await self._render_window(sub, subcues, w0, w1 - w0, seg, w, h, fps))
        if progress:
            progress(0.8, "joining windows")
        return await self._concat(segments, work, w, h, fps)

    def _windows(self, clips: list[TimelineClip], total: float) -> list[tuple[float, float]]:
        """
        Split [0, total] at clip-start boundaries so each window overlaps at most
        ~`_WINDOW_CLIPS` clips. Boundaries fall on real starts, so the base
        track's sequential clips are never split mid-clip; only the few overlays
        or captions that straddle a boundary get rendered in two windows.
        """
        if len(clips) <= self._WINDOW_CLIPS:
            return [(0.0, total)]
        starts = sorted({max(0.0, c.range.startSec) for c in clips})
        cuts = [0.0]
        for k in range(self._WINDOW_CLIPS, len(starts), self._WINDOW_CLIPS):
            if starts[k] > cuts[-1]:
                cuts.append(starts[k])
        cuts.append(total)
        return [(a, b) for a, b in zip(cuts, cuts[1:]) if b > a]

    async def _render_window(
        self,
        clips: list[TimelineClip],
        cues: list,
        w0: float,
        dur: float,
        out: Path,
        w: int,
        h: int,
        fps: int,
    ) -> Path:
        """Composite `clips`/`cues` onto a `dur`-second canvas, times relative to w0."""
        args: list[str] = ["-y", "-f", "lavfi", "-i", f"color=c=black:s={w}x{h}:d={dur:.3f}:r={fps}"]
        chains: list[str] = []
        canvas = "0:v"
        idx = 0

        for clip in clips:
            local_start = clip.range.startSec - w0          # <0 if it began before this window
            draw_start = max(0.0, local_start)
            draw_end = min(dur, clip.range.endSec - w0)
            span = draw_end - draw_start
            if span <= 0.02:
                continue
            # Frames already consumed before the window opened must be skipped.
            seek_extra = max(0.0, -local_start)
            fit = (
                f"scale={w}:{h}:force_original_aspect_ratio=decrease,"
                f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps={fps}"
            )
            look = getattr(clip, "look", None)
            if look:
                fit += "," + look

            src_path = self._resolve_asset(clip)
            if src_path is None:
                args += ["-f", "lavfi", "-i", f"color=c=0x101826:s={w}x{h}:d={span:.3f}:r={fps}"]
                label = clip.label or ""
                fit = f"setsar=1,fps={fps}" + (_drawtext(label, h) if label else "")
            elif src_path.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".gif"}:
                args += ["-loop", "1", "-t", f"{span:.3f}", "-i", str(src_path)]
            else:
                in_sec = float(getattr(clip.source, "inSec", 0.0) or 0.0) + seek_extra
                args += ["-ss", f"{in_sec:.3f}", "-t", f"{span:.3f}", "-i", str(src_path)]

            idx += 1
            nxt = f"c{idx}"
            chains.append(f"[{idx}:v]{fit},setpts=PTS-STARTPTS+{draw_start:.3f}/TB[v{idx}]")
            chains.append(
                f"[{canvas}][v{idx}]overlay=eof_action=pass:shortest=0"
                f":enable='between(t,{draw_start:.3f},{draw_end:.3f})'[{nxt}]"
            )
            canvas = nxt

        for j, cue in enumerate(cues, start=1):
            cs, ce = max(0.0, cue.range.startSec - w0), min(dur, cue.range.endSec - w0)
            if ce <= cs:
                continue
            nxt = f"t{j}"
            chains.append(
                f"[{canvas}]{_drawtext(cue.text, h).lstrip(',')}"
                f":enable='between(t,{cs:.3f},{ce:.3f})'[{nxt}]"
            )
            canvas = nxt

        args += [
            "-filter_complex", ";".join(chains),
            "-map", f"[{canvas}]" if canvas != "0:v" else "0:v",
            "-an", "-t", f"{dur:.3f}",
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", str(fps),
            str(out),
        ]
        code, _o, err = await _run("ffmpeg", *args)
        if code != 0 or not out.exists():
            raise RuntimeError(f"composite failed: {err.decode('utf-8', 'ignore')[-400:]}")
        return out

    async def _concat(self, segments: list[Path], work: Path, w: int, h: int, fps: int) -> Path:
        """Join window segments (all same w/h/fps/pix_fmt) into one file."""
        listing = work / "windows.txt"
        listing.write_text("\n".join(f"file '{s.as_posix()}'" for s in segments), "utf-8")
        out = work / "composite.mp4"
        code, _o, err = await _run(
            "ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
            "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", str(fps),
            str(out),
        )
        if code != 0 or not out.exists():
            raise RuntimeError(f"window concat failed: {err.decode('utf-8', 'ignore')[-400:]}")
        return out

    def _resolve_asset(self, clip: TimelineClip) -> Optional[Path]:
        src = clip.source
        if getattr(src, "kind", None) != "asset":
            return None
        asset_id = getattr(src, "assetId", "")
        if asset_id in ("", "__narration__"):
            return None
        rec = get_asset(asset_id)
        if not rec:
            return None
        p = get_settings().paths.root / rec["path"]
        return p if p.exists() else None

    async def _mux_audio(self, video: Path, timeline: Timeline, out: Path) -> Path:
        """Narration + every audio-track clip, mixed at their timeline offsets."""
        audio_path = timeline.audioPath
        audio_abs: Optional[Path] = None
        if audio_path:
            audio_abs = get_settings().paths.root / audio_path
            if not audio_abs.exists():
                audio_abs = Path(audio_path)
            if not audio_abs.exists():
                audio_abs = None

        # SFX / music the editor dropped on audio lanes (muted lanes skipped).
        placed = [
            (clip, path)
            for track in timeline.tracks
            if track.kind == "audio" and not track.muted
            for clip in track.clips
            if (path := self._resolve_asset(clip)) is not None
        ]

        # Composed preset shots (a card, a title…) live on the VIDEO/overlay
        # lanes but bake their own sfx/music into the file. That audio would be
        # dropped with the rest of the visual-lane audio, so pull it back in —
        # only for shots (identified by shotSpec), so stock B-roll ambience on
        # ordinary clips stays muted, and only when the file actually has sound.
        for track in timeline.tracks:
            if track.kind not in ("video", "overlay") or track.muted:
                continue
            for clip in track.clips:
                if not getattr(clip, "shotSpec", None):
                    continue
                path = self._resolve_asset(clip)
                if path is not None and (await ff_probe(path)).hasAudio:
                    placed.append((clip, path))

        if placed:
            return await self._mix_audio(video, audio_abs, placed, out)
        if audio_abs is None:
            shutil.copy2(video, out)
            return out
        code, _o, err = await _run(
            "ffmpeg", "-y", "-i", str(video), "-i", str(audio_abs),
            "-c:v", "copy", "-c:a", "aac", "-shortest", "-map", "0:v:0", "-map", "1:a:0",
            str(out),
        )
        if code != 0 or not out.exists():
            log.warning("audio mux failed, exporting silent: %s", err.decode("utf-8", "ignore")[:200])
            shutil.copy2(video, out)
        return out

    async def _mix_audio(
        self,
        video: Path,
        narration: Optional[Path],
        placed: list[tuple[TimelineClip, Path]],
        out: Path,
    ) -> Path:
        """
        One amix graph: narration at 0 plus each placed clip trimmed to its
        in/out window and delayed to its start on the project clock. `apad`
        keeps the mix at least as long as the video so `-shortest` cuts on the
        video, never on a short sound effect.
        """
        args = ["-y", "-i", str(video)]
        chains: list[str] = []
        labels: list[str] = []
        idx = 1
        if narration is not None:
            args += ["-i", str(narration)]
            labels.append("[1:a]")
            idx = 2

        for clip, path in placed:
            args += ["-i", str(path)]
            src = clip.source
            start_ms = int(max(0.0, clip.range.startSec) * 1000)
            gain = clip.gain if clip.gain is not None else 1.0
            chains.append(
                f"[{idx}:a]atrim={getattr(src, 'inSec', 0.0):.3f}:{getattr(src, 'outSec', clip.range.duration):.3f},"
                f"asetpts=PTS-STARTPTS,volume={gain:.3f},adelay={start_ms}|{start_ms}[a{idx}]"
            )
            labels.append(f"[a{idx}]")
            idx += 1

        # normalize=0 keeps every source at its own level instead of dividing
        # by the input count (a lone sound effect would otherwise go quiet).
        mix = (
            f"{''.join(labels)}amix=inputs={len(labels)}:duration=longest:normalize=0,apad[mix]"
            if len(labels) > 1
            else f"{labels[0]}apad[mix]"
        )
        args += [
            "-filter_complex", ";".join([*chains, mix]),
            "-map", "0:v:0", "-map", "[mix]",
            "-c:v", "copy", "-c:a", "aac", "-shortest", str(out),
        ]
        code, _o, err = await _run("ffmpeg", *args)
        if code != 0 or not out.exists():
            log.warning("audio mix failed, exporting silent: %s", err.decode("utf-8", "ignore")[:300])
            shutil.copy2(video, out)
        return out
