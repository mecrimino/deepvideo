"""
Metrics Collector — the single source of real, live data for the Developer
Dashboard. No mock data: every value comes from actual instrumentation.

  * API/LLM — recorded by the API Manager and LLM providers (requests, latency,
    failures, tokens, cost).
  * Events — a ring buffer subscribed to the project event bus.
  * Agents — derived from ``*.started`` / ``*.completed`` / ``*.failed`` events.
  * Downloads — reported by the asset downloader.
  * System — CPU / RAM / disk / network (psutil) + GPU (nvidia-smi if present).
  * Project / workflow / timeline / review — read from the run registry, working
    memory and the render registry.
"""

from __future__ import annotations

import shutil
import subprocess
import threading
import time
from collections import deque
from typing import Any, Optional

from core.utils.ids import now_iso

# Production agent dependency graph (panel 1: Live Workflow Graph).
AGENT_NODES = [
    "director", "planner", "research", "script", "scene",
    "image_search", "video_search", "graphics", "audio",
    "timeline", "reviewer", "exporter",
]
AGENT_EDGES = [
    ("director", "planner"), ("planner", "research"), ("research", "script"),
    ("script", "scene"), ("scene", "image_search"), ("scene", "video_search"),
    ("scene", "graphics"), ("script", "audio"),
    ("image_search", "timeline"), ("video_search", "timeline"),
    ("graphics", "timeline"), ("audio", "timeline"),
    ("timeline", "reviewer"), ("reviewer", "exporter"),
]
# map an event-emitting agent name to a graph node
_EVENT_AGENT_ALIAS = {"video": "video_search", "image": "image_search"}


class _ProviderStat:
    __slots__ = ("requests", "failures", "total_ms", "tokens", "cost", "last_status", "last_ms")

    def __init__(self) -> None:
        self.requests = 0
        self.failures = 0
        self.total_ms = 0.0
        self.tokens = 0
        self.cost = 0.0
        self.last_status = 0
        self.last_ms = 0.0

    def as_dict(self) -> dict:
        return {
            "requests": self.requests, "failures": self.failures,
            "avg_ms": round(self.total_ms / self.requests, 1) if self.requests else 0,
            "tokens": self.tokens, "cost": round(self.cost, 4),
            "last_status": self.last_status, "last_ms": round(self.last_ms, 1),
        }


