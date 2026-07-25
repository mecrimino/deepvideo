"""
Agent Dispatcher (19.7) — decides which agent runs with what inputs.

Holds one shared :class:`AgentContext` and lazily instantiates every production
agent, exposing them by name. The engine dispatches work through here so agent
wiring lives in one place (and agents share memory/events/LLM).
"""

from __future__ import annotations

from functools import cached_property

from core.agents.base import AgentContext


class AgentDispatcher:
    def __init__(self, ctx: AgentContext) -> None:
        self.ctx = ctx

    @cached_property
    def director(self):
        from core.agents.director import DirectorAgent
        return DirectorAgent(self.ctx)

    @cached_property
    def planner(self):
        from core.agents.planner import PlannerAgent
        return PlannerAgent(self.ctx)

    @cached_property
    def research(self):
        from core.agents.research import ResearchAgent
        return ResearchAgent(self.ctx)

    @cached_property
    def script(self):
        from core.agents.script import ScriptAgent
        return ScriptAgent(self.ctx)

    @cached_property
    def scene(self):
        from core.agents.scene import ScenePlannerAgent
        return ScenePlannerAgent(self.ctx)

    @cached_property
    def image(self):
        from core.agents.image import ImageSearchAgent
        return ImageSearchAgent(self.ctx)

    @cached_property
    def video(self):
        from core.agents.video import VideoSearchAgent
        return VideoSearchAgent(self.ctx)

    @cached_property
    def graphics(self):
        from core.agents.graphics import MotionGraphicsAgent
        return MotionGraphicsAgent(self.ctx)

    @cached_property
    def audio(self):
        from core.agents.audio import AudioAgent
        return AudioAgent(self.ctx)

    @cached_property
    def timeline(self):
        from core.agents.timeline import TimelineAgent
        return TimelineAgent(self.ctx)

    @cached_property
    def reviewer(self):
        from core.agents.reviewer import ReviewerAgent
        return ReviewerAgent(self.ctx)
