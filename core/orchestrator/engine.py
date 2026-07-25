"""
Workflow Engine (Ch19) — the operating system of the AI video editor.

A **LangGraph** state machine over the 19.4 project states drives the whole
studio: plan → research → script → scene planning → asset retrieval (parallel) →
timeline → review → (improve? ↺) → render → complete. Every node is dispatched to
a real agent, wrapped with retry/recovery (19.10/19.14), tracked by the progress
monitor (19.13), audited (19.15) and checkpointed to disk (19.9). A conditional
edge implements the review→improve loop and dynamic replanning (19.20); an
optional human-approval interrupt (19.11) pauses before render.
"""

from __future__ import annotations

from typing import Optional

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from core.agents.base import AgentContext
from core.orchestrator.checkpoints import CheckpointManager
from core.orchestrator.config import WorkflowConfig
from core.orchestrator.dispatcher import AgentDispatcher
from core.orchestrator.events import get_event_bus
from core.orchestrator.logging import AuditTrail
from core.orchestrator.models import WorkflowResult, WorkflowState
from core.orchestrator.progress import ProgressMonitor
from core.orchestrator.recovery import RecoveryManager
from core.orchestrator.scheduler import Scheduler
from core.orchestrator.state import ProjectState
from core.memory import get_memory
from core.schemas.edl import Beat, BeatQueries, CaptionCue, ClipAsset, TimeRange
from core.utils.ids import new_id
from core.utils.logging import get_logger

log = get_logger("orchestrator.engine")


