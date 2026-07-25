"""
Scene Splitter (11.4) — break narration into small, visualizable scenes.

Small scenes are easier to visualize and edit: one clip per scene. Splits by
sentence, keeping each scene under a max duration and (when word timings exist)
snapping scene boundaries to the audio so visuals align with what's said.

Also exposes ``split_into_beats`` — the beat-level segmentation the current
pipeline consumes.
"""

from __future__ import annotations

from core.schemas.edl import Beat, TimeRange, Transcript, Word
from core.schemas.production import Scene
from core.utils.ids import new_id
from core.utils.text import estimate_speech_sec, split_sentences


# --------------------------------------------------------------------------- #
# beat-level segmentation (pipeline compat)
# --------------------------------------------------------------------------- #
def _word_windows(words: list[Word], max_sec: float) -> list[tuple[float, float, str]]:
    out: list[tuple[float, float, str]] = []
    if not words:
        return out
    start = words[0].startSec
    buf: list[str] = []
    for w in words:
        if w.endSec - start > max_sec and buf:
            out.append((start, w.startSec, " ".join(buf)))
            start = w.startSec
            buf = []
        buf.append(w.text)
    if buf:
        out.append((start, words[-1].endSec, " ".join(buf)))
    return out


def _align_sentence(sentence: str, words: list[Word], cursor: int) -> tuple[float, float, int]:
    toks = [t for t in sentence.split() if t]
    if not words:
        return 0.0, 0.0, cursor
    start_idx = min(cursor, len(words) - 1)
    end_idx = min(cursor + len(toks), len(words))
    start = words[start_idx].startSec
    end = words[end_idx - 1].endSec if end_idx > start_idx else words[start_idx].endSec
    return start, end, end_idx


def split_into_beats(transcript: Transcript, max_beat_sec: float = 6.0) -> list[Beat]:
    beats: list[Beat] = []
    sentences = split_sentences(transcript.text) if transcript.text else []
    if sentences and transcript.words:
        cursor = 0
        for sent in sentences:
            start, end, cursor = _align_sentence(sent, transcript.words, cursor)
            if end - start > max_beat_sec * 1.5:
                span_words = [w for w in transcript.words if start <= w.startSec < end]
                for ws, we, chunk in _word_windows(span_words, max_beat_sec):
                    beats.append(_beat(chunk, ws, we))
            else:
                beats.append(_beat(sent, start, end))
    elif transcript.words:
        for ws, we, chunk in _word_windows(transcript.words, max_beat_sec):
            beats.append(_beat(chunk, ws, we))
    elif sentences:
        total = transcript.durationSec or float(len(sentences) * 4)
        per = total / max(1, len(sentences))
        for i, sent in enumerate(sentences):
            beats.append(_beat(sent, round(i * per, 3), round((i + 1) * per, 3)))
    return [b for b in beats if b.text.strip()]


def _beat(text: str, start: float, end: float) -> Beat:
    return Beat(id=new_id("beat_"), text=text.strip(),
                range=TimeRange(startSec=round(start, 3), endSec=round(max(start + 0.5, end), 3)))


# --------------------------------------------------------------------------- #
# scene-level segmentation (Ch11)
# --------------------------------------------------------------------------- #
class SceneSplitter:
    def split(self, narration: str, *, max_scene_sec: float = 9.0) -> list[Scene]:
        scenes: list[Scene] = []
        sid = 1
        cursor = 0.0
        for sent in split_sentences(narration):
            dur = min(max_scene_sec, max(2.0, estimate_speech_sec(sent)))
            scenes.append(Scene(
                scene_id=sid, title=sent[:40], narration=sent, duration=round(dur, 2),
                range_start=round(cursor, 2), range_end=round(cursor + dur, 2),
            ))
            cursor += dur
            sid += 1
        return scenes

    def from_script_scenes(self, script_scenes: list) -> list[Scene]:
        """Adopt the Ch10 ScriptOutput scenes as the base scene list."""
        out: list[Scene] = []
        cursor = 0.0
        for s in script_scenes:
            dur = float(getattr(s, "duration", 5.0))
            out.append(Scene(
                scene_id=int(getattr(s, "scene_id", len(out) + 1)),
                title=getattr(s, "title", "") or getattr(s, "visual_goal", "")[:40],
                narration=getattr(s, "narration", ""), duration=round(dur, 2),
                emotion=getattr(s, "emotion", "neutral"),
                importance=getattr(s, "importance", "medium"),
                visual_goal=getattr(s, "visual_goal", ""),
                range_start=round(cursor, 2), range_end=round(cursor + dur, 2),
            ))
            cursor += dur
        return out
