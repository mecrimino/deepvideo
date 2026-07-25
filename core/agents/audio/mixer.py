"""
Audio Mixer (17.16) + Dynamic Ducking (17.15).

Combines the audio tracks into one final track with FFmpeg. Ducking is real,
automatic side-chain compression: the voice drives ``sidechaincompress`` on the
music so the music dips whenever narration plays and rises in the gaps — no
manual keyframes (17.15). SFX are delayed to their cue times and mixed in.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.agents.audio.models import SFXCue
from core.tools.ffmpeg.ffmpeg import _run
from core.utils.logging import get_logger

log = get_logger("audio.mix")


class AudioMixer:
    async def mix(
        self,
        *,
        voice: Optional[str | Path],
        music: Optional[str | Path],
        out_path: str | Path,
        sfx: Optional[list[SFXCue]] = None,
        ambient: Optional[str | Path] = None,
        music_gain: float = 0.35,
    ) -> Optional[Path]:
        out = Path(out_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        inputs: list[str] = []
        filters: list[str] = []
        mix_labels: list[str] = []
        idx = 0

        if voice:
            inputs += ["-i", str(voice)]
            filters.append(f"[{idx}:a]aresample=44100[voice]")
            mix_labels.append("[voice]")
            voice_idx = idx
            idx += 1
        else:
            voice_idx = None

        if music:
            inputs += ["-i", str(music)]
            filters.append(f"[{idx}:a]volume={music_gain},aresample=44100[music]")
            if voice_idx is not None:
                # 17.15 — duck music under the voice via side-chain compression
                filters.append("[music][voice]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[duckedmusic]")
                mix_labels.append("[duckedmusic]")
            else:
                mix_labels.append("[music]")
            idx += 1

        if ambient:
            inputs += ["-i", str(ambient)]
            filters.append(f"[{idx}:a]volume=0.15,aresample=44100[amb]")
            mix_labels.append("[amb]")
            idx += 1

        for cue in (sfx or []):
            if not cue.path:
                continue
            inputs += ["-i", str(Path(cue.path))]
            delay = int(cue.atSec * 1000)
            filters.append(f"[{idx}:a]adelay={delay}|{delay},volume=0.7[sfx{idx}]")
            mix_labels.append(f"[sfx{idx}]")
            idx += 1

        if not mix_labels:
            return None
        if len(mix_labels) == 1:
            filters.append(f"{mix_labels[0]}anull[out]")
        else:
            filters.append(f"{''.join(mix_labels)}amix=inputs={len(mix_labels)}:duration=first:dropout_transition=2[out]")

        code, _o, err = await _run(
            "ffmpeg", "-y", *inputs, "-filter_complex", ";".join(filters),
            "-map", "[out]", str(out))
        if code != 0 or not out.exists():
            log.warning("mix failed: %s", err.decode("utf-8", "ignore")[:250])
            return None
        return out
