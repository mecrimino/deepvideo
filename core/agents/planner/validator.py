"""
Plan Validator (6.15) — catch common planning mistakes before execution.

Checks for the pitfalls the chapter warns about:
  * tasks that are too large (non-atomic)
  * circular dependencies
  * missing priorities
  * ignoring parallel execution
  * no checkpoints
  * dangling dependencies (a task depending on an id that doesn't exist)

Issues prefixed ``FATAL`` invalidate the plan; others are warnings.
"""

from __future__ import annotations

from core.agents.planner.dependency_graph import DependencyGraph
from core.agents.planner.models import ExecutionPlan


class Validator:
    def validate(self, plan: ExecutionPlan) -> list[str]:
        issues: list[str] = []
        ids = {t.id for t in plan.tasks}

        if not plan.tasks:
            return ["FATAL: plan has no tasks"]

        # circular dependencies (6.15)
        if DependencyGraph(plan.tasks).has_cycle():
            issues.append("FATAL: circular dependency detected")

        # dangling dependencies
        for t in plan.tasks:
            missing = [d for d in t.depends_on if d not in ids]
            if missing:
                issues.append(f"FATAL: task #{t.id} depends on missing {missing}")

        # tasks too large / not atomic (6.6/6.15)
        non_atomic = [t.id for t in plan.tasks if not t.atomic]
        if non_atomic:
            issues.append(f"FATAL: non-atomic tasks {non_atomic}")

        # missing priorities (6.15)
        if any(t.priority is None for t in plan.tasks):  # pragma: no cover
            issues.append("WARN: some tasks have no priority")

        # no checkpoints (6.13/6.15)
        if not plan.checkpoints:
            issues.append("WARN: plan has no checkpoints")

        # ignoring parallel execution (6.8/6.15)
        widest = max((len(layer) for layer in plan.parallel_layers), default=0)
        if widest <= 1 and len(plan.tasks) > 3:
            issues.append("WARN: no parallelism found — tasks may be over-serialized")

        return issues