class MetricsCollector:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._providers: dict[str, _ProviderStat] = {}
        self._api_recent: deque = deque(maxlen=60)
        self._events: deque = deque(maxlen=400)
        self._logs: deque = deque(maxlen=600)
        self._rate_limits: deque = deque(maxlen=30)
        self._llm_calls: deque = deque(maxlen=60)
        self._downloads: dict[str, dict] = {}
        self._agents: dict[str, dict] = {}   # name -> {status, started, ended, retries, task}
        self._llm_requests = 0
        self._net0 = None
        self._subscribed = False

    # ------------------------------------------------------------------ #
    # recording hooks (called from instrumented code)
    # ------------------------------------------------------------------ #
    def record_api(self, provider: str, ms: float, ok: bool, status: int, url: str = "", method: str = "GET") -> None:
        with self._lock:
            st = self._providers.setdefault(provider, _ProviderStat())
            st.requests += 1
            st.total_ms += ms
            st.last_ms = ms
            st.last_status = status
            if not ok:
                st.failures += 1
            self._api_recent.appendleft({
                "provider": provider, "method": method, "url": url[:80],
                "ms": round(ms, 1), "status": status, "ok": ok, "at": now_iso(),
            })

    def record_tokens(self, provider: str, tokens: int, cost: float = 0.0) -> None:
        with self._lock:
            st = self._providers.setdefault(provider, _ProviderStat())
            st.tokens += int(tokens or 0)
            st.cost += float(cost or 0.0)
            self._llm_requests += 1

    def record_download(self, name: str, *, pct: float, speed_bps: float, remaining_bytes: float, done: bool = False) -> None:
        with self._lock:
            if done:
                self._downloads.pop(name, None)
            else:
                self._downloads[name] = {"name": name, "pct": round(pct, 1),
                                         "speed_kbps": round(speed_bps / 1024, 1),
                                         "remaining_kb": round(remaining_bytes / 1024, 1)}

    def record_rate_limit(self, provider: str, wait_sec: float) -> None:
        """A provider rate-limited us and the request is waiting to retry."""
        with self._lock:
            self._rate_limits.appendleft({
                "provider": provider, "wait_sec": round(wait_sec),
                "until": time.time() + wait_sec, "at": now_iso(),
            })

    def record_llm_call(self, *, provider: str, model: str, ms: float, ok: bool,
                        system: str, user: str) -> None:
        """One LLM chat call — provider, latency and the actual prompts sent."""
        with self._lock:
            self._llm_calls.appendleft({
                "provider": provider, "model": model, "ms": round(ms, 1), "ok": ok,
                "system": system[:260], "user": user[:400], "at": now_iso(),
            })

    def record_log(self, level: str, name: str, message: str, at: str) -> None:
        with self._lock:
            self._logs.appendleft({"level": level, "name": name, "message": message, "at": at})

    def logs(self, level: str | None = None, limit: int = 300) -> list[dict]:
        with self._lock:
            items = list(self._logs)
        if level and level != "ALL":
            items = [r for r in items if r["level"] == level]
        return items[:limit]

    def on_event(self, event) -> None:
        """Subscribed to the event bus; buffers events + tracks agents."""
        with self._lock:
            self._events.appendleft({"name": event.name, "at": event.at, "payload": event.payload})
            self._track_agent(event.name, event.payload)

    def _track_agent(self, name: str, payload: dict) -> None:
        if "." not in name:
            return
        agent, _, action = name.partition(".")
        agent = _EVENT_AGENT_ALIAS.get(agent, agent)
        if agent not in AGENT_NODES and action not in ("started", "completed", "failed"):
            return
        rec = self._agents.setdefault(agent, {"status": "waiting", "started": 0.0, "ended": 0.0,
                                              "retries": 0, "task": ""})
        if action == "started":
            rec["status"] = "running"; rec["started"] = time.time(); rec["ended"] = 0.0
            rec["task"] = payload.get("task", "") or rec["task"]
        elif action == "completed":
            rec["status"] = "completed"; rec["ended"] = time.time()
        elif action == "failed":
            rec["status"] = "failed"; rec["ended"] = time.time()
        elif "retry" in name or "recovery" in name:
            rec["retries"] += 1

    def subscribe(self, event_bus) -> None:
        if self._subscribed:
            return
        event_bus.on("*", self.on_event)
        self._subscribed = True

    # ------------------------------------------------------------------ #
    # snapshot (assembled for the dashboard)
    # ------------------------------------------------------------------ #
    def snapshot(self, *, run_registry=None, render_registry=None, working=None,
                 run_id: Optional[str] = None) -> dict:
        # Project-scoped: run-specific sections are filled ONLY for the selected
        # run; with no selection only system-level data (cpu/ram/api) is real.
        run = run_registry.get(run_id) if (run_registry and run_id) else None
        with self._lock:
            providers = {k: v.as_dict() for k, v in self._providers.items()}
            events = list(self._events)[:200]
            logs = list(self._logs)[:150]
            downloads = list(self._downloads.values()) if run else []
            agents = self._agent_list() if run else []
            llm_total_tokens = sum(v.tokens for v in self._providers.values())
            llm_total_cost = sum(v.cost for v in self._providers.values())
        if run is not None:
            events = [e for e in events if run.run.id in str(e.get("payload", {}))][:120]
        else:
            events = []

        return {
            "at": now_iso(),
            "system": self._system(),
            "runs": _runs_list(run_registry),
            "selected_run": run.run.id if run else None,
            "api": {"providers": providers, "recent": events_api(self._api_recent)},
            # rate-limit waits: keep only recent/active ones visible
            "rate_limits": [r for r in self._rate_limits
                            if time.time() - (r["until"] - r["wait_sec"]) < 3600][:12],
            "llm_calls": list(self._llm_calls)[:40],
            "llm": {"requests": self._llm_requests, "total_tokens": llm_total_tokens,
                    "total_cost": round(llm_total_cost, 4)},
            "agents": agents,
            "workflow_graph": self._graph(run) if run else {"nodes": [], "edges": []},
            "events": events,
            "logs": logs,
            "project": self._project(run, run_registry, working),
            "timeline": self._timeline(run, render_registry),
            "downloads": downloads,
            "review": self._review(working) if run else {},
        }

    # ------------------------------------------------------------------ #
    def _agent_list(self) -> list[dict]:
        out = []
        now = time.time()
        for name, r in self._agents.items():
            dur = ((r["ended"] or now) - r["started"]) if r["started"] else 0.0
            out.append({"name": name, "status": r["status"], "task": r["task"],
                        "duration_ms": round(dur * 1000), "retries": r["retries"]})
        return out

    def _graph(self, run=None) -> dict:
        # Prefer the live run's real stages — this is exactly "what's running /
        # what ran" for the current project. Fall back to the static agent DAG.
        stages = (run.run.stages if run and run.run.stages else None)
        if stages:
            _map = {"running": "running", "done": "completed", "failed": "failed"}
            nodes = [{"id": s.stage, "status": _map.get(s.status, "idle"),
                      "ms": _stage_ms(s), "info": _stage_info(s)} for s in stages]
            edges = [{"from": stages[i].stage, "to": stages[i + 1].stage}
                     for i in range(len(stages) - 1)]
            return {"nodes": nodes, "edges": edges}
        status = {n: self._agents.get(n, {}).get("status", "idle") for n in AGENT_NODES}
        return {"nodes": [{"id": n, "status": status[n]} for n in AGENT_NODES],
                "edges": [{"from": a, "to": b} for a, b in AGENT_EDGES]}

    def _system(self) -> dict:
        try:
            import psutil

            vm = psutil.virtual_memory()
            du = psutil.disk_usage(str(shutil.os.getcwd())[:2] + "\\") if _is_windows() else psutil.disk_usage("/")
            net = psutil.net_io_counters()
            if self._net0 is None:
                self._net0 = (net.bytes_sent, net.bytes_recv, time.time())
            ds, dr, t0 = self._net0
            dt = max(0.001, time.time() - t0)
            up_kbps = (net.bytes_sent - ds) / dt / 1024
            down_kbps = (net.bytes_recv - dr) / dt / 1024
            self._net0 = (net.bytes_sent, net.bytes_recv, time.time())
            return {
                "cpu_pct": psutil.cpu_percent(interval=None),
                "ram_used_mb": round(vm.used / 1e6), "ram_total_mb": round(vm.total / 1e6),
                "ram_pct": vm.percent,
                "disk_used_gb": round(du.used / 1e9, 1), "disk_total_gb": round(du.total / 1e9, 1),
                "disk_pct": du.percent,
                "net_up_kbps": round(up_kbps, 1), "net_down_kbps": round(down_kbps, 1),
                "gpu": self._gpu(),
            }
        except Exception:
            return {}

    def _gpu(self) -> Optional[dict]:
        exe = shutil.which("nvidia-smi")
        if not exe:
            return None
        try:
            out = subprocess.run(
                [exe, "--query-gpu=name,memory.used,memory.total,utilization.gpu",
                 "--format=csv,noheader,nounits"], capture_output=True, text=True, timeout=2)
            parts = out.stdout.strip().split(",")
            if len(parts) >= 4:
                return {"name": parts[0].strip(), "mem_used_mb": int(parts[1]),
                        "mem_total_mb": int(parts[2]), "util_pct": int(parts[3])}
        except Exception:
            pass
        return None

    def _project(self, run, run_registry, working) -> dict:
        st = {"state": "idle", "run_id": None, "status": "idle", "stage": None,
              "active_scene": None, "checkpoint": None, "queue": 0}
        if run is not None:
            st.update(run_id=run.run.id, status=run.run.status, stage=run.run.stage,
                      state=getattr(run.state, "value", str(run.state)))
        if run_registry is not None:
            active = [r for r in run_registry.all() if r.run.status == "running"]
            st["queue"] = len(active)
        if working is not None:
            plan = working.get("plan") or {}
            cps = plan.get("checkpoints") or []
            st["checkpoint"] = cps[-1] if cps else None
        return st

    def _timeline(self, run, render_registry) -> dict:
        segs = ((run.run.progress.segments if run and run.run.progress else []) or []) if run else []
        done = sum(1 for s in segs if getattr(s, "pick", None))
        render_pct = 0.0
        if render_registry is not None:
            jobs = getattr(render_registry, "_jobs", {})
            if jobs:
                last = list(jobs.values())[-1]
                render_pct = round(getattr(last, "progress", 0.0) * 100, 1)
        return {"scenes_done": done, "scenes_total": len(segs), "render_pct": render_pct}

    def _review(self, working) -> dict:
        if working is None:
            return {}
        rev = working.get("review") or {}
        recs = rev.get("recommendations") or []
        failed = [f"{r.get('category')}: {r.get('action')}" for r in recs][:8]
        return {"score": rev.get("overall_score"), "passed": rev.get("passed"),
                "category_scores": rev.get("category_scores", {}),
                "failed_checks": failed, "recommendations": recs[:10]}


