"""
RAG data contracts (Pydantic) — documents, chunks, retrieved evidence, citations
and the organized context handed to the LLM.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from core.utils.ids import new_id


class Source(BaseModel):
    """Where a piece of knowledge came from (8.5 metadata / 8.12 citations)."""

    id: str = Field(default_factory=lambda: new_id("src_"))
    title: str = ""
    url: str = ""
    source_type: str = "web"   # web | pdf | wikipedia | transcript | user_file | project
    author: str = ""
    published: str = ""        # publication date (ISO or freeform)
    authority: float = 0.5     # trust/authority 0..1 (8.10 reranking)
    topic: str = ""


class Document(BaseModel):
    id: str = Field(default_factory=lambda: new_id("doc_"))
    text: str = ""
    source: Source = Field(default_factory=Source)
    metadata: dict[str, Any] = Field(default_factory=dict)


class Chunk(BaseModel):
    id: str = Field(default_factory=lambda: new_id("chk_"))
    doc_id: str = ""
    index: int = 0
    text: str = ""
    source: Source = Field(default_factory=Source)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RetrievedChunk(BaseModel):
    chunk: Chunk
    similarity: float = 0.0     # vector score
    keyword_score: float = 0.0  # lexical score
    rerank_score: float = 0.0   # final rerank score (8.10)
    method: str = "vector"      # vector | keyword | graph | hybrid


class Citation(BaseModel):
    """8.12 — every fact remembers where it came from."""

    fact: str
    source_id: str = ""
    title: str = ""
    url: str = ""
    published: str = ""
    confidence: float = 0.5


class AssembledContext(BaseModel):
    """8.11 — organized context (not a dump) + citations, ready for the LLM."""

    query: str
    background: list[str] = Field(default_factory=list)
    technical_details: list[str] = Field(default_factory=list)
    timeline: list[str] = Field(default_factory=list)
    important_facts: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    sources: list[Source] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    text: str = ""             # the assembled prompt-ready context block
    chunks: list[RetrievedChunk] = Field(default_factory=list)

    @property
    def grounded(self) -> bool:
        return bool(self.chunks)
