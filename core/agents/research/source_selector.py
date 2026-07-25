"""
Search Planning (9.7) — choose the right sources per question.

Different questions need different sources: specifications → official docs;
history → Wikipedia/books/news; a recent launch → news/official blog/press
release. The selector annotates each question with its preferred source types so
the retrieval engine can weight/target them.
"""

from __future__ import annotations

from core.agents.research.models import ResearchQuestion

# question category → preferred source types (9.7)
_SOURCES: dict[str, list[str]] = {
    "overview": ["wikipedia", "web"],
    "history": ["wikipedia", "web", "books"],
    "technical": ["official", "documentation", "web"],
    "people": ["wikipedia", "web"],
    "recent": ["news", "official_blog", "press_release", "web"],
    "future": ["news", "official", "web"],
    "general": ["web", "wikipedia"],
}


class SourceSelector:
    def assign(self, questions: list[ResearchQuestion]) -> list[ResearchQuestion]:
        for q in questions:
            q.sources = _SOURCES.get(q.category, _SOURCES["general"])
        return questions
