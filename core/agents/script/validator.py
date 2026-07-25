"""
Fact Validator / Fact Protection (10.14) — the Script Agent must not invent facts.

Every technical claim should trace back to the research package. This checks each
scene's narration for numeric claims (years, specs) that do not appear in any
verified fact and flags them as unsupported so the reviewer can force a revision.
"""

from __future__ import annotations

from core.agents.script.models import ScriptOutput
from core.agents.script.utils import fact_strings, numbers_in
from core.schemas.production import KnowledgePackage
from core.utils.text import split_sentences


class FactValidator:
    def validate(self, output: ScriptOutput, package: KnowledgePackage) -> list[str]:
        supported_numbers: set[str] = set()
        for fs in fact_strings(package):
            supported_numbers |= numbers_in(fs)
        supported_numbers |= numbers_in(package.summary)

        unsupported: list[str] = []
        for scene in output.scenes:
            for sent in split_sentences(scene.narration):
                nums = numbers_in(sent)
                # a numeric claim not backed by any fact number is suspicious
                stray = {n for n in nums if len(n) >= 2 and n not in supported_numbers}
                if stray:
                    unsupported.append(sent)
        output.unsupported_claims = unsupported[:20]
        return output.unsupported_claims
