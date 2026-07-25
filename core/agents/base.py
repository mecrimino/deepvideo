"""
BaseAgent — the shared contract every production agent follows (Ch2.11 / Layer 4).

    Input → Thinking → Output

Each agent has a single responsibility (Ch1.6), receives structured input,
optionally reasons with the LLM (falling back to deterministic logic when no LLM
is configured), and returns a structured, typed result. Agents share the
:class:`AgentContext` — the run's memory, event bus and settings — so they can
cooperate (Ch1: fewer well-designed agents that share information).
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Generic, Optional, TypeVar

from core.config import Settings, get_settings
from core.memory import MemorySystem
from core.providers.llm import LLMRouter, get_llm
from core.utils.logging import get_logger

TInput = TypeVar("TInput")
TOutput = TypeVar("TOutput")


@dataclass
class AgentContext:
    """Everything shared across the agents working on one run."""

    project_id: str
    memory: MemorySystem
    settings: Settings = field(default_factory=get_settings)
    llm: LLMRouter = field(default_factory=get_llm)
    events: Optional[Any] = None  # EventBus (set by the orchestrator)

    def emit(self, event: str, **payload: Any) -> None:
        if self.events is not None:
            self.events.emit(event, project_id=self.project_id, **payload)


class BaseAgent(Generic[TInput, TOutput]):
    """Base class: subclasses implement :meth:`run` (the "thinking")."""

    #: single-word agent id used in task graphs / review recommendations
    name: str = "agent"

    def __init__(self, ctx: AgentContext) -> None:
        self.ctx = ctx
        self.log = get_logger(self.name)

    @property
    def llm(self) -> LLMRouter:
        return self.ctx.llm

    @property
    def memory(self) -> MemorySystem:
        return self.ctx.memory

    async def __call__(self, data: TInput) -> TOutput:
        started = time.monotonic()
        self.ctx.emit(f"{self.name}.started")
        self.log.info("%s: start", self.name)
        try:
            result = await self.run(data)
        except Exception:
            self.ctx.emit(f"{self.name}.failed")
            self.log.exception("%s: failed", self.name)
            raise
        elapsed = time.monotonic() - started
        self.log.info("%s: done in %.2fs", self.name, elapsed)
        self.ctx.emit(f"{self.name}.completed", elapsed=round(elapsed, 3))
        return result

    async def run(self, data: TInput) -> TOutput:  # pragma: no cover - abstract
        raise NotImplementedError