class WorkflowEngine:
    def __init__(self, project_id: str, *, config: Optional[WorkflowConfig] = None) -> None:
        self.project_id = project_id
        self.config = config or WorkflowConfig.from_settings()
        self.ctx = AgentContext(project_id=project_id, memory=get_memory(project_id), events=get_event_bus())
        self.agents = AgentDispatcher(self.ctx)
        self.scheduler = Scheduler(self.config.parallelism)
        self.recovery = RecoveryManager(self.config.max_retries)
        self.progress = ProgressMonitor(self.ctx.events, project_id)
        self.audit = AuditTrail(project_id)
        self.checkpoints = CheckpointManager(project_id)
        self.saver = MemorySaver()
        self._graph = self._build()

    # ------------------------------------------------------------------ #
    async def run(self, goal: str) -> WorkflowResult:
        wf_id = new_id("wf_")
        self.audit.record("workflow.start", goal=goal, workflow_id=wf_id)
        state: WorkflowState = {"project_id": self.project_id, "goal": goal,
                                "config": self.config, "revisions": 0, "errors": []}
        cfg = {"configurable": {"thread_id": self.project_id}}
        try:
            final = await self._graph.ainvoke(state, cfg)
        except Exception as exc:  # pragma: no cover
            log.exception("workflow failed")
            self.audit.record("workflow.failed", error=str(exc))
            return WorkflowResult(workflow_id=wf_id, project_id=self.project_id,
                                  state="failed", status="failed", errors=[str(exc)])

        # paused for human approval (19.11)?
        snap = self._graph.get_state(cfg)
        if snap.next:
            self.audit.record("workflow.paused", awaiting=list(snap.next))
            return WorkflowResult(workflow_id=wf_id, project_id=self.project_id,
                                  state=self._pstate(final).value, status="paused")
        return self._result(wf_id, final)

    async def resume(self, *, approved: bool = True) -> WorkflowResult:
        """Continue a run that paused for approval (19.11/19.12)."""
        cfg = {"configurable": {"thread_id": self.project_id}}
        self._graph.update_state(cfg, {"approved": approved})
        final = await self._graph.ainvoke(None, cfg)
        return self._result(new_id("wf_"), final)

    # ------------------------------------------------------------------ #
    # graph
    # ------------------------------------------------------------------ #
    def _build(self):
        g = StateGraph(WorkflowState)
        g.add_node("plan", self._n_plan)
        g.add_node("research", self._n_research)
        g.add_node("script", self._n_script)
        g.add_node("scene_planning", self._n_scene)
        g.add_node("asset_retrieval", self._n_assets)
        g.add_node("timeline", self._n_timeline)
        g.add_node("review", self._n_review)
        g.add_node("improve", self._n_improve)
        g.add_node("render", self._n_render)
        g.add_node("complete", self._n_complete)

        g.add_edge(START, "plan")
        g.add_edge("plan", "research")
        g.add_edge("research", "script")
        g.add_edge("script", "scene_planning")
        g.add_edge("scene_planning", "asset_retrieval")
        g.add_edge("asset_retrieval", "timeline")
        g.add_edge("timeline", "review")
        g.add_conditional_edges("review", self._route_review, {"render": "render", "improve": "improve"})
        g.add_edge("improve", "asset_retrieval")   # dynamic replan (19.20)
        g.add_edge("render", "complete")
        g.add_edge("complete", END)

        interrupts = ["render"] if self.config.require_approval else []
        return g.compile(checkpointer=self.saver, interrupt_before=interrupts)

    # ------------------------------------------------------------------ #
    # nodes (each recovery-wrapped + audited + checkpointed)
    # ------------------------------------------------------------------ #
    async def _stage(self, state, pstate: ProjectState, fn):
        self.progress.start(pstate)
        self.audit.record(f"{pstate.value}.started")
        out = await self.recovery.run(pstate.value, fn, default={})
        self.progress.done(pstate)
        self.audit.record(f"{pstate.value}.completed")
        merged = {**state, **out, "pstate": pstate}
        self.checkpoints.save(merged)
        return out | {"pstate": pstate}

    async def _n_plan(self, state):
        async def fn():
            brief = await self.agents.director.produce(state["goal"])
            plan = await self.agents.planner.plan(brief)
            return {"brief": brief, "plan": plan}
        return await self._stage(state, ProjectState.PLANNING, fn)

    async def _n_research(self, state):
        async def fn():
            return {"knowledge": await self.agents.research.research(state["brief"].topic)}
        return await self._stage(state, ProjectState.RESEARCH, fn)

    async def _n_script(self, state):
        async def fn():
            return {"script": await self.agents.script.run(state["knowledge"])}
        return await self._stage(state, ProjectState.SCRIPTING, fn)

    async def _n_scene(self, state):
        async def fn():
            plan = await self.agents.scene.plan(state["script"], topic=state["brief"].topic)
            return {"scene_plan": plan}
        return await self._stage(state, ProjectState.SCENE_PLANNING, fn)

    async def _n_assets(self, state):
        async def fn():
            scenes = state["scene_plan"].scenes
            assets: dict = {}
            by_scene: dict = {}

            async def one(scene):
                beat = self._scene_to_beat(scene)
                agent = self.agents.image if (scene.media and scene.media.type == "image") else self.agents.video
                if not getattr(agent, "available", False):
                    return
                cands = await agent.search(beat)
                if cands and cands[0].score >= self.ctx.settings.match_threshold:
                    asset = await agent.materialize(cands[0].id, beat)
                    if asset:
                        assets[asset.id] = asset.model_dump()
                        by_scene[scene.scene_id] = asset.id

            # parallel asset retrieval + graphics + audio (19.5)
            await self.scheduler.run_parallel([lambda s=s: one(s) for s in scenes])
            render_pkg = await self.agents.graphics.design(scenes, theme="dark_documentary")
            beats = [self._scene_to_beat(s) for s in scenes]
            audio_plan = await self.agents.audio.plan(beats)
            return {"assets": assets, "assets_by_scene": by_scene,
                    "render_package": render_pkg.model_dump(), "audio_plan": audio_plan.model_dump()}
        return await self._stage(state, ProjectState.ASSET_RETRIEVAL, fn)

    async def _n_timeline(self, state):
        async def fn():
            from core.agents.timeline import TimelineBuildInput
            scenes = state["scene_plan"].scenes
            assets = {k: ClipAsset.model_validate(v) for k, v in state.get("assets", {}).items()}
            captions = [CaptionCue(id=new_id("cap_"), text=s.narration,
                                   range=TimeRange(startSec=s.range_start, endSec=s.range_end))
                        for s in scenes]
            inp = TimelineBuildInput(scenes=scenes, assets_by_scene=state.get("assets_by_scene", {}),
                                     assets=assets, captions=captions)
            return {"timeline": self.agents.timeline.assemble(inp).timeline}
        return await self._stage(state, ProjectState.TIMELINE, fn)

    async def _n_review(self, state):
        async def fn():
            return {"review": await self.agents.reviewer.run(state["timeline"])}
        return await self._stage(state, ProjectState.REVIEW, fn)

    async def _n_improve(self, state):
        # dynamic replanning (19.20): bump revision, loop back to assets
        self.audit.record("improve.replan", revision=state.get("revisions", 0) + 1)
        return {"revisions": state.get("revisions", 0) + 1}

    async def _n_render(self, state):
        async def fn():
            from core.agents.exporter import ExporterAgent
            tl = state["timeline"]
            job_id = new_id("rnd_")
            path = await ExporterAgent().render(tl, job_id=job_id, burn_captions=True)
            from core.providers.storage import rel
            return {"render_job": {"id": job_id, "output": rel(path)}}
        return await self._stage(state, ProjectState.RENDERING, fn)

    async def _n_complete(self, state):
        self.progress.done(ProjectState.REVIEW)
        self.audit.record("workflow.completed")
        return {"pstate": ProjectState.COMPLETED}

    # ------------------------------------------------------------------ #
    def _route_review(self, state) -> str:
        review = state.get("review")
        passed = getattr(review, "passed", True)
        if passed or state.get("revisions", 0) >= self.config.max_revisions:
            return "render"
        return "improve"

    def _scene_to_beat(self, scene) -> Beat:
        kws = scene.media.keywords if scene.media else []
        return Beat(id=f"beat_{scene.scene_id}", text=scene.narration,
                    range=TimeRange(startSec=scene.range_start, endSec=scene.range_end),
                    queries=BeatQueries(said=scene.narration, shown=scene.visual_goal or scene.narration,
                                        keywords=kws))

    def _pstate(self, state) -> ProjectState:
        ps = state.get("pstate")
        return ps if isinstance(ps, ProjectState) else ProjectState.PLANNING

    def _result(self, wf_id: str, state) -> WorkflowResult:
        review = state.get("review")
        job = state.get("render_job") or {}
        return WorkflowResult(
            workflow_id=wf_id, project_id=self.project_id, state="completed", status="completed",
            overall_score=getattr(review, "overall_score", None),
            timeline_id=getattr(state.get("timeline"), "id", None),
            output_path=job.get("output"),
        )
