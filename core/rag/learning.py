"""
Continuous Learning (8.13) — every finished project becomes new knowledge.

    project finished → research package + script + scene plan + lessons →
    ingest into the knowledge base

Next time a related topic comes up, the AI retrieves its own past work, so it
grows smarter with each project.
"""

from __future__ import annotations

from typing import Optional

from core.rag.ingestion import Ingestor
from core.rag.models import Document, Source
from core.utils.logging import get_logger

log = get_logger("rag.learning")


class ContinuousLearning:
    def __init__(self, ingestor: Ingestor) -> None:
        self.ingestor = ingestor

    def learn_from_project(
        self,
        project_id: str,
        *,
        topic: str,
        research: str = "",
        script: str = "",
        lessons: Optional[list[str]] = None,
    ) -> int:
        chunks = 0
        blocks = [
            ("research", research),
            ("script", script),
            ("lessons", "\n".join(lessons or [])),
        ]
        for kind, text in blocks:
            if not text.strip():
                continue
            src = Source(title=f"Project {project_id} — {kind}", source_type="project",
                         topic=topic, authority=0.7)
            chunks += len(self.ingestor.ingest_text(text, src))
        log.info("learned %d chunks from project %s", chunks, project_id)
        return chunks
