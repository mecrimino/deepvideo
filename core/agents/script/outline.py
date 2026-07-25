"""
Outline Builder (10.13) — plan before writing the full script.

Distributes the research package's verified facts across the narrative sections
so each beat knows what it must cover, and produces a human-readable outline. The
facts assigned to a section are the *only* facts the draft generator may use for
it (supports fact protection, 10.14).
"""

from __future__ import annotations

from core.agents.script.models import ScriptInput, ScriptSection


class OutlineBuilder:
    def build(self, inp: ScriptInput, sections: list[ScriptSection]) -> tuple[list[str], list[list[str]]]:
        facts = [f"{f.subject} {f.predicate} {f.object}" for f in inp.knowledge_package.key_facts]
        middle = [s for s in sections if s.kind not in ("hook", "conclusion")]

        facts_by_section: list[list[str]] = [[] for _ in sections]
        if middle and facts:
            # round-robin the facts across the middle sections
            mid_indices = [i for i, s in enumerate(sections) if s in middle]
            for j, fact in enumerate(facts):
                facts_by_section[mid_indices[j % len(mid_indices)]].append(fact)

        # hook + conclusion can lean on the summary / top facts
        for i, s in enumerate(sections):
            if s.kind in ("hook", "conclusion") and facts:
                facts_by_section[i] = facts[:2]

        outline = [
            f"{s.title}: {'; '.join(facts_by_section[i][:2]) or inp.knowledge_package.topic}"
            for i, s in enumerate(sections)
        ]
        return outline, facts_by_section
