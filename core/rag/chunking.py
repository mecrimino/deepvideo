"""
Chunking Strategy (8.6) — split a document into good retrieval units.

A 200-page report can't be embedded as one block. Good chunks are self-contained,
meaningful, and neither too short nor too long. This packs whole sentences (never
cutting mid-sentence) into ~target-sized chunks with a small overlap so context
carries across boundaries, and drops chunks that are too tiny to be useful.
"""

from __future__ import annotations

import re

from core.utils.text import split_sentences

_TARGET = 800      # target characters per chunk
_OVERLAP = 120     # characters of overlap between consecutive chunks
_MIN = 80          # discard chunks shorter than this


def _paragraphs(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", text or "") if p.strip()]


def chunk_text(text: str, *, target: int = _TARGET, overlap: int = _OVERLAP) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    chunks: list[str] = []
    for para in _paragraphs(text):
        # a paragraph that already fits becomes one chunk
        if len(para) <= target:
            chunks.append(para)
            continue
        # otherwise pack its sentences into target-sized chunks
        buf = ""
        for sent in split_sentences(para):
            if buf and len(buf) + len(sent) + 1 > target:
                chunks.append(buf.strip())
                # carry a small overlap tail into the next chunk
                buf = (buf[-overlap:] + " " + sent).strip() if overlap else sent
            else:
                buf = f"{buf} {sent}".strip()
        if buf:
            chunks.append(buf.strip())
    kept = [c for c in chunks if len(c) >= _MIN]
    if kept:
        return kept
    # a short-but-whole document is still valid knowledge (e.g. a single fact)
    return [text[:target]] if len(text) >= 20 else []
