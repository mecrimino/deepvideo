"""Pure text helpers: sentence splitting, JSON extraction, word timing."""

from __future__ import annotations

import json
import re
from typing import Any, Optional

_SENT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])")
_WORD_RE = re.compile(r"\b[\w']+\b")


def split_sentences(text: str) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    parts = [p.strip() for p in _SENT_RE.split(text) if p.strip()]
    return parts or [text]


def word_count(text: str) -> int:
    return len(_WORD_RE.findall(text or ""))


def estimate_speech_sec(text: str, words_per_min: float = 150.0) -> float:
    """Estimate narration duration for a piece of text (~150 wpm documentary)."""
    return max(1.0, word_count(text) / (words_per_min / 60.0))


def extract_json(raw: str) -> Optional[Any]:
    """Best-effort parse of a JSON object/array possibly wrapped in prose/fences.

    LLMs frequently wrap JSON in ```json fences or trailing commentary; this
    pulls the first balanced ``{...}`` or ``[...]`` and parses it.
    """
    if not raw:
        return None
    raw = raw.strip()
    # strip code fences
    fence = re.search(r"```(?:json)?\s*(.+?)```", raw, re.DOTALL)
    if fence:
        raw = fence.group(1).strip()
    try:
        return json.loads(raw)
    except Exception:
        pass
    for opener, closer in (("{", "}"), ("[", "]")):
        start = raw.find(opener)
        if start == -1:
            continue
        depth = 0
        for i in range(start, len(raw)):
            if raw[i] == opener:
                depth += 1
            elif raw[i] == closer:
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(raw[start : i + 1])
                    except Exception:
                        break
    return None
