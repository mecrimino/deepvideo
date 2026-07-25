"""
Director Agent (Ch5) — the brain of the entire system.

It thinks, plans, coordinates and decides — it never edits video itself (5.17:
Director → Delegate → Workers Execute → Director Reviews). It wires the eight
internal modules (5.6) into the LangGraph thinking process (5.4) and drives it.

Execution is delegated through a **dispatcher** — an async callable that runs one
:class:`TaskAssignment` on the responsible worker agent. The workers arrive in
later chapters; until a dispatcher is provided the Director genuinely plans and
*assigns* every task (honest ``assigned`` status) but does not fabricate results.
"""

from __future__ import annotations

import asyncio
from typing import Awaitable, Callable, Optional

from core.agents.base import AgentContext, BaseAgent
from core.agents.director.error_recovery import ErrorRecovery
from core.agents.director.export_controller import ExportController
from core.agents.director.goal_analyzer import GoalAnalyzer
from core.agents.director.graph import build_director_graph
from core.agents.director.models import (
    ProductionBrief,
    ProductionStrategy,
    RecoveryAction,
    TaskAssignment,
    TaskResult,
)
from core.agents.director.progress_monitor import ProgressMonitor
from core.agents.director.prompt_interpreter import PromptInterpreter
from core.agents.director.reviewer_coordinator import Reviewer, ReviewerCoordinator
from core.agents.director.state import DirectorState
from core.agents.director.task_scheduler import TaskScheduler
from core.agents.director.workflow_planner import WorkflowPlanner

# A dispatcher runs one assignment on its worker and returns the result.
Dispatcher = Callable[[TaskAssignment], Awaitable[TaskResult]]


