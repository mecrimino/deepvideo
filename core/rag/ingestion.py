"""
Document Ingestion (8.5) — the journey every document takes into the knowledge base.

    document → extract text → clean → chunk → (embed) → store

Produces :class:`Chunk`s carrying rich metadata + their :class:`Source` (title,
url, date, authority), then writes them to both the keyword index (SQLite/FTS5)
and the vector index (ChromaDB). Metadata is as important as content (8.5).
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.rag import extractors
from core.rag.chunking import chunk_text
from core.rag.keyword_index import KeywordIndex, get_keyword_index
from core.rag.models import Chunk, Document, Source
from core.rag.vector_index import VectorIndex
from core.utils.logging import get_logger

log = get_logger("rag.ingest")


class Ingestor:
    def __init__(self, keyword: Optional[KeywordIndex] = None, vector: Optional[VectorIndex] = None) -> None:
        self.keyword = keyword or get_keyword_index()
        self.vector = vector or VectorIndex()

    def ingest_document(self, doc: Document) -> list[Chunk]:
        text = extractors.clean_text(doc.text)
        pieces = chunk_text(text)
        chunks = [
            Chunk(doc_id=doc.id, index=i, text=piece, source=doc.source,
                  metadata={**doc.metadata, "title": doc.source.title})
            for i, piece in enumerate(pieces)
        ]
        if chunks:
            self.keyword.add(chunks)
            self.vector.add(chunks)
            log.info("ingested %d chunks from %s", len(chunks), doc.source.title or doc.id)
        return chunks

    def ingest_text(self, text: str, source: Source) -> list[Chunk]:
        return self.ingest_document(Document(text=text, source=source))

    def ingest_file(self, path: str | Path, *, source: Optional[Source] = None) -> list[Chunk]:
        p = Path(path)
        text = extractors.extract_file(p)
        src = source or Source(title=p.name, source_type="pdf" if p.suffix.lower() == ".pdf" else "user_file",
                               url=str(p), authority=0.6)
        return self.ingest_text(text, src)

    async def ingest_url(self, url: str, *, source: Optional[Source] = None) -> list[Chunk]:
        if "youtube.com" in url or "youtu.be" in url:
            text = extractors.extract_youtube_transcript(url)
            stype = "transcript"
        else:
            text = await extractors.fetch_url(url)
            stype = "web"
        src = source or Source(title=url, url=url, source_type=stype, authority=0.5)
        return self.ingest_text(text, src)
