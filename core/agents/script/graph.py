"""
Script workflow as a LangGraph StateGraph (10.17) with multi-pass refinement
(10.12):

    narrative planning → outline → hook → section writing (+ scene annotation) →
    timing → validate (fact protection) → review → (revise? → back) → approved

The prompt chain (10.13) writes section by section rather than one giant prompt,
and the review gate loops a weak draft back for another pass.
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from core.agents.script.models import ScriptOutput
from core.agents.script.state import ScriptState


def build_script_graph(agent):
    async def narrative_planning(state: ScriptState) -> dict:
        return {"sections": agent.planner.plan(state["inp"])}

    async def build_outline(state: ScriptState) -> dict:
        outline, facts_by = agent.outline.build(state["inp"], state["sections"])
        return {"outline": outline, "facts_by_section": facts_by}

    async def hook(state: ScriptState) -> dict:
        return {"hook": await agent.hook.generate(state["inp"])}

    async def section_writing(state: ScriptState) -> dict:  # 10.5/10.10/10.13
        inp, sections, facts_by = state["inp"], state["sections"], state["facts_by_section"]
        scene_id = 1
        for i, section in enumerate(sections):
            if section.kind == "hook":
                section.narration = state["hook"]
                section.scenes = agent.draft._annotate(state["hook"], scene_id)
                scene_id += len(section.scenes)
            else:
                scene_id = await agent.draft.write(inp, section, facts_by[i], scene_id)
        scenes = [sc for s in sections for sc in s.scenes]
        output = ScriptOutput(
            topic=inp.knowledge_package.topic, title=inp.knowledge_package.topic.title(),
            hook=state["hook"], outline=state["outline"], chapters=sections, scenes=scenes,
            citations=inp.knowledge_package.citations,
        )
        output.voice_script = "\n\n".join(s.narration for s in sections if s.narration)
        return {"output": output}

    async def timing(state: ScriptState) -> dict:  # 10.11
        return {"output": agent.timing.analyze(state["output"], state["inp"].target_duration)}

    async def validate(state: ScriptState) -> dict:  # 10.14
        agent.validator.validate(state["output"], state["inp"].knowledge_package)
        return {}

    async def review(state: ScriptState) -> dict:  # 10.16
        score, metrics = agent.reviewer.review(state["output"])
        agent.ctx.emit("script.reviewed", score=score, metrics=metrics)
        return {}

    def route_review(state: ScriptState) -> str:
        out = state["output"]
        rev = state.get("revisions", 0)
        if agent.reviewer.passed(out.review_score) or rev >= agent.max_revisions:
            return "approve"
        return "revise"

    async def revise(state: ScriptState) -> dict:  # 10.12 another pass
        agent.ctx.emit("script.revising", revision=state.get("revisions", 0) + 1)
        return {"revisions": state.get("revisions", 0) + 1}

    async def approve(state: ScriptState) -> dict:
        state["output"].status = "success"
        return {}

    g = StateGraph(ScriptState)
    for name, fn in [
        ("narrative_planning", narrative_planning), ("build_outline", build_outline),
        ("hook", hook), ("section_writing", section_writing), ("timing", timing),
        ("validate", validate), ("review", review), ("revise", revise), ("approve", approve),
    ]:
        g.add_node(name, fn)

    g.add_edge(START, "narrative_planning")
    g.add_edge("narrative_planning", "build_outline")
    g.add_edge("build_outline", "hook")
    g.add_edge("hook", "section_writing")
    g.add_edge("section_writing", "timing")
    g.add_edge("timing", "validate")
    g.add_edge("validate", "review")
    g.add_conditional_edges("review", route_review, {"approve": "approve", "revise": "revise"})
    g.add_edge("revise", "section_writing")
    g.add_edge("approve", END)
    return g.compile()
