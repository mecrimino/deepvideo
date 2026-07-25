"""
Motion Graphics & Animation Agent (Ch16) — the motion designer.

Built from scratch per Ch16 (folder layout 16.20) with tools.md tech: **Pillow**
renders titles, lower thirds, stat cards, charts, timelines, maps and callouts to
PNG overlays; **OpenCV** draws object-highlight boxes; a **procedural animation
engine** (16.22) generates keyframes with easing; a theme manager (16.16) keeps
the look consistent. Emits a :class:`RenderPackage` (16.19) the Timeline agent
composites — real graphics, not just specs.
"""

from core.agents.graphics.agent import MotionGraphicsAgent
from core.agents.graphics.renderer import GraphicSpec, RenderPackage

__all__ = ["MotionGraphicsAgent", "RenderPackage", "GraphicSpec"]
