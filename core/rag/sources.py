"""
Knowledge Sources (8.3) — where the RAG system collects information.

    Internet (Tavily) · User Files · Previous Projects

Each source yields :class:`Document`s (text + :class:`Source` metadata) ready for
ingestion. The richer the base, the stronger the AI. Web access is via **Tavily**
(tools.md); with no key it simply returns nothing and the caller falls back.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from core.config import get_settings
from core.providers.api_manager import KeyPool, get_api_manager
from core.rag import extractors
from core.rag.models import Document, Source
from core.utils.logging import get_logger

log = get_logger("rag.sources")


class KnowledgeSources:
    def __init__(self) -> None:
        self._tavily = KeyPool(list(get_settings().tavily_keys))
        self._api = get_api_manager()

    @property
    def has_web(self) -> bool:
        return bool(self._tavily)

    # -- internet (8.3) ----------------------------------------------- #
    async def gather_web(self, topic: str, *, max_results: int = 6) -> list[Document]:
        if not self._tavily:
            return []
        try:
            data = await self._api.request(
                "POST", "https://api.tavily.com/search",
                pool=self._tavily,           # rotate on 429 — key lives in the JSON body
                key_in="body", body_key_name="api_key",
                json_body={"query": topic,
                           "max_results": max_results, "include_answer": True,
                           "include_raw_content": True},
                cache_key=f"tavily:search:{topic}:{max_results}",
            )
        except Exception as exc:
            log.warning("tavily gather failed: %s", exc)
            return []
        docs: list[Document] = []
        if data.get("answer"):
            docs.append(Document(text=str(data["answer"]),
                                 source=Source(title=f"Answer: {topic}", source_type="web",
                                               topic=topic, authority=0.6)))
        for r in data.get("results", []) or []:
            content = r.get("raw_content") or r.get("content") or ""
            if not content.strip():
                continue
            docs.append(Document(
                text=content,
                source=Source(title=r.get("title", ""), url=r.get("url", ""),
                              source_type="web", published=str(r.get("published_date", "")),
                              authority=float(r.get("score", 0.5) or 0.5), topic=topic),
            ))
        return docs

    # -- user files (8.3) --------------------------------------------- #
    def gather_user_files(self, directory: str | Path, *, topic: str = "") -> list[Document]:
        d = Path(directory)
        if not d.exists():
            return []
        docs: list[Document] = []
        for p in d.rglob("*"):
            if p.suffix.lower() not in (".pdf", ".txt", ".md", ".html", ".htm"):
                continue
            text = extractors.extract_file(p)
            if text.strip():
                docs.append(Document(text=text, source=Source(
                    title=p.name, url=str(p), source_type="user_file", topic=topic, authority=0.7)))
        return docs

    # -- previous projects (8.3) -------------------------------------- #
    def gather_previous_projects(self, memory, topic: str, *, top_k: int = 5) -> list[Document]:
        if memory is None:
            return []
        docs: list[Document] = []
        try:
            for hit in memory.recall(topic, top_k=top_k):
                docs.append(Document(text=hit.text, source=Source(
                    title=f"Past project ({hit.kind})", source_type="project",
                    topic=topic, authority=0.65)))
        except Exception:
            pass
        return docs
