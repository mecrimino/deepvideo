"""
Scene Planner module chain as a LangGraph StateGraph (11.16):

    split → visual reasoning → timing → camera → transitions →
    overlays → build plan → review

Each node is one focused module. The result is a machine-readable production plan
(11.17) of shot-by-shot scenes.
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from core.agents.scene.state import ScenePlannerState


def build_scene_graph(agent):
    async def split(state: ScenePlannerState) -> dict:  # 11.4
        if state.get("script_scenes"):
            scenes = agent.splitter.from_script_scenes(state["script_scenes"])
        else:
            scenes = agent.splitter.split(state.get("narration", ""))
        return {"scenes": scenes}

    async def visual_reasoning(state: ScenePlannerState) -> dict:  # 11.6/11.7
        scenes = await agent.visuals.reason(state["scenes"], state.get("topic", ""))
        return {"scenes": scenes}

    async def timing(state: ScenePlannerState) -> dict:  # 11.10/11.11
        return {"scenes": agent.timing.estimate(state["scenes"])}

    async def camera(state: ScenePlannerState) -> dict:  # 11.8
        return {"scenes": agent.camera.plan(state["scenes"])}

    async def transitions(state: ScenePlannerState) -> dict:  # 11.12
        return {"scenes": agent.transitions.plan(state["scenes"])}

    async def overlays(state: ScenePlannerState) -> dict:  # 11.13/11.14
        scenes = agent.overlays.plan(state["scenes"])
        constraints = agent.overlays.constraints(state.get("style", "cinematic"),
                                                 state.get("orientation", "landscape"))
        return {"scenes": scenes, "constraints": constraints}

    async def build_plan(state: ScenePlannerState) -> dict:  # 11.16
        result = agent.builder.build(state["scenes"], topic=state.get("topic", ""),
                                     constraints=state.get("constraints"))
        return {"result": result}

    async def review(state: ScenePlannerState) -> dict:  # 11.15
        ok, issues = agent.reviewer.review(state["result"])
        if issues:
            agent.ctx.emit("scene.review", ok=ok, issues=issues)
        return {}

    g = StateGraph(ScenePlannerState)
    for name, fn in [
        ("split", split), ("visual_reasoning", visual_reasoning), ("timing", timing),
        ("camera", camera), ("transitions", transitions), ("overlays", overlays),
        ("build_plan", build_plan), ("review", review),
    ]:
        g.add_node(name, fn)
    g.add_edge(START, "split")
    g.add_edge("split", "visual_reasoning")
    g.add_edge("visual_reasoning", "timing")
    g.add_edge("timing", "camera")
    g.add_edge("camera", "transitions")
    g.add_edge("transitions", "overlays")
    g.add_edge("overlays", "build_plan")
    g.add_edge("build_plan", "review")
    g.add_edge("review", END)
    return g.compile()
