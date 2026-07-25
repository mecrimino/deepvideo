"""
Camera Planner (11.8) — make even static media feel cinematic.

Chooses a camera movement per scene (slow zoom-in/out, pan, tilt, parallax, Ken
Burns) based on the scene's emotion, media type and duration. Images especially
benefit from motion (Ken Burns) so they don't feel like flat stills.
"""

from __future__ import annotations

from core.schemas.production import Scene


class CameraPlanner:
    def plan(self, scenes: list[Scene]) -> list[Scene]:
        for i, s in enumerate(scenes):
            s.camera_motion = self._motion(s, first=i == 0)
        return scenes

    def _motion(self, scene: Scene, *, first: bool) -> str:
        emotion = scene.emotion
        media = scene.media.type if scene.media else "video"
        if media == "image":
            # stills need the Ken Burns effect to feel alive
            return "ken_burns" if emotion in ("neutral", "curiosity") else "slow_zoom_in"
        if emotion == "excitement":
            return "fast_zoom_in"
        if emotion in ("serious", "inspirational"):
            return "slow_zoom_out"
        if emotion == "suspense":
            return "slow_push_in"
        if scene.duration > 6:
            return "slow_pan"
        return "slow_zoom_in"
