"""
Transition Manager (15.9) — transitions that match the story.

    topic change → crossfade · fast action → hard cut ·
    time skip → timeline animation · location change → map transition

Computes a per-clip transition plan from the scene emotions/content. The shared
clip model has no transition field, so the plan is returned as a sidecar map
{clip_id: transition} the renderer/exporter consumes.
"""

from __future__ import annotations

import re

from core.schemas.edl import Track

_YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")
_PLACE_RE = re.compile(r"\b(country|city|region|map|border|world|continent|nation)\b", re.I)


class TransitionManager:
    def plan(self, video_clips: list, scene_by_beat: dict) -> dict[str, str]:
        transitions: dict[str, str] = {}
        prev_scene = None
        for clip in sorted(video_clips, key=lambda c: c.range.startSec):
            scene = scene_by_beat.get(clip.beatId)
            transitions[clip.id] = self._transition(prev_scene, scene)
            prev_scene = scene
        return transitions

    def _transition(self, prev, scene) -> str:
        if prev is None or scene is None:
            return "hard_cut"
        text = (scene.narration or "").lower()
        if _PLACE_RE.search(text):
            return "map_transition"
        if _YEAR_RE.search(text) and _YEAR_RE.search(prev.narration or ""):
            return "timeline_animation"
        if scene.emotion == "excitement" or prev.emotion == "excitement":
            return "hard_cut"
        if scene.emotion != prev.emotion:
            return "crossfade"
        return "crossfade"
