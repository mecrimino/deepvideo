"""
Resource Estimator (6.12) — estimate cost before execution.

For each task estimate expected runtime, GPU use, memory, API calls/cost and
storage, then aggregate a project total. These estimates help the Director
manage long-running projects (6.12) and decide what to run when resources are
tight (6.10).
"""

from __future__ import annotations

from core.agents.planner.models import PlanTask, ResourceEstimate

# per-agent baseline estimate (runtime seconds roughly per the 6.12 table)
_AGENT_ESTIMATE: dict[str, dict] = {
    "research":     {"runtime_sec": 120, "memory_mb": 256, "api_calls": 3, "storage_mb": 0.5},
    "script":       {"runtime_sec": 30,  "memory_mb": 256, "api_calls": 1, "storage_mb": 0.1},
    "scene":        {"runtime_sec": 20,  "memory_mb": 256, "api_calls": 1, "storage_mb": 0.1},
    "image_search": {"runtime_sec": 60,  "memory_mb": 512, "api_calls": 2, "storage_mb": 5},
    "video_search": {"runtime_sec": 180, "memory_mb": 1024, "api_calls": 2, "storage_mb": 50},
    "audio":        {"runtime_sec": 40,  "memory_mb": 512, "api_calls": 1, "storage_mb": 3},
    "subtitle":     {"runtime_sec": 15,  "memory_mb": 256, "api_calls": 0, "storage_mb": 0.1},
    "graphics":     {"runtime_sec": 30,  "memory_mb": 512, "api_calls": 0, "storage_mb": 2, "gpu": True},
    "timeline":     {"runtime_sec": 30,  "memory_mb": 512, "api_calls": 0, "storage_mb": 1},
    "reviewer":     {"runtime_sec": 60,  "memory_mb": 256, "api_calls": 1, "storage_mb": 0.1},
    "exporter":     {"runtime_sec": 360, "memory_mb": 2048, "api_calls": 0, "storage_mb": 100, "gpu": True},
}
_DEFAULT = {"runtime_sec": 30, "memory_mb": 256, "api_calls": 0, "storage_mb": 1}
_API_COST_PER_CALL = 0.002  # rough free/cheap-tier average (USD)


class ResourceEstimator:
    def estimate(self, tasks: list[PlanTask]) -> ResourceEstimate:
        total = ResourceEstimate()
        for t in tasks:
            base = _AGENT_ESTIMATE.get(t.agent, _DEFAULT)
            est = ResourceEstimate(
                runtime_sec=float(base["runtime_sec"]),
                gpu=bool(base.get("gpu", False)),
                memory_mb=int(base["memory_mb"]),
                api_calls=int(base["api_calls"]),
                api_cost_usd=round(int(base["api_calls"]) * _API_COST_PER_CALL, 4),
                storage_mb=float(base["storage_mb"]),
            )
            t.estimate = est
            total = total.add(est)
        return total
