"""
Embedding Generation (14.19) — turn a shot into a searchable vector.

The caption + objects + scene descriptors are embedded and stored in the vector
database (ChromaDB via the memory service), so shots are retrievable by meaning
rather than filename. Returns the stored record id as the embedding reference.
"""

from __future__ import annotations

from typing import Optional

from core.memory.embedder import get_embedder
from core.utils.logging import get_logger

log = get_logger("vision.embed")


class EmbeddingGenerator:
    def __init__(self, memory=None) -> None:
        self.memory = memory
        self.embedder = get_embedder()

    def generate(self, *, asset: str, caption: str, objects, scene: str) -> tuple[str, int]:
        text = " ".join([caption, *(objects or []), scene]).strip()
        dim = self.embedder.dim
        if not text or self.memory is None:
            return "", dim
        try:
            rec = self.memory.save(
                text, kind="semantic", scope="vision",
                metadata={"asset": asset, "scene": scene, "objects": list(objects or [])},
                confidence=0.7,
            )
            return rec.id, dim
        except Exception as exc:
            log.debug("embedding store failed: %s", exc)
            return "", dim
