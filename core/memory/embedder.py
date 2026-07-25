"""
Text embedder (7.12/7.13) — turns text into a vector so search works by meaning.

tools.md lists BGE/Nomic embeddings as a *later* upgrade; for now this is a
deterministic, offline **hashed bag-of-words** embedder with character-trigram
features, exposed behind a stable interface. ChromaDB calls it as its embedding
function, so swapping in a real model later touches only this file (7.18 stable
API / replaceable components).
"""

from __future__ import annotations

import hashlib
import re
from functools import lru_cache

import numpy as np

from core.config import get_settings

_TOKEN_RE = re.compile(r"[a-z0-9]+")
_STOP = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is",
    "are", "was", "were", "it", "this", "that", "as", "at", "by", "be", "from",
}


def _tokens(text: str) -> list[str]:
    return [t for t in _TOKEN_RE.findall((text or "").lower()) if t not in _STOP and len(t) > 1]


class HashedEmbedder:
    def __init__(self, dim: int | None = None) -> None:
        self.dim = dim or get_settings().embed_dim
        self.name = "deepvision-hashed"

    def _bucket(self, token: str) -> int:
        h = hashlib.md5(token.encode("utf-8")).digest()
        return int.from_bytes(h[:4], "little") % self.dim

    def embed(self, text: str) -> np.ndarray:
        vec = np.zeros(self.dim, dtype=np.float32)
        for tok in _tokens(text):
            vec[self._bucket(tok)] += 1.0
            for i in range(len(tok) - 2):
                vec[self._bucket(tok[i : i + 3])] += 0.5
        n = float(np.linalg.norm(vec))
        if n > 0:
            vec /= n
        return vec

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        return [self.embed(t).tolist() for t in texts]

    @staticmethod
    def similarity(a: np.ndarray, b: np.ndarray) -> float:
        if a is None or b is None or a.size == 0 or b.size == 0:
            return 0.0
        na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
        return float(np.dot(a, b) / (na * nb)) if na and nb else 0.0


@lru_cache(maxsize=1)
def get_embedder() -> HashedEmbedder:
    return HashedEmbedder()


def cosine(a: str, b: str) -> float:
    """Semantic similarity between two raw strings (0..1)."""
    emb = get_embedder()
    return max(0.0, min(1.0, emb.similarity(emb.embed(a), emb.embed(b))))
