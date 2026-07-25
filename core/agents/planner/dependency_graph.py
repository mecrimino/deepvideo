"""
Dependency Graph (6.7 / 6.9) — the blueprint for execution.

Builds the task DAG from each task's ``depends_on``, detects cycles (a fatal
planning mistake, 6.15), and produces a topological order so work runs in the
correct sequence (6.7). Pure Python — no external graph library (networkx is not
in tools.md); Kahn's algorithm is all we need.
"""

from __future__ import annotations

from core.agents.planner.models import Edge, PlanTask


class DependencyGraph:
    def __init__(self, tasks: list[PlanTask]) -> None:
        self.tasks = tasks
        self.ids = {t.id for t in tasks}
        self.adj: dict[int, list[int]] = {t.id: [] for t in tasks}   # src -> [dst]
        self.indeg: dict[int, int] = {t.id: 0 for t in tasks}
        self.edges: list[Edge] = []
        for t in tasks:
            for dep in t.depends_on:
                if dep in self.ids:
                    self.adj[dep].append(t.id)
                    self.indeg[t.id] += 1
                    self.edges.append(Edge(src=dep, dst=t.id))

    def has_cycle(self) -> bool:
        return len(self.topological_order()) != len(self.tasks)

    def topological_order(self) -> list[int]:
        indeg = dict(self.indeg)
        queue = [i for i, d in indeg.items() if d == 0]
        order: list[int] = []
        while queue:
            n = queue.pop(0)
            order.append(n)
            for m in self.adj[n]:
                indeg[m] -= 1
                if indeg[m] == 0:
                    queue.append(m)
        return order

    def parallel_layers(self) -> list[list[int]]:
        """Kahn by layers (6.8): each layer is a set of tasks with no remaining
        dependency — every task in a layer can run at the same time."""
        indeg = dict(self.indeg)
        layers: list[list[int]] = []
        frontier = sorted(i for i, d in indeg.items() if d == 0)
        while frontier:
            layers.append(frontier)
            nxt: list[int] = []
            for n in frontier:
                for m in self.adj[n]:
                    indeg[m] -= 1
                    if indeg[m] == 0:
                        nxt.append(m)
            frontier = sorted(nxt)
        return layers
