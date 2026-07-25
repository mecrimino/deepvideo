"""
Narrative Planner (10.5/10.6) + Audience Model (10.8).

Chooses the narrative structure for the video category (10.6: HOOK → BACKGROUND
→ PROBLEM → DISCOVERY → CLIMAX → CONCLUSION and variants) and allocates a target
duration to each beat (10.11). The audience model sets the writing register the
draft generator will use (vocabulary, depth, pacing).
"""

from __future__ import annotations

from core.agents.script.models import ScriptInput, ScriptSection

# 10.6 — narrative templates by video type
_TEMPLATES: dict[str, list[str]] = {
    "documentary": ["hook", "background", "problem", "discovery", "climax", "conclusion"],
    "educational": ["hook", "background", "explanation", "examples", "conclusion"],
    "explainer": ["hook", "background", "explanation", "examples", "conclusion"],
    "tutorial": ["hook", "overview", "steps", "tips", "conclusion"],
    "ranking": ["hook", "background", "countdown", "top_pick", "conclusion"],
    "news": ["hook", "what_happened", "context", "impact", "conclusion"],
    "story": ["hook", "setup", "conflict", "turning_point", "resolution"],
}
_DEFAULT = ["hook", "background", "body", "conclusion"]


class NarrativePlanner:
    def plan(self, inp: ScriptInput) -> list[ScriptSection]:
        vtype = self._type(inp)
        kinds = _TEMPLATES.get(vtype, _DEFAULT)
        total = inp.target_duration
        sections = [ScriptSection(kind=k, title=k.replace("_", " ").title()) for k in kinds]
        self._allocate(sections, total)
        return sections

    def _type(self, inp: ScriptInput) -> str:
        style = (inp.style or "").lower()
        for key in _TEMPLATES:
            if key in style:
                return key
        return "documentary"

    def _allocate(self, sections: list[ScriptSection], total: float) -> None:
        """10.11 — hook is short, conclusion modest, the body gets the rest."""
        hook = min(30.0, total * 0.08)
        conclusion = total * 0.12
        middle = [s for s in sections if s.kind not in ("hook", "conclusion")]
        rest = max(0.0, total - hook - conclusion)
        per = rest / len(middle) if middle else 0.0
        for s in sections:
            if s.kind == "hook":
                s.target_duration = round(hook, 1)
            elif s.kind == "conclusion":
                s.target_duration = round(conclusion, 1)
            else:
                s.target_duration = round(per, 1)
