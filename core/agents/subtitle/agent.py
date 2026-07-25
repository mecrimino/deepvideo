"""
Subtitle agent (Ch17) — turns a transcript/beats into clean caption cues.

Long lines are split into readable chunks (≤ ~7 words / ≤ 3.5s), snapped to word
timings when available, so captions never dump a whole paragraph on screen at
once. Also exports standard SRT for burn-in or sidecar delivery.
"""

from __future__ import annotations

from core.agents.base import AgentContext, BaseAgent
from core.schemas.edl import CaptionCue, TimeRange, Transcript
from core.utils.ids import new_id

MAX_WORDS = 7
MAX_SEC = 3.5


class SubtitleAgent(BaseAgent[Transcript, list[CaptionCue]]):
    name = "subtitle"

    async def run(self, transcript: Transcript) -> list[CaptionCue]:
        return self.build(transcript)

    def build(self, transcript: Transcript) -> list[CaptionCue]:
        cues: list[CaptionCue] = []
        words = transcript.words
        if not words:
            return cues
        buf: list[str] = []
        start = words[0].startSec
        for i, w in enumerate(words):
            buf.append(w.text)
            span = w.endSec - start
            is_last = i == len(words) - 1
            ends_sentence = w.text.endswith((".", "!", "?"))
            if len(buf) >= MAX_WORDS or span >= MAX_SEC or ends_sentence or is_last:
                cues.append(CaptionCue(
                    id=new_id("cap_"),
                    text=" ".join(buf).strip(),
                    range=TimeRange(startSec=round(start, 3), endSec=round(w.endSec, 3)),
                ))
                buf = []
                if not is_last:
                    start = words[i + 1].startSec
        return cues


def _ts(sec: float) -> str:
    ms = int(round(sec * 1000))
    h, ms = divmod(ms, 3600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def to_srt(cues: list[CaptionCue]) -> str:
    """Serialize caption cues to SRT."""
    lines: list[str] = []
    for i, c in enumerate(cues, start=1):
        lines.append(str(i))
        lines.append(f"{_ts(c.range.startSec)} --> {_ts(c.range.endSec)}")
        lines.append(c.text)
        lines.append("")
    return "\n".join(lines)
