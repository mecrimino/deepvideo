"""
Duplicate Removal (13.14) — many providers host identical footage.

Compares candidate videos by the perceptual hash of their best shot's keyframe
(a lightweight stand-in for visual embeddings) and removes near-identical copies,
keeping the highest-scored one, so the asset library stays clean.
"""

from __future__ import annotations

from core.agents.image.duplicate import _hamming, dhash
from core.agents.video.models import VideoCandidate
from core.utils.logging import get_logger

log = get_logger("video.duplicate")

_THRESHOLD = 8


class DuplicateDetector:
    def dedupe(self, candidates: list[VideoCandidate]) -> list[VideoCandidate]:
        # compute a fingerprint from each candidate's best-shot keyframe
        hashed: list[tuple[VideoCandidate, str]] = []
        for c in candidates:
            kf = c.best_shot.keyframe if c.best_shot else ""
            hashed.append((c, dhash(kf) if kf else ""))

        kept: list[tuple[VideoCandidate, str]] = []
        seen_urls: set[str] = set()
        for c, h in sorted(hashed, key=lambda x: x[0].final_score, reverse=True):
            if c.url in seen_urls:
                continue
            if h and any(kh and _hamming(h, kh) <= _THRESHOLD for _c, kh in kept):
                continue
            seen_urls.add(c.url)
            kept.append((c, h))
        return [c for c, _ in kept]
