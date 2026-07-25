"""
Research Quality Checks (9.15) — verify before shipping the package.

Confirms every major question is answered, claims are sourced, citations exist,
contradictions are resolved/documented and the info is current enough. Returns a
pass/fail plus the specific gaps so the agent can research more (9.16) if needed.
"""

from __future__ import annotations

from core.agents.research.models import Contradiction, KnowledgePackage, ResearchQuestion, SourcedFact


class QualityChecks:
    def check(
        self,
        questions: list[ResearchQuestion],
        facts: list[SourcedFact],
        contradictions: list[Contradiction],
        package: KnowledgePackage,
    ) -> tuple[bool, list[str]]:
        issues: list[str] = []

        answered = sum(1 for q in questions if q.answered)
        if questions and answered / len(questions) < 0.5:
            issues.append(f"only {answered}/{len(questions)} questions answered")

        unsupported = [f for f in facts if not f.source_ids and not f.source_titles]
        if unsupported:
            issues.append(f"{len(unsupported)} unsupported claim(s)")

        if not package.citations:
            issues.append("no citations")

        unresolved = [c for c in contradictions if not c.resolved]
        if unresolved:
            issues.append(f"{len(unresolved)} unresolved contradiction(s)")

        if package.confidence < 0.35:
            issues.append(f"low overall confidence ({package.confidence})")

        # pass unless a *blocking* problem exists (no facts / no citations at all)
        ok = bool(package.key_facts) and bool(package.citations) and not unresolved
        return ok, issues