def _is_windows() -> bool:
    import os
    return os.name == "nt"


def events_api(recent: deque) -> list[dict]:
    return list(recent)[:40]


def _stage_info(s) -> str:
    """One-line real result of a stage, from its recorded output."""
    out = s.output if isinstance(s.output, dict) else {}
    for key, label in (("beats", "scenes"), ("queried", "queries"),
                       ("pooled", "candidates"), ("clips", "clips"),
                       ("downloaded", "downloaded")):
        if key in out:
            return f"{out[key]} {label}"
    return ""


def _stage_ms(s) -> int:
    """Elapsed milliseconds for one pipeline stage (running stages tick live)."""
    if not s.startedAt:
        return 0
    from datetime import datetime, timezone

    try:
        start = datetime.fromisoformat(s.startedAt.replace("Z", "+00:00"))
        end = (datetime.fromisoformat(s.finishedAt.replace("Z", "+00:00"))
               if s.finishedAt else datetime.now(timezone.utc))
        return max(0, int((end - start).total_seconds() * 1000))
    except Exception:
        return 0


def _runs_list(run_registry) -> list[dict]:
    """All known runs, newest first — the dashboard's project selector."""
    if run_registry is None:
        return []
    out = []
    for r in run_registry.all():
        out.append({"id": r.run.id, "status": r.run.status,
                    "stage": r.run.stage, "createdAt": r.run.createdAt})
    return sorted(out, key=lambda x: x["createdAt"], reverse=True)[:20]


def _latest_run(run_registry):
    if run_registry is None:
        return None
    runs = run_registry.all()
    return runs[-1] if runs else None


_metrics: Optional[MetricsCollector] = None


def get_metrics() -> MetricsCollector:
    global _metrics
    if _metrics is None:
        _metrics = MetricsCollector()
    return _metrics
