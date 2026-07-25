"""
Parallelizer (6.8) — find what can run at the same time.

Independent tasks (e.g. Image Search ∥ Video Search ∥ Music Search) have no
dependency between them and can execute together, which dramatically reduces
total production time (6.8). Uses the dependency graph's layering and reports the
speed-up: sequential runtime vs the critical-path (parallel) runtime.
"""

from __future__ import annotations

from core.agents.planner.dependency_graph import DependencyGraph
from core.agents.planner.models import PlanTask


class Parallelizer:
    def analyze(self, tasks: list[PlanTask]) -> tuple[list[list[int]], dict]:
        graph = DependencyGraph(tasks)
        layers = graph.parallel_layers()
        by_id = {t.id: t for t in tasks}

        sequential = sum(t.estimate.runtime_sec for t in tasks)
        # critical path ≈ sum of the slowest task in each layer
        critical_path = 0.0
        for layer in layers:
            critical_path += max((by_id[i].estimate.runtime_sec for i in layer), default=0.0)

        widest = max((len(layer) for layer in layers), default=0)
        stats = {
            "layers": len(layers),
            "max_parallel": widest,
            "sequential_sec": round(sequential, 1),
            "parallel_sec": round(critical_path, 1),
            "speedup": round(sequential / critical_path, 2) if critical_path else 1.0,
        }
        return layers, stats
