"""
Dynamic Replanner (6.11) — adapt the plan without restarting.

Real projects change: research may discover a new topic, or scene planning may
reveal a scene needs an image instead of a video. Instead of starting over, the
Planner mutates the graph — inserts a task, refines an asset's media type — and
recomputes layers, checkpoints and estimates in place (6.11). This adaptability
is essential for autonomous systems.
"""

from __future__ import annotations

from typing import Optional

from core.agents.planner.checkpoints import CheckpointPlanner
from core.agents.planner.dependency_graph import DependencyGraph
from core.agents.planner.models import ExecutionPlan, PlanTask, Priority
from core.agents.planner.parallelizer import Parallelizer
from core.agents.planner.prioritizer import Prioritizer
from core.agents.planner.resource_estimator import ResourceEstimator
from core.agents.planner.validator import Validator
from core.utils.logging import get_logger

log = get_logger("planner.replan")


class Replanner:
    def _next_id(self, plan: ExecutionPlan) -> int:
        return max((t.id for t in plan.tasks), default=0) + 1

    def insert_task(
        self,
        plan: ExecutionPlan,
        *,
        name: str,
        agent: str,
        group: str,
        depends_on: list[int],
        params: Optional[dict] = None,
        feeds_into: Optional[list[int]] = None,
        scene_id: Optional[int] = None,
    ) -> PlanTask:
        """Insert a new task; optionally make existing tasks depend on it."""
        task = PlanTask(
            id=self._next_id(plan), name=name, agent=agent, group=group,
            depends_on=sorted(set(depends_on)), params=params or {}, scene_id=scene_id,
        )
        plan.tasks.append(task)
        for tid in feeds_into or []:
            t = plan.task(tid)
            if t and task.id not in t.depends_on:
                t.depends_on = sorted(set(t.depends_on + [task.id]))
        self.recompute(plan)
        log.info("inserted task '%s' (#%d); plan now %d tasks", name, task.id, len(plan.tasks))
        return task

    def insert_scene(self, plan: ExecutionPlan, topic: str) -> PlanTask:
        """6.11 — Research found a new topic → insert a new scene's asset task and
        re-point the timeline at it."""
        scene_ids = [t.id for t in plan.tasks if t.group == "scene"]
        timeline_ids = [t.id for t in plan.tasks if t.group == "timeline"]
        next_scene = max((t.scene_id or 0 for t in plan.tasks if t.group == "assets"), default=0) + 1
        return self.insert_task(
            plan,
            name=f"Find Assets (Scene {next_scene}, new topic)",
            agent="video_search", group="assets", scene_id=next_scene,
            depends_on=scene_ids,
            params={"task": "find_assets", "scene": next_scene, "topic": topic},
            feeds_into=timeline_ids,
        )

    def refine_asset(self, plan: ExecutionPlan, scene_id: int, media_type: str) -> Optional[PlanTask]:
        """After scene planning, set a scene's asset task to the right agent."""
        agent = {"image": "image_search", "video": "video_search",
                 "motion_graphics": "graphics"}.get(media_type, "video_search")
        for t in plan.tasks:
            if t.group in ("assets",) and t.scene_id == scene_id:
                t.agent = agent
                t.params["media_type"] = media_type
                self.recompute(plan)
                return t
        return None

    def recompute(self, plan: ExecutionPlan) -> ExecutionPlan:
        """Rebuild derived data after any mutation (edges, layers, checkpoints,
        estimates, validity)."""
        Prioritizer().assign(plan.tasks)
        plan.total_estimate = ResourceEstimator().estimate(plan.tasks)
        graph = DependencyGraph(plan.tasks)
        plan.edges = graph.edges
        plan.parallel_layers = graph.parallel_layers()
        plan.checkpoints = CheckpointPlanner().build(plan.tasks)
        plan.issues = Validator().validate(plan)
        plan.valid = not any(i.startswith("FATAL") for i in plan.issues)
        return plan
