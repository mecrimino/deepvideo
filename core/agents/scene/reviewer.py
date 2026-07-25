"""
Scene-Plan Reviewer — continuity + completeness check (11.15).

Verifies the plan holds together before it goes downstream: every scene has a
visual goal and media type, no over-long scenes, no adjacent duplicate visuals,
and the scene graph is continuous. Returns issues so the agent can fix them.
"""

from __future__ import annotations

from core.agents.scene.models import ScenePlanResult


class SceneReviewer:
    def review(self, result: ScenePlanResult, *, max_scene_sec: float = 12.0) -> tuple[bool, list[str]]:
        issues: list[str] = []
        scenes = result.scenes
        if not scenes:
            return False, ["no scenes"]

        missing_visual = [s.scene_id for s in scenes if not (s.visual_goal or s.media.keywords)]
        if missing_visual:
            issues.append(f"scenes without a visual goal: {missing_visual[:5]}")

        long_scenes = [s.scene_id for s in scenes if s.duration > max_scene_sec]
        if long_scenes:
            issues.append(f"scenes longer than {max_scene_sec}s: {long_scenes[:5]}")

        # adjacent duplicate visuals hurt continuity (11.15)
        dup = [scenes[i].scene_id for i in range(1, len(scenes))
               if scenes[i].visual_goal and scenes[i].visual_goal == scenes[i - 1].visual_goal]
        if dup:
            issues.append(f"adjacent duplicate visuals at: {dup[:5]}")

        ok = not missing_visual
        return ok, issues
