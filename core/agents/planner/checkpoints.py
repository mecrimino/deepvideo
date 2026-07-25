"""
Checkpoints (6.13) — resumable milestones.

Large projects include checkpoints so that, on failure, the system resumes from
the last successful one instead of starting over (6.13):

    Research Complete → Script Approved → Assets Ready →
    Timeline Complete → Review Passed

Each checkpoint is "reached" once every task in the groups it guards is done. The
checkpoint→task mapping is derived from the tasks actually present in the plan.
"""

from __future__ import annotations

from core.agents.planner.models import Checkpoint, PlanTask

# checkpoint name -> the groups whose completion marks it reached
_CHECKPOINTS: list[tuple[str, list[str]]] = [
    ("Research Complete", ["research", "fact_check"]),
    ("Script Approved", ["script"]),
    ("Assets Ready", ["assets", "image_search", "video_search", "music_search",
                      "graphics", "maps", "audio"]),
    ("Timeline Complete", ["timeline"]),
    ("Review Passed", ["review"]),
]


class CheckpointPlanner:
    def build(self, tasks: list[PlanTask]) -> list[Checkpoint]:
        by_group: dict[str, list[int]] = {}
        for t in tasks:
            by_group.setdefault(t.group, []).append(t.id)

        checkpoints: list[Checkpoint] = []
        cid = 1
        for name, groups in _CHECKPOINTS:
            guard: list[int] = []
            for g in groups:
                guard.extend(by_group.get(g, []))
            if guard:  # only include checkpoints that actually guard tasks
                checkpoints.append(Checkpoint(id=cid, name=name, after_tasks=sorted(guard)))
                cid += 1
        return checkpoints

    def last_reached(self, checkpoints: list[Checkpoint], done_ids: set[int]) -> Checkpoint | None:
        """The furthest checkpoint whose guard tasks are all done (resume point)."""
        reached = None
        for cp in checkpoints:
            cp.reached = all(tid in done_ids for tid in cp.after_tasks)
            if cp.reached:
                reached = cp
        return reached
