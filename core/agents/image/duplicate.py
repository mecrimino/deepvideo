"""
Duplicate Detection (12.11) — search results are full of near-identical images.

Computes a perceptual **difference hash** (dHash) with Pillow for each candidate's
thumbnail and removes near-duplicates (small Hamming distance), keeping the
highest-scored copy. When thumbnails aren't downloaded it falls back to de-duping
by tag/query overlap.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.agents.image.models import ImageCandidate
from core.utils.logging import get_logger

log = get_logger("image.duplicate")

_HAMMING_THRESHOLD = 8  # out of 64 bits


def dhash(image_path: str | Path, hash_size: int = 8) -> str:
    try:
        from PIL import Image

        img = Image.open(image_path).convert("L").resize((hash_size + 1, hash_size))
        px = list(img.getdata())
        bits = 0
        idx = 0
        for row in range(hash_size):
            for col in range(hash_size):
                left = px[row * (hash_size + 1) + col]
                right = px[row * (hash_size + 1) + col + 1]
                bits = (bits << 1) | (1 if left > right else 0)
                idx += 1
        return f"{bits:016x}"
    except Exception as exc:
        log.debug("dhash failed: %s", exc)
        return ""


def _hamming(a: str, b: str) -> int:
    if not a or not b:
        return 64
    return bin(int(a, 16) ^ int(b, 16)).count("1")


class DuplicateDetector:
    def dedupe(self, candidates: list[ImageCandidate]) -> list[ImageCandidate]:
        with_hash = [c for c in candidates if c.phash]
        without = [c for c in candidates if not c.phash]

        kept: list[ImageCandidate] = []
        for c in sorted(with_hash, key=lambda x: x.final_score, reverse=True):
            if any(_hamming(c.phash, k.phash) <= _HAMMING_THRESHOLD for k in kept):
                continue
            kept.append(c)

        # candidates without a hash: fall back to tag/query de-dup
        seen_keys: set[str] = set()
        for c in without:
            key = (c.query.lower() + "|" + ",".join(sorted(c.tags))).strip()
            if key in seen_keys:
                continue
            seen_keys.add(key)
            kept.append(c)
        return kept
