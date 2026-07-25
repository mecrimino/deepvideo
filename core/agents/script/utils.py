"""Small helpers for the Script Agent (timing, numbers, fact strings)."""

from __future__ import annotations

import re

_WPM = 150.0  # average narration speed (10.11)
_NUM_RE = re.compile(r"\b\d[\d,\.]*\b")


def words(text: str) -> int:
    return len(re.findall(r"\b[\w'-]+\b", text or ""))


def speak_seconds(text: str, wpm: float = _WPM) -> float:
    return round(words(text) / (wpm / 60.0), 2) if text else 0.0


def words_for_seconds(seconds: float, wpm: float = _WPM) -> int:
    return int(seconds * wpm / 60.0)


def numbers_in(text: str) -> set[str]:
    """Numeric tokens (years, specs) used for fact protection (10.14)."""
    return {n.strip(".,") for n in _NUM_RE.findall(text or "")}


def fact_strings(package) -> list[str]:
    return [f"{f.subject} {f.predicate} {f.object}" for f in getattr(package, "key_facts", [])]
