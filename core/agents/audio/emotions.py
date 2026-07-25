"""
Emotion-Aware Narration (17.6) — tone should follow the narrative arc.

The same line sounds different in a discovery (curious), a launch (excited), a
disaster (serious) or a conclusion (calm). This maps a beat's content + position
in the video to a speaking emotion the Voice Engine applies.
"""

from __future__ import annotations


_KEYWORDS = {
    "excited": ("launch", "explosion", "fastest", "record", "incredible", "breakthrough"),
    "serious": ("war", "died", "crash", "failure", "disaster", "tragic", "threat"),
    "curious": ("discover", "mystery", "how", "why", "secret", "reveal", "hidden"),
    "calm": ("finally", "today", "legacy", "remains", "conclusion", "future"),
}


class EmotionMapper:
    def emotion_for(self, text: str, *, position: float = 0.5) -> str:
        t = (text or "").lower()
        for emotion, words in _KEYWORDS.items():
            if any(w in t for w in words):
                return emotion
        if position < 0.12:
            return "curious"    # the hook draws you in
        if position > 0.88:
            return "calm"       # the ending settles
        return "neutral"

    def arc(self, texts: list[str]) -> list[str]:
        n = max(1, len(texts))
        return [self.emotion_for(t, position=i / n) for i, t in enumerate(texts)]
