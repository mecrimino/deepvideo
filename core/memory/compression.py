"""
Memory Compression (7.15) — store the summary, archive the original.

    100 pages of research → summarize → store summary → keep original archive

Big blobs (long research, transcripts) are summarized with the LLM before being
stored as searchable memory, while the full original is kept in the archive
(SQLite) in case it is needed later. This reduces storage and keeps retrieval
focused, without losing information.
"""

from __future__ import annotations


from core.memory.store import Store, get_store
from core.providers.llm import get_llm
from core.providers.llm.router import LLMUnavailable
from core.utils.logging import get_logger

log = get_logger("memory.compress")

# only compress text longer than this many characters
_COMPRESS_THRESHOLD = 1200


class Compressor:
    def __init__(self, store: Store | None = None) -> None:
        self._store = store or get_store()
        self._llm = get_llm()

    def should_compress(self, text: str) -> bool:
        return len(text or "") > _COMPRESS_THRESHOLD

    async def compress(self, text: str, *, ref_id: str) -> str:
        """Return a summary and archive the original; falls back to a truncation."""
        if not self.should_compress(text):
            return text
        self._store.archive(ref_id, text)  # keep the original (7.15)
        if self._llm.available:
            try:
                summary = await self._llm.chat(
                    "You compress documents into dense, factual summaries.",
                    f"Summarize the following in <=200 words, keeping key facts:\n\n{text[:8000]}",
                    effort="fast", max_tokens=400)
                if summary.strip():
                    return summary.strip()
            except LLMUnavailable:
                pass
            except Exception as exc:
                log.warning("compression failed, truncating: %s", exc)
        # deterministic fallback: keep the head
        return text[:_COMPRESS_THRESHOLD].rsplit(" ", 1)[0] + " …"

    def restore(self, ref_id: str) -> str | None:
        """Retrieve the archived original for a compressed memory."""
        return self._store.get_archive(ref_id)
