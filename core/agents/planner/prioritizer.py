"""
Prioritizer (6.10) — assign a priority level to every task.

    P1 Critical    : research, script, scene planning
    P2 Important   : images, videos, voice
    P3 Enhancement : animations, transitions, particle effects

If resources are limited the Director runs critical work first (6.10). Priority
is derived from the task's group so the whole plan is tiered consistently.
"""

from __future__ import annotations

from core.agents.planner.models import PlanTask, Priority

# group -> priority (6.10). Structural tasks on the critical path (timeline,
# export) are critical; enhancement work (graphics/maps/subtitle) is P3.
_GROUP_PRIORITY: dict[str, Priority] = {
    "research": Priority.CRITICAL,
    "fact_check": Priority.CRITICAL,
    "script": Priority.CRITICAL,
    "scene": Priority.CRITICAL,
    "timeline": Priority.CRITICAL,
    "export": Priority.CRITICAL,
    "assets": Priority.IMPORTANT,
    "image_search": Priority.IMPORTANT,
    "video_search": Priority.IMPORTANT,
    "music_search": Priority.IMPORTANT,
    "audio": Priority.IMPORTANT,
    "review": Priority.IMPORTANT,
    "graphics": Priority.ENHANCEMENT,
    "maps": Priority.ENHANCEMENT,
    "subtitle": Priority.ENHANCEMENT,
}


class Prioritizer:
    def assign(self, tasks: list[PlanTask]) -> list[PlanTask]:
        for t in tasks:
            t.priority = _GROUP_PRIORITY.get(t.group, Priority.IMPORTANT)
        return tasks
