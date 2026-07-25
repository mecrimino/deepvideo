"""
Graphics Builder + Render Package (16.4/16.19).

Renders each graphic spec to a transparent PNG overlay with Pillow — title cards,
lower thirds, stat cards, charts, timelines, maps, callouts — using the theme,
typography and layout engines. The :class:`RenderPackage` (16.19) lists every
element with its animation and timing; the Timeline/Exporter composites the PNGs.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from core.agents.graphics.animations import Animation
from core.agents.graphics.callouts import CalloutGraphic
from core.agents.graphics.charts import ChartGraphic
from core.agents.graphics.layout import LayoutEngine
from core.agents.graphics.maps import MapGraphic
from core.agents.graphics.themes import Theme
from core.agents.graphics.timelines import TimelineGraphic
from core.agents.graphics.typography import TypographyEngine
from core.config import get_settings
from core.providers.storage import rel
from core.utils.ids import new_id
from core.utils.logging import get_logger

log = get_logger("graphics.render")


class GraphicSpec(BaseModel):
    scene_id: int = 0
    type: str = "title"       # 16.6 types
    text: str = ""
    subtitle: str = ""
    data: dict = Field(default_factory=dict)   # chart/map/timeline payloads
    animation: str = "fade"
    start: float = 0.0
    end: float = 3.0
    position: str = "center"
    png: str = ""
    keyframes: Optional[Animation] = None
    subject_bbox: list = Field(default_factory=list)


class RenderPackage(BaseModel):
    theme: str = "dark_documentary"
    elements: list[GraphicSpec] = Field(default_factory=list)
    status: str = "success"

    def by_scene(self) -> dict[int, list[GraphicSpec]]:
        out: dict[int, list[GraphicSpec]] = {}
        for e in self.elements:
            out.setdefault(e.scene_id, []).append(e)
        return out


class GraphicsRenderer:
    def __init__(self) -> None:
        self.typo = TypographyEngine()
        self.layout = LayoutEngine()
        self.chart = ChartGraphic()
        self.timeline = TimelineGraphic()
        self.map = MapGraphic()
        self.callout = CalloutGraphic()
        self.dir = get_settings().paths.cache / "graphics"
        self.dir.mkdir(parents=True, exist_ok=True)

    def render(self, spec: GraphicSpec, theme: Theme, *, w: int = 1920, h: int = 1080) -> str:
        try:
            from PIL import Image, ImageDraw

            img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)
            self._draw(spec, theme, draw, img, w, h)
            out = self.dir / f"g_{spec.scene_id}_{spec.type}_{new_id()}.png"
            img.save(out)
            return rel(out)
        except Exception as exc:
            log.warning("graphic render failed (%s): %s", spec.type, exc)
            return ""

    def _draw(self, spec, theme, draw, img, w, h) -> None:
        t = spec.type
        if t == "title":
            self._panel_text(draw, theme, w, h, spec.text, "title", "center", spec.subtitle)
        elif t in ("subtitle", "kinetic"):
            if t == "kinetic":
                self.callout.draw_kinetic(draw, theme, self.typo, w, h, spec.text)
            else:
                self._panel_text(draw, theme, w, h, spec.text, "subtitle", "center")
        elif t == "lower_third":
            self._lower_third(draw, theme, w, h, spec.text, spec.subtitle)
        elif t == "stat":
            self._stat(draw, theme, w, h, spec.text, spec.subtitle)
        elif t == "chart":
            self.chart.draw(draw, theme, self.typo, w, h, spec.data)
        elif t == "timeline":
            self.timeline.draw(draw, theme, self.typo, w, h, spec.data)
        elif t == "map":
            self.map.draw(draw, theme, self.typo, w, h, spec.data)
        elif t in ("callout", "arrow"):
            self.callout.draw_callout(draw, theme, self.typo, w, h, spec.text, spec.subject_bbox)
        elif t == "highlight":
            self.callout.draw_highlight(draw, theme, w, h, spec.subject_bbox)
        else:
            self._panel_text(draw, theme, w, h, spec.text, "subtitle", "center")

    # ---- basic cards (Graphics Builder) ----------------------------- #
    def _panel_text(self, draw, theme, w, h, text, level, pos, subtitle="") -> None:
        font = self.typo.font(theme, level, h)
        wrapped = self.typo.wrap(text, level)
        x, y, _a = self.layout.position("title" if level == "title" else "subtitle", w, h)
        if theme.shadow:
            draw.multiline_text((x + 3, y + 3), wrapped, font=font, fill=(0, 0, 0, 180), anchor="mm", align="center", spacing=8)
        draw.multiline_text((x, y), wrapped, font=font, fill=(*theme.text, 255), anchor="mm", align="center", spacing=8)
        if subtitle:
            sub = self.typo.font(theme, "subtitle", h)
            draw.text((x, y + int(h * 0.09)), subtitle, font=sub, fill=(*theme.accent, 255), anchor="mm")

    def _lower_third(self, draw, theme, w, h, name, subtitle) -> None:
        x, y, _a = self.layout.position("lower_third", w, h)
        bar_h = int(h * 0.11)
        draw.rectangle([x, y, x + int(w * 0.42), y + bar_h], fill=(*theme.bg, 210))
        draw.rectangle([x, y, x + 8, y + bar_h], fill=(*theme.accent, 255))
        draw.text((x + 22, y + int(bar_h * 0.28)), name, font=self.typo.font(theme, "subtitle", h), fill=(*theme.text, 255), anchor="lm")
        if subtitle:
            draw.text((x + 22, y + int(bar_h * 0.70)), subtitle, font=self.typo.font(theme, "label", h), fill=(*theme.accent, 255), anchor="lm")

    def _stat(self, draw, theme, w, h, number, label) -> None:
        x, y, _a = self.layout.position("stat", w, h)
        draw.text((x, y), number, font=self.typo.font(theme, "stat", h), fill=(*theme.accent, 255), anchor="lm")
        if label:
            draw.text((x, y + int(h * 0.10)), label, font=self.typo.font(theme, "subtitle", h), fill=(*theme.text, 255), anchor="lm")
