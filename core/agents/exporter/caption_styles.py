"""
Caption styles for burn-in.

Each style is a small set of ffmpeg ``drawtext`` options; the exporter asks for
one by id and gets a ready-made filter clause. Ids are shared verbatim with the
frontend picker (``shared/types/edl.ts``), so adding a style here plus a card
there is all it takes.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

_FALLBACK = "C\\:/Windows/Fonts/arialbd.ttf"


def _font(*names: str) -> str:
    """First font that exists, as a drawtext path (drive colon escaped)."""
    base = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    for n in names:
        p = base / n
        if p.exists():
            return p.as_posix().replace(":", "\\:", 1)  # C:/... -> C\:/...
    return _FALLBACK


FONT_BOLD = _font("arialbd.ttf")
FONT_IMPACT = _font("impact.ttf", "arialbd.ttf")


@dataclass(frozen=True)
class CaptionStyle:
    id: str
    label: str
    font: str
    #: font size as a fraction of frame height
    size: float
    color: str = "white"
    #: filled box behind the text
    box: bool = False
    box_color: str = "black@0.5"
    box_pad: int = 12
    #: outline around the glyphs
    border_w: int = 0
    border_color: str = "black"
    shadow: int = 0
    #: "bottom" | "top" | "middle"
    place: str = "bottom"
    upper: bool = False

    def y_expr(self, h: int) -> str:
        if self.place == "top":
            return f"{h // 14}"
        if self.place == "middle":
            return "(h-text_h)/2"
        return f"h-text_h-{h // 10}"


STYLES: dict[str, CaptionStyle] = {
    s.id: s
    for s in [
        CaptionStyle("classic", "Classic", FONT_BOLD, 1 / 24, box=True),
        CaptionStyle(
            "outline", "Bold outline", FONT_BOLD, 1 / 20, border_w=5, shadow=2
        ),
        CaptionStyle(
            "pop", "Yellow pop", FONT_IMPACT, 1 / 16,
            color="0xFFE14D", border_w=6, upper=True,
        ),
        CaptionStyle(
            "banner", "Banner", FONT_BOLD, 1 / 26,
            box=True, box_color="black@0.78", box_pad=26,
        ),
        CaptionStyle("minimal", "Minimal", FONT_BOLD, 1 / 30, shadow=2),
        CaptionStyle("top", "Top bar", FONT_BOLD, 1 / 26, box=True, place="top"),
    ]
}

DEFAULT_STYLE = "classic"


def get_style(style_id: Optional[str]) -> CaptionStyle:
    return STYLES.get(style_id or DEFAULT_STYLE, STYLES[DEFAULT_STYLE])


def drawtext_clause(text: str, h: int, style_id: Optional[str], escape) -> str:
    """A leading-comma ``drawtext`` clause rendering ``text`` in the style."""
    st = get_style(style_id)
    body = escape(text.upper() if st.upper else text)
    parts = [
        f"drawtext=fontfile='{st.font}'",
        f"text='{body}'",
        f"fontcolor={st.color}",
        f"fontsize={max(18, int(h * st.size))}",
        "x=(w-text_w)/2",
        f"y={st.y_expr(h)}",
        "line_spacing=8",
    ]
    if st.box:
        parts += ["box=1", f"boxcolor={st.box_color}", f"boxborderw={st.box_pad}"]
    if st.border_w:
        parts += [f"borderw={st.border_w}", f"bordercolor={st.border_color}"]
    if st.shadow:
        parts += [f"shadowx={st.shadow}", f"shadowy={st.shadow}", "shadowcolor=black@0.8"]
    return "," + ":".join(parts)
