"""
Motion Templates (16.18) — reusable presets for consistency + speed.

Each graphic type maps to a template: a default animation, position and timing
share. Templates avoid regenerating everything from scratch and keep a project's
graphics visually consistent.
"""

from __future__ import annotations

from pydantic import BaseModel


class Template(BaseModel):
    type: str
    animation: str
    position: str
    lead: float = 0.3      # seconds after scene start
    hold: float = 0.9      # fraction of scene the graphic stays


_TEMPLATES: dict[str, Template] = {
    "title": Template(type="title", animation="slide_up", position="center", lead=0.3, hold=0.6),
    "subtitle": Template(type="subtitle", animation="fade", position="center", hold=0.7),
    "lower_third": Template(type="lower_third", animation="slide_in_left", position="bottom_left", hold=0.7),
    "stat": Template(type="stat", animation="scale_in", position="right", hold=0.8),
    "chart": Template(type="chart", animation="fade", position="right", hold=0.9),
    "timeline": Template(type="timeline", animation="fade", position="bottom", hold=0.9),
    "map": Template(type="map", animation="fade", position="center", hold=0.9),
    "callout": Template(type="callout", animation="scale_in", position="subject", hold=0.7),
    "highlight": Template(type="highlight", animation="fade", position="subject", hold=0.8),
    "kinetic": Template(type="kinetic", animation="zoom_in", position="center", lead=0.1, hold=0.5),
}


class MotionTemplates:
    def get(self, gtype: str) -> Template:
        return _TEMPLATES.get(gtype, _TEMPLATES["title"])
