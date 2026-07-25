"""
Overlay Planner (11.13) + Visual Constraints (11.14).

Requests overlays/graphics the Motion Graphics agent will build — lower thirds,
dates, location labels, technical specs, statistics, quotes — based on what each
scene's narration contains. Also produces the project-wide visual constraints
(orientation, minimum resolution, things to avoid) that guide media retrieval.
"""

from __future__ import annotations

import re

from core.agents.scene.models import VisualConstraints
from core.schemas.production import GraphicElement, Scene

_YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")
_STAT_RE = re.compile(r"\b\d[\d,\.]*\s?(%|percent|million|billion|km|mph|mach)\b", re.I)
_PERSON_RE = re.compile(r"\b[A-Z][a-z]+ [A-Z][a-z]+\b")
_PLACE_RE = re.compile(r"\b(country|city|nation|region)\b", re.I)


class OverlayPlanner:
    def plan(self, scenes: list[Scene]) -> list[Scene]:
        for s in scenes:
            s.overlays = self._overlays_for(s)
            s.graphics = self._graphics_for(s)
        return scenes

    def _overlays_for(self, scene: Scene) -> list[str]:
        text = scene.narration
        out: list[str] = []
        if _YEAR_RE.search(text):
            out.append("Date")
        if _STAT_RE.search(text):
            out.append("Statistics")
        if _PERSON_RE.search(text):
            out.append("Lower Third")
        if _PLACE_RE.search(text):
            out.append("Location Label")
        return out

    def _graphics_for(self, scene: Scene) -> list[GraphicElement]:
        graphics = list(scene.graphics)
        if scene.media and scene.media.type == "motion_graphics":
            graphics.append(GraphicElement(
                type="stat_card" if _STAT_RE.search(scene.narration) else "title",
                text=scene.visual_goal[:60], start=0.2, end=scene.duration, animation="scale_in",
            ))
        return graphics

    def constraints(self, style: str = "cinematic", orientation: str = "landscape") -> VisualConstraints:
        return VisualConstraints(style=style, preferred_orientation=orientation)
