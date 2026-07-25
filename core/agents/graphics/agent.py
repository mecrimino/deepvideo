"""
Motion Graphics & Animation Agent (Ch16) — the motion designer.

Automatically designs and *renders* professional motion graphics (16.1): titles,
lower thirds, stat cards, charts, timelines, maps, callouts and kinetic
typography — themed for consistency (16.16), positioned to avoid the subject
(16.8), timed to the narration (16.17), and animated procedurally (16.22). It
determines *how* to visualise the Scene Planner's intent (16.5) and emits a
:class:`RenderPackage` (16.19) of PNG overlays + animation for the Timeline agent.

Built from scratch per Ch16 (folder layout 16.20) with tools.md tech: Pillow
(render) · OpenCV (highlight boxes) · Pydantic · Loguru.
"""

from __future__ import annotations

import re
from typing import Optional

from core.agents.base import AgentContext, BaseAgent
from core.agents.graphics.animations import AnimationEngine
from core.agents.graphics.renderer import GraphicSpec, GraphicsRenderer, RenderPackage
from core.agents.graphics.templates import MotionTemplates
from core.agents.graphics.themes import ThemeManager
from core.schemas.production import Scene, ScenePlan

_YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")
_NUM_RE = re.compile(r"\b(\d[\d,\.]*)\s?(%|percent|million|billion|mph|mach|km)?", re.I)
_PLACE_RE = re.compile(r"\bfrom\s+([A-Z][a-z]+)\s+to\s+([A-Z][a-z]+)\b")
_PERSON_RE = re.compile(r"\b([A-Z][a-z]+ [A-Z][a-z]+)\b")


class MotionGraphicsAgent(BaseAgent[ScenePlan, RenderPackage]):
    name = "graphics"

    def __init__(self, ctx: AgentContext, *, theme: str = "dark_documentary") -> None:
        super().__init__(ctx)
        self.themes = ThemeManager()
        self.animation = AnimationEngine()
        self.templates = MotionTemplates()
        self.renderer = GraphicsRenderer()
        self.theme_name = theme

    async def run(self, plan: ScenePlan) -> RenderPackage:
        return await self.design(plan.scenes, theme=self.theme_name)

    async def design(self, scenes: list[Scene], *, theme: str = "dark_documentary",
                     render: bool = True) -> RenderPackage:
        thm = self.themes.get(theme)
        w = self.ctx.memory.working.get("width", 1920)
        h = self.ctx.memory.working.get("height", 1080)
        pkg = RenderPackage(theme=thm.name)

        for i, scene in enumerate(scenes):
            for spec in self._specs_for(scene, first=i == 0):
                tpl = self.templates.get(spec.type)
                spec.animation = tpl.animation
                spec.start = round(scene.range_start + tpl.lead, 2)
                spec.end = round(scene.range_start + scene.duration * tpl.hold, 2)
                spec.keyframes = self.animation.generate(spec.animation)  # 16.22
                if render:
                    spec.png = self.renderer.render(spec, thm, w=w, h=h)
                pkg.elements.append(spec)

        self.ctx.memory.working.set("render_package", pkg.model_dump())
        self.ctx.emit("graphics.designed", elements=len(pkg.elements), theme=thm.name)
        return pkg

    # ------------------------------------------------------------------ #
    # 16.5/16.6 — choose which graphics a scene needs
    # ------------------------------------------------------------------ #
    def _specs_for(self, scene: Scene, *, first: bool) -> list[GraphicSpec]:
        specs: list[GraphicSpec] = []
        text = scene.narration or scene.visual_goal
        topic = self.ctx.memory.working.get("topic", "")

        if first and topic:
            specs.append(GraphicSpec(scene_id=scene.scene_id, type="title", text=topic))

        # explicit overlays from the Scene Planner (11.13)
        for ov in scene.overlays:
            ovl = ov.lower()
            if "date" in ovl and _YEAR_RE.search(text):
                specs.append(GraphicSpec(scene_id=scene.scene_id, type="lower_third",
                                         text=_YEAR_RE.search(text).group(0), subtitle="Date"))
            elif "statistic" in ovl:
                specs.append(self._stat_spec(scene, text))
            elif "lower third" in ovl:
                m = _PERSON_RE.search(text)
                specs.append(GraphicSpec(scene_id=scene.scene_id, type="lower_third",
                                         text=(m.group(1) if m else topic), subtitle=""))
            elif "location" in ovl:
                specs.append(self._map_spec(scene, text))

        # motion-graphics scenes get a data visual
        if scene.media and scene.media.type == "motion_graphics" and not specs:
            specs.append(self._auto_graphic(scene, text))

        return specs

    def _auto_graphic(self, scene: Scene, text: str) -> GraphicSpec:
        years = _YEAR_RE.findall(text)
        if len(_all_years(text)) >= 2:
            return self._timeline_spec(scene, text)
        if _PLACE_RE.search(text):
            return self._map_spec(scene, text)
        if re.search(r"\d", text):
            return self._stat_spec(scene, text)
        return GraphicSpec(scene_id=scene.scene_id, type="title", text=scene.visual_goal[:40] or text[:40])

    def _stat_spec(self, scene: Scene, text: str) -> GraphicSpec:
        m = _NUM_RE.search(text)
        number = (m.group(1) + (m.group(2) or "")) if m else "—"
        nums = [float(n.replace(",", "")) for n in re.findall(r"\d[\d,\.]*", text)][:4]
        if len(nums) >= 2:
            return GraphicSpec(scene_id=scene.scene_id, type="chart",
                               data={"labels": [f"#{i+1}" for i in range(len(nums))], "values": nums})
        return GraphicSpec(scene_id=scene.scene_id, type="stat", text=number,
                           subtitle=scene.visual_goal[:30])

    def _timeline_spec(self, scene: Scene, text: str) -> GraphicSpec:
        return GraphicSpec(scene_id=scene.scene_id, type="timeline",
                           data={"years": _all_years(text)})

    def _map_spec(self, scene: Scene, text: str) -> GraphicSpec:
        m = _PLACE_RE.search(text)
        if m:
            points = [(m.group(1), 0.25, 0.4), (m.group(2), 0.72, 0.55)]
        else:
            caps = _PERSON_RE.findall(text) or [scene.visual_goal[:20] or "Location"]
            points = [(caps[0], 0.35, 0.5)]
        return GraphicSpec(scene_id=scene.scene_id, type="map", data={"points": points})


def _all_years(text: str) -> list[str]:
    return sorted({m.group(0) for m in _YEAR_RE.finditer(text)})
