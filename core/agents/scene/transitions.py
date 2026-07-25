"""
Transition Planner (11.12) — transitions that support the story, not random cuts.

    historical change → crossfade · fast action → hard cut ·
    location change → map animation · time jump → timeline graphic

Chosen from the relationship between consecutive scenes (emotion shift, topic
change, time markers). The first scene opens on a hard cut.
"""

from __future__ import annotations

import re

from core.schemas.production import Scene

_YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")
_PLACE_RE = re.compile(r"\b(country|city|region|map|border|nation|world|continent)\b", re.I)


class TransitionPlanner:
    def plan(self, scenes: list[Scene]) -> list[Scene]:
        prev: Scene | None = None
        for s in scenes:
            s.transition = self._transition(prev, s)
            prev = s
        return scenes

    def _transition(self, prev: Scene | None, scene: Scene) -> str:
        if prev is None:
            return "hard_cut"
        text = scene.narration.lower()
        if _PLACE_RE.search(text):
            return "map_animation"            # location change (11.12)
        if _YEAR_RE.search(text) and _YEAR_RE.search(prev.narration or ""):
            return "timeline_graphic"         # time jump
        if scene.emotion == "excitement" or prev.emotion == "excitement":
            return "hard_cut"                 # fast action
        if scene.emotion != prev.emotion:
            return "crossfade"                # tonal / historical change
        return "crossfade"
