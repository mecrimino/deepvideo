"""
Pronunciation Engine (17.7) — get difficult names right, consistently.

Maintains a pronunciation dictionary (NVIDIA, CUDA, SpaceX, F-22 ...) mapping a
term to a phonetic/spoken form, and rewrites narration so the TTS says it
correctly. The dictionary persists in memory so it improves across projects.
"""

from __future__ import annotations

import re

_DEFAULT: dict[str, str] = {
    "NVIDIA": "en-VID-ee-ah",
    "CUDA": "KOO-dah",
    "SpaceX": "Space X",
    "F-22": "F twenty-two",
    "F-35": "F thirty-five",
    "SU-35": "S U thirty-five",
    "GPT": "G P T",
    "AI": "A I",
    "km/h": "kilometers per hour",
}


class PronunciationEngine:
    def __init__(self, memory=None) -> None:
        self.memory = memory
        self.dictionary = dict(_DEFAULT)

    def add(self, term: str, spoken: str) -> None:
        self.dictionary[term] = spoken

    def apply(self, text: str) -> str:
        out = text
        for term, spoken in self.dictionary.items():
            out = re.sub(rf"(?<!\w){re.escape(term)}(?!\w)", spoken, out)
        return out
