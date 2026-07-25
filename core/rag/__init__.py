"""
RAG & Knowledge System (Ch8) — the research engine.

Built from scratch per Ch8 with tools.md tech: **ChromaDB** vector index (8.8),
**SQLite/FTS5** keyword index (8.9), **Tavily** web + **yt-dlp** transcripts +
**PaddleOCR** scanned docs (8.3/8.5), the Ch7 **knowledge graph** (8.14),
**LLM + LangChain-core** for query understanding/multi-step (8.15/8.18), with
reranking (8.10), organized cited context (8.11/8.12), caching (8.16), graceful
failure (8.17) and continuous learning (8.13).

Gives the AI grounded, up-to-date, cited knowledge instead of LLM memory alone.
"""

from core.rag.models import (
    AssembledContext,
    Chunk,
    Citation,
    Document,
    RetrievedChunk,
    Source,
)
from core.rag.system import RAGSystem

__all__ = [
    "RAGSystem", "Document", "Chunk", "RetrievedChunk", "Citation", "Source",
    "AssembledContext",
]
