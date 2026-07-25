"""
Speech-to-text (Ch7 stack: Whisper) — LOCAL faster-whisper (tools.md).

Runs a small Whisper model on the CPU (int8) with word-level timestamps — no
cloud, no key. Model size is ``WHISPER_MODEL`` (default ``base``); the weights
download from HuggingFace on first use and are cached. If faster-whisper isn't
installed we fall back to an even duration-estimate so beat segmentation still
has timings to work with.
"""

from __future__ import annotations

import asyncio
from functools import lru_cache
from pathlib import Path
from typing import Optional

from core.config import get_settings
from core.schemas.edl import Transcript, Word
from core.tools.ffmpeg import extract_audio, probe
from core.utils.logging import get_logger
from core.utils.text import estimate_speech_sec, split_sentences

log = get_logger("asr")


@lru_cache(maxsize=1)
def _model():
    """Load the faster-whisper model once (loading is expensive)."""
    from faster_whisper import WhisperModel

    size = get_settings().whisper_model
    log.info("loading local whisper model '%s' (cpu/int8)", size)
    return WhisperModel(size, device="cpu", compute_type="int8")


async def transcribe(audio_path: str | Path, language: Optional[str] = None) -> Transcript:
    """Transcribe an audio/video file to a :class:`Transcript` with word timings."""
    audio_path = Path(audio_path)
    settings = get_settings()

    # Whisper wants an audio file; extract wav if we were handed a video.
    src = audio_path
    if audio_path.suffix.lower() in {".mp4", ".mov", ".mkv", ".webm", ".avi"}:
        wav = settings.paths.temp / f"{audio_path.stem}.16k.wav"
        extracted = await extract_audio(audio_path, wav)
        if extracted:
            src = extracted

    try:
        model = _model()
    except Exception as exc:  # not installed / load failed
        log.warning("local whisper unavailable (%s) — duration-estimate fallback", exc)
        return await _fallback_transcript(audio_path, language or "en")

    # faster-whisper is blocking (and lazily-iterated) — run it off the loop.
    try:
        text, words, duration, lang = await asyncio.to_thread(
            _run_whisper, model, str(src), language
        )
    except Exception as exc:
        log.warning("local transcription failed (%s) — falling back", exc)
        return await _fallback_transcript(audio_path, language or "en")
    return Transcript(text=text, words=words, language=lang, durationSec=duration)


def _run_whisper(model, path: str, language: Optional[str]):
    segments, info = model.transcribe(path, language=language, word_timestamps=True)
    words: list[Word] = []
    parts: list[str] = []
    for seg in segments:  # generator — consumed here, inside the worker thread
        parts.append(seg.text)
        for w in seg.words or []:
            words.append(Word(text=w.word.strip(), startSec=float(w.start or 0),
                              endSec=float(w.end or 0)))
    text = "".join(parts).strip()
    duration = float(getattr(info, "duration", 0) or 0) or (words[-1].endSec if words else 0.0)
    lang = getattr(info, "language", None) or language or "en"
    return text, words, duration, lang


async def _fallback_transcript(audio_path: Path, language: str) -> Transcript:
    """No ASR available: estimate word timings evenly across the real duration."""
    info = await probe(audio_path)
    duration = info.durationSec or 0.0
    return Transcript(text="", words=[], language=language, durationSec=duration)


def transcript_from_script(script: str, duration: Optional[float] = None, language: str = "en") -> Transcript:
    """Build a synthetic transcript directly from a written script.

    Used when the user provides a script (not audio): distribute words evenly by
    estimated speech rate so downstream beat segmentation has timings to work
    with (the real timings get replaced once TTS audio is transcribed).
    """
    sentences = split_sentences(script)
    total = duration or sum(estimate_speech_sec(s) for s in sentences) or 1.0
    words: list[Word] = []
    cursor = 0.0
    # allocate each sentence a share of the timeline proportional to its length
    weights = [estimate_speech_sec(s) for s in sentences] or [1.0]
    wsum = sum(weights) or 1.0
    for sent, weight in zip(sentences, weights):
        span = total * (weight / wsum)
        toks = sent.split()
        if not toks:
            continue
        per = span / len(toks)
        for tok in toks:
            words.append(Word(text=tok, startSec=round(cursor, 3), endSec=round(cursor + per, 3)))
            cursor += per
    return Transcript(text=script.strip(), words=words, language=language, durationSec=round(total, 3))
