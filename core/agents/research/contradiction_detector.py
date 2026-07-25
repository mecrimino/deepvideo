"""
Contradiction Detection (9.10) — flag when sources disagree.

    Source A: top speed Mach 2.25   ·   Source B: top speed Mach 2.0

Facts are grouped by (subject, predicate). If a group holds differing objects it
is a contradiction: the agent flags it, prefers the more authoritative / better-
supported value, and records the uncertainty — never silently picks one value.
"""

from __future__ import annotations

from collections import defaultdict

from core.agents.research.models import Contradiction, SourcedFact


class ContradictionDetector:
    def detect(self, facts: list[SourcedFact]) -> tuple[list[SourcedFact], list[Contradiction]]:
        groups: dict[str, list[SourcedFact]] = defaultdict(list)
        for f in facts:
            groups[f.key()].append(f)

        kept: list[SourcedFact] = []
        contradictions: list[Contradiction] = []

        for key, group in groups.items():
            objects = {f.object.lower().strip(): f for f in group}
            if len(objects) <= 1:
                kept.extend(self._merge_same(group))
                continue
            # conflict: prefer the value with highest authority × support count
            best = max(group, key=lambda f: (f.authority, len(f.source_ids)))
            contradictions.append(Contradiction(
                subject=best.subject, predicate=best.predicate,
                values=sorted({f.object for f in group}), chosen=best.object,
                resolved=True,
                note=f"chose '{best.object}' (authority {best.authority:.2f}, "
                     f"{len(best.source_ids)} source(s)) over {sorted({f.object for f in group}) }",
            ))
            best.confidence = min(best.confidence, 0.7)  # uncertainty penalty
            kept.append(best)

        return kept, contradictions

    @staticmethod
    def _merge_same(group: list[SourcedFact]) -> list[SourcedFact]:
        """Same fact from several sources → one fact with merged evidence."""
        if len(group) == 1:
            return group
        base = group[0]
        for f in group[1:]:
            base.source_ids = list(dict.fromkeys(base.source_ids + f.source_ids))
            base.source_titles = list(dict.fromkeys(base.source_titles + f.source_titles))
            base.authority = max(base.authority, f.authority)
        return [base]
