"""
Planning pipeline as a LangGraph StateGraph (tools.md: LangGraph) — mirrors 6.4:

    Understand Request → Estimate Complexity → Break Into Major Tasks →
    Break Into Subtasks → Build Dependency Graph → Assign Priorities →
    Estimate Resources → Define Checkpoints → Validate → Schedule Execution

Each node calls one Planner module; the final node assembles the typed
:class:`ExecutionPlan` (6.14).
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from core.agents.planner.dependency_graph import DependencyGraph
from core.agents.planner.models import ExecutionPlan
from core.agents.planner.state import PlannerState


def build_planner_graph(agent):
    async def understand_request(state: PlannerState) -> dict:
        # inputs come from the Director (6.2); fill sensible defaults if absent
        workflow = state.get("workflow") or agent._default_workflow(state["brief"])
        caps = state.get("capabilities") or agent._default_capabilities()
        return {"workflow": workflow, "capabilities": caps}

    async def estimate_complexity(state: PlannerState) -> dict:
        # more duration → more scenes → more tasks (drives the fan-out, 6.1)
        scene_count = max(3, int(state["brief"].duration / 6))
        return {"scene_count": scene_count}

    async def break_major_tasks(state: PlannerState) -> dict:
        return {"major_tasks": list(state["workflow"].stages)}

    async def break_subtasks(state: PlannerState) -> dict:  # 6.5/6.6
        tasks = await agent.decomposer.decompose(
            state["brief"], state["workflow"], state["capabilities"],
            state["scene_count"], state.get("research_questions"),
        )
        return {"tasks": tasks}

    async def build_dependency_graph(state: PlannerState) -> dict:  # 6.7/6.9
        graph = DependencyGraph(state["tasks"])
        return {"parallel_layers": graph.parallel_layers()}

    async def assign_priorities(state: PlannerState) -> dict:  # 6.10
        return {"tasks": agent.prioritizer.assign(state["tasks"])}

    async def estimate_resources(state: PlannerState) -> dict:  # 6.12
        return {"total_estimate": agent.estimator.estimate(state["tasks"])}

    async def define_checkpoints(state: PlannerState) -> dict:  # 6.13
        return {"checkpoints": agent.checkpointer.build(state["tasks"])}

    async def schedule_execution(state: PlannerState) -> dict:  # 6.8 + assemble
        layers, stats = agent.parallelizer.analyze(state["tasks"])
        graph = DependencyGraph(state["tasks"])
        plan = ExecutionPlan(
            project=state["brief"].topic,
            tasks=state["tasks"],
            edges=graph.edges,
            parallel_layers=layers,
            checkpoints=state.get("checkpoints", []),
            total_estimate=state.get("total_estimate"),
        )
        plan.issues = agent.validator.validate(plan)  # 6.15
        plan.valid = not any(i.startswith("FATAL") for i in plan.issues)
        return {"plan": plan, "stats": stats, "parallel_layers": layers}

    g = StateGraph(PlannerState)
    for name, fn in [
        ("understand_request", understand_request),
        ("estimate_complexity", estimate_complexity),
        ("break_major_tasks", break_major_tasks),
        ("break_subtasks", break_subtasks),
        ("build_dependency_graph", build_dependency_graph),
        ("assign_priorities", assign_priorities),
        ("estimate_resources", estimate_resources),
        ("define_checkpoints", define_checkpoints),
        ("schedule_execution", schedule_execution),
    ]:
        g.add_node(name, fn)

    g.add_edge(START, "understand_request")
    g.add_edge("understand_request", "estimate_complexity")
    g.add_edge("estimate_complexity", "break_major_tasks")
    g.add_edge("break_major_tasks", "break_subtasks")
    g.add_edge("break_subtasks", "build_dependency_graph")
    g.add_edge("build_dependency_graph", "assign_priorities")
    g.add_edge("assign_priorities", "estimate_resources")
    g.add_edge("estimate_resources", "define_checkpoints")
    g.add_edge("define_checkpoints", "schedule_execution")
    g.add_edge("schedule_execution", END)
    return g.compile()
