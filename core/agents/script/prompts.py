"""
Prompt templates (10.13 prompt chain) — kept in one place so the writing style
is consistent and easy to tune. Every prompt is grounded on the research package
and forbids inventing facts (10.14).
"""

from __future__ import annotations

HOOK_SYSTEM = (
    "You are an expert video scriptwriter. Write a single gripping opening line "
    "(the hook) that makes viewers stay. Use a surprising fact, mystery, question, "
    "contradiction, future-promise or emotional angle. Use only the given facts."
)

SECTION_SYSTEM = (
    "You are an expert documentary narrator-writer. Write spoken narration only "
    "(no camera directions, no headings). Ground every claim in the provided facts; "
    "never invent facts, numbers or dates. Match the requested audience and style."
)

SUMMARY_STYLE = {
    "children": "simple words, short sentences, playful tone",
    "general": "clear, engaging, accessible tone",
    "expert": "precise, technical, assumes domain knowledge",
}


def audience_style(audience: str) -> str:
    return SUMMARY_STYLE.get(audience, SUMMARY_STYLE["general"])
