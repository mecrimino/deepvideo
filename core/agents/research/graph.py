"""
Research pipeline as a LangGraph StateGraph (9.4):

    understand goal → (memory reuse?) → generate questions → plan sources →
    retrieve (multi-source/multi-hop) → extract facts → detect contradictions →
    score confidence → package → quality check → store

If the topic was already researched, a conditional edge short-circuits to the
cached package (9.14).
"""

from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from core.agents.research.state import ResearchState


def build_research_graph(agent):
    async def understand_goal(state: ResearchState) -> dict:
        goal = await agent.goal_analyzer.analyze(state["topic"], hint=state.get("goal_hint"))
        return {"goal": goal}

    async def check_memory(state: ResearchState) -> dict:  # 9.14
        existing = agent.research_memory.find_existing(state["goal"].topic)
        if existing is not None:
            return {"package": existing, "reused": True}
        return {"reused": False}

    async def generate_questions(state: ResearchState) -> dict:  # 9.6/9.7
        questions = await agent.query_planner.generate(state["goal"])
        questions = agent.source_selector.assign(questions)
        return {"questions": questions}

    async def retrieve(state: ResearchState) -> dict:  # 9.8/9.13
        contexts = await agent.retrieval_engine.retrieve(state["goal"], state["questions"])
        return {"contexts": contexts, "questions": state["questions"]}

    async def extract_facts(state: ResearchState) -> dict:  # 9.9
        facts = []
        for q, ctx in zip(state["questions"], state["contexts"]):
            facts.extend(await agent.fact_extractor.extract(ctx, question_id=q.id))
        return {"facts": facts}

    async def detect_contradictions(state: ResearchState) -> dict:  # 9.10
        facts, contradictions = agent.contradiction_detector.detect(state["facts"])
        return {"facts": facts, "contradictions": contradictions}

    async def score_confidence(state: ResearchState) -> dict:  # 9.11
        return {"facts": agent.confidence_estimator.score(state["facts"])}

    async def package(state: ResearchState) -> dict:  # 9.12
        pkg = await agent.knowledge_packager.build(state["goal"], state["facts"], state["contexts"])
        return {"package": pkg}

    async def quality_check(state: ResearchState) -> dict:  # 9.15
        ok, issues = agent.quality_checks.check(
            state["questions"], state["facts"], state.get("contradictions", []), state["package"])
        if issues:
            agent.ctx.emit("research.quality", ok=ok, issues=issues)
        return {"quality_ok": ok}

    async def store(state: ResearchState) -> dict:  # 9.14
        agent.research_memory.store(state["package"])
        agent.ctx.emit("research.completed", topic=state["goal"].topic,
                       facts=len(state["package"].key_facts), confidence=state["package"].confidence)
        return {}

    def route_memory(state: ResearchState) -> str:
        return "reuse" if state.get("reused") else "research"

    g = StateGraph(ResearchState)
    for name, fn in [
        ("understand_goal", understand_goal), ("check_memory", check_memory),
        ("generate_questions", generate_questions), ("retrieve", retrieve),
        ("extract_facts", extract_facts), ("detect_contradictions", detect_contradictions),
        ("score_confidence", score_confidence), ("package", package),
        ("quality_check", quality_check), ("store", store),
    ]:
        g.add_node(name, fn)

    g.add_edge(START, "understand_goal")
    g.add_edge("understand_goal", "check_memory")
    g.add_conditional_edges("check_memory", route_memory,
                            {"reuse": END, "research": "generate_questions"})
    g.add_edge("generate_questions", "retrieve")
    g.add_edge("retrieve", "extract_facts")
    g.add_edge("extract_facts", "detect_contradictions")
    g.add_edge("detect_contradictions", "score_confidence")
    g.add_edge("score_confidence", "package")
    g.add_edge("package", "quality_check")
    g.add_edge("quality_check", "store")
    g.add_edge("store", END)
    return g.compile()
