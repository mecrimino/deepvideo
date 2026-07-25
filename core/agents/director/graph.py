"""
Director thinking process as a LangGraph StateGraph (tools.md: LangGraph).

Mirrors 5.4 exactly:

    Understand Goal → Determine Video Type → Estimate Complexity →
    Choose Workflow → Assign Tasks → Monitor Execution →
    Review Quality → Export

"Understand Goal" + "Determine Video Type" are the Prompt Interpreter (it returns
the type inside the brief). After Review Quality a conditional edge implements the
improvement loop (Layer 6): if the review found problems and revisions remain,
loop back to execution; otherwise proceed to the Export decision.
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from core.agents.director.state import DirectorState


def build_director_graph(agent):
    """Compile the Director's StateGraph, with nodes bound to ``agent``'s modules."""

    async def interpret(state: DirectorState) -> dict:
        brief = await agent.interpreter.interpret(state["prompt"])
        brief = agent._apply_memory(brief)  # 5.15 reuse prior preferences
        agent.ctx.emit("director.brief", topic=brief.topic, type=brief.video_type)
        return {"brief": brief, "status": "interpreted"}

    async def analyze_goal(state: DirectorState) -> dict:
        goals = await agent.goal.analyze(state["brief"])  # 5.8 incl. capabilities
        return {"goals": goals}

    async def estimate_complexity(state: DirectorState) -> dict:
        complexity = agent.wfp.estimate_complexity(state["brief"])
        return {"complexity": complexity}

    async def choose_workflow(state: DirectorState) -> dict:  # 5.9
        workflow = agent.wfp.choose_workflow(
            state["brief"], state["complexity"], state["goals"].capabilities
        )
        return {"workflow": workflow}

    async def assign_tasks(state: DirectorState) -> dict:  # 5.10/5.11/5.16
        tasks = agent.scheduler.schedule(
            state["brief"], state["workflow"], state["goals"].capabilities
        )
        agent._store_strategy(state, tasks)
        return {"tasks": tasks, "status": "assigned"}

    async def monitor_execution(state: DirectorState) -> dict:
        results = await agent._execute(state["tasks"])
        return {"results": results, "status": "executed"}

    async def review_quality(state: DirectorState) -> dict:
        review = await agent.reviewer_coord.request_review(
            {"brief": state["brief"].model_dump(), "results": [r.model_dump() for r in state.get("results", [])]}
        )
        return {"review": review}

    async def revise(state: DirectorState) -> dict:
        # improvement loop (Layer 6): bump the counter and re-run execution
        agent.ctx.emit("director.revising", revision=state.get("revisions", 0) + 1)
        return {"revisions": state.get("revisions", 0) + 1}

    async def export(state: DirectorState) -> dict:
        decision = agent.export_ctrl.decide(state.get("review"), state.get("results", []))
        agent.ctx.emit("director.export", approved=decision.approved, reason=decision.reason)
        return {"export": decision, "status": "export_approved" if decision.approved else "export_withheld"}

    async def finish(state: DirectorState) -> dict:
        # 5.18 Finish Project + 5.15 remember decisions for future projects
        agent._remember_decisions(state)
        agent.ctx.emit("director.finished", topic=state["brief"].topic)
        return {"status": "finished"}

    def route_after_review(state: DirectorState) -> str:
        review = state.get("review")
        rev = state.get("revisions", 0)
        if review is None or review.passed or not review.performed or rev >= agent.max_revisions:
            return "export"
        return "revise"

    g = StateGraph(DirectorState)
    g.add_node("interpret", interpret)
    g.add_node("analyze_goal", analyze_goal)
    g.add_node("estimate_complexity", estimate_complexity)
    g.add_node("choose_workflow", choose_workflow)
    g.add_node("assign_tasks", assign_tasks)
    g.add_node("monitor_execution", monitor_execution)
    g.add_node("review_quality", review_quality)
    g.add_node("revise", revise)
    g.add_node("export", export)
    g.add_node("finish", finish)

    g.add_edge(START, "interpret")
    g.add_edge("interpret", "analyze_goal")
    g.add_edge("analyze_goal", "estimate_complexity")
    g.add_edge("estimate_complexity", "choose_workflow")
    g.add_edge("choose_workflow", "assign_tasks")
    g.add_edge("assign_tasks", "monitor_execution")
    g.add_edge("monitor_execution", "review_quality")
    g.add_conditional_edges("review_quality", route_after_review, {"export": "export", "revise": "revise"})
    g.add_edge("revise", "monitor_execution")
    g.add_edge("export", "finish")
    g.add_edge("finish", END)

    return g.compile()