class DirectorAgent(BaseAgent[str, DirectorState]):
    name = "director"

    def __init__(
        self,
        ctx: AgentContext,
        *,
        dispatcher: Optional[Dispatcher] = None,
        reviewer: Optional[Reviewer] = None,
    ) -> None:
        super().__init__(ctx)
        self.dispatcher = dispatcher
        self.max_revisions = 1

        # the eight internal modules (5.6)
        self.interpreter = PromptInterpreter(self.llm)
        self.goal = GoalAnalyzer(self.llm)
        self.wfp = WorkflowPlanner(self.llm)
        self.scheduler = TaskScheduler()
        self.monitor = ProgressMonitor(ctx.events)
        self.recovery = ErrorRecovery(max_retries=ctx.settings.max_retries)
        self.reviewer_coord = ReviewerCoordinator(reviewer, threshold=ctx.settings.review_threshold)
        self.export_ctrl = ExportController()

        self._graph = build_director_graph(self)

    # ------------------------------------------------------------------ #
    # entry points
    # ------------------------------------------------------------------ #
    async def run(self, prompt: str) -> DirectorState:
        return await self.direct(prompt)

    async def direct(self, prompt: str) -> DirectorState:
        """Run the full 5.4 thinking process and return the final state."""
        self.ctx.emit("director.started", prompt=prompt[:120])
        state: DirectorState = {"prompt": prompt, "project_id": self.ctx.project_id, "revisions": 0}
        final: DirectorState = await self._graph.ainvoke(state)
        return final

    async def strategy(self, prompt: str) -> ProductionStrategy:
        """Convenience: run the thinking process and return the typed strategy."""
        st = await self.direct(prompt)
        return ProductionStrategy(
            brief=st["brief"], goals=st["goals"], complexity=st["complexity"],
            workflow=st["workflow"], tasks=st.get("tasks", []),
        )

    async def interpret(self, prompt: str) -> ProductionBrief:
        """Prompt Interpreter only (5.6) — prompt → structured brief."""
        return await self.interpreter.interpret(prompt)

    async def produce(self, prompt: str) -> ProductionBrief:
        """Interpret + record the brief into working memory for downstream agents."""
        brief = await self.interpret(prompt)
        wm = self.ctx.memory.working
        wm.set("brief", brief.model_dump())
        wm.set("topic", brief.topic)
        wm.set("target_seconds", brief.duration)
        self.ctx.emit("director.brief", topic=brief.topic, type=brief.video_type)
        return brief

    # ------------------------------------------------------------------ #
    # internals used by the graph nodes
    # ------------------------------------------------------------------ #
    def _store_strategy(self, state: DirectorState, tasks: list[TaskAssignment]) -> None:
        strategy = ProductionStrategy(
            brief=state["brief"], goals=state["goals"], complexity=state["complexity"],
            workflow=state["workflow"], tasks=tasks,
        )
        self.ctx.memory.working.set("strategy", strategy.model_dump())

    # 5.15 — Memory Usage: reuse prior style preferences on a new project.
    # Distinctive styles are checked before the "cinematic" default so a recalled
    # "dark cinematic" preference resolves to the distinctive descriptor.
    _STYLES = ("dark", "luxury", "corporate", "news", "minimal", "energetic", "calm", "cinematic")

    def _apply_memory(self, brief: ProductionBrief) -> ProductionBrief:
        try:
            ctx_text = self.ctx.memory.recall_context(
                f"style preferences for {brief.video_type} videos", top_k=3
            )
        except Exception:
            ctx_text = ""
        if not ctx_text:
            return brief
        self.ctx.memory.working.set("style_memory", ctx_text)
        low = ctx_text.lower()
        # only override the *default* style, never a user-specified one
        if brief.style == "cinematic":
            for st in self._STYLES:
                if st in low:
                    self.ctx.emit("director.memory.applied", style=st)
                    return brief.model_copy(update={"style": st})
        return brief

    def _remember_decisions(self, state: DirectorState) -> None:
        brief = state.get("brief")
        if brief is None:
            return
        workflow = state.get("workflow")
        export = state.get("export")
        approved = bool(getattr(export, "approved", False))
        try:
            self.ctx.memory.remember_preference(
                f"For {brief.video_type} videos, used {brief.style} style with the "
                f"{getattr(workflow, 'name', 'standard')} workflow.",
                rating=0.7,
            )
            self.ctx.memory.remember_experience(
                f"Directed '{brief.topic}' ({brief.video_type}); export approved={approved}.",
                rating=0.8 if approved else 0.4,
            )
        except Exception as exc:
            self.log.debug("remember decisions failed: %s", exc)

    async def _execute(self, tasks: list[TaskAssignment]) -> list[TaskResult]:
        """Monitor Execution (5.4): delegate tasks to workers via the dispatcher.

        Respects the dependency DAG and runs independent tasks in parallel (1.6).
        Without a dispatcher, tasks are assigned but not run (honest status).
        """
        self.monitor.start(tasks)
        results: dict[int, TaskResult] = {}

        if self.dispatcher is None:
            for t in tasks:
                t.status = "assigned"
                r = TaskResult(task_id=t.id, status="assigned")
                self.monitor.task_finished(r)
                results[t.id] = r
            self.monitor.finish()
            return list(results.values())

        by_id = {t.id: t for t in tasks}
        done: set[int] = set()
        pending: set[int] = set(by_id)
        while pending:
            ready = [by_id[i] for i in pending if all(d in done for d in by_id[i].depends_on)]
            if not ready:  # unmet-dependency deadlock — fail the remainder
                for i in pending:
                    results[i] = TaskResult(task_id=i, status="failed", error="unmet dependencies")
                break
            outcomes = await asyncio.gather(*(self._run_one(by_id[t.id]) for t in ready))
            for t, r in zip(ready, outcomes):
                results[t.id] = r
                done.add(t.id)
                pending.discard(t.id)
        self.monitor.finish()
        return list(results.values())

    async def _run_one(self, task: TaskAssignment) -> TaskResult:
        """Dispatch one task, climbing the 5.13 recovery ladder on failure."""
        self.monitor.task_started(task)
        attempt = 0
        current = task
        while True:
            try:
                result = await self.dispatcher(current)  # type: ignore[misc]
                result.attempts = attempt
                if attempt > 0 and result.status == "done":
                    result.status = "recovered"
                self.monitor.task_finished(result)
                return result
            except Exception as exc:
                action = self.recovery.next_action(attempt)
                if action == RecoveryAction.GIVE_UP:
                    result = TaskResult(task_id=task.id, status="failed", error=str(exc), attempts=attempt)
                    self.monitor.task_finished(result)
                    return result
                current = self.recovery.apply(current, action)
                attempt += 1
