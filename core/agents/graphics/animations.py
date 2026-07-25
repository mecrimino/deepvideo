"""
Animation Engine (16.9) + Procedural Animation (16.22).

Rather than storing thousands of pre-baked animations, this generates keyframes
from rules: a named animation (slide_up, fade, scale_in, glow...) becomes a small
set of keyframes with an easing curve. Infinite variations, consistent style,
tiny storage — and it adapts to any duration or frame size.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class Keyframe(BaseModel):
    t: float                                  # normalized 0..1 within the element
    props: dict[str, float] = Field(default_factory=dict)  # x,y,opacity,scale,rotate


class Animation(BaseModel):
    name: str
    easing: str = "ease_out"                  # linear | ease_in | ease_out | ease_in_out
    keyframes: list[Keyframe] = Field(default_factory=list)


# rule table: name → (enter keyframes, easing). Offsets are in fraction of frame.
_RULES = {
    "fade":        ("ease_out", [(0.0, {"opacity": 0.0}), (0.25, {"opacity": 1.0})]),
    "slide_up":    ("ease_out", [(0.0, {"y": 0.06, "opacity": 0.0}), (0.3, {"y": 0.0, "opacity": 1.0})]),
    "slide_in_left": ("ease_out", [(0.0, {"x": -0.15, "opacity": 0.0}), (0.3, {"x": 0.0, "opacity": 1.0})]),
    "scale_in":    ("ease_out", [(0.0, {"scale": 0.8, "opacity": 0.0}), (0.3, {"scale": 1.0, "opacity": 1.0})]),
    "glow":        ("ease_in_out", [(0.0, {"scale": 1.0}), (0.5, {"scale": 1.08}), (1.0, {"scale": 1.0})]),
    "zoom_in":     ("ease_out", [(0.0, {"scale": 1.3, "opacity": 0.0}), (0.3, {"scale": 1.0, "opacity": 1.0})]),
}


class AnimationEngine:
    def generate(self, name: str, *, hold: bool = True) -> Animation:
        easing, kfs = _RULES.get(name, _RULES["fade"])
        keyframes = [Keyframe(t=t, props=p) for t, p in kfs]
        # add an exit fade so elements leave cleanly
        if hold and keyframes[-1].t < 0.9:
            keyframes.append(Keyframe(t=0.9, props=dict(keyframes[-1].props)))
            keyframes.append(Keyframe(t=1.0, props={**keyframes[-1].props, "opacity": 0.0}))
        return Animation(name=name, easing=easing, keyframes=keyframes)

    @staticmethod
    def ease(easing: str, x: float) -> float:
        x = max(0.0, min(1.0, x))
        if easing == "linear":
            return x
        if easing == "ease_in":
            return x * x
        if easing == "ease_out":
            return 1 - (1 - x) * (1 - x)
        return 3 * x * x - 2 * x * x * x  # ease_in_out (smoothstep)

    def sample(self, anim: Animation, t: float, prop: str, default: float = 0.0) -> float:
        """Interpolate one property at normalized time ``t`` (for renderers)."""
        kfs = [k for k in anim.keyframes if prop in k.props]
        if not kfs:
            return default
        if t <= kfs[0].t:
            return kfs[0].props[prop]
        if t >= kfs[-1].t:
            return kfs[-1].props[prop]
        for a, b in zip(kfs, kfs[1:]):
            if a.t <= t <= b.t:
                span = (b.t - a.t) or 1e-6
                f = self.ease(anim.easing, (t - a.t) / span)
                return a.props[prop] + (b.props[prop] - a.props[prop]) * f
        return default
