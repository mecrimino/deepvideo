"""
Director Agent (Ch5) — the brain of the entire system.

Built from scratch per Ch5 using tools.md tech: a **LangGraph** thinking process
(5.4) over eight **Pydantic**-typed internal modules (5.6), driven by the
**LLM** providers (OpenRouter/Groq) with **LangChain-core** messages, **Loguru**
logs and the event bus. The Director thinks, plans, coordinates and decides — it
never edits video (5.17).
"""

from core.agents.director.agent import DirectorAgent, Dispatcher
from core.agents.director.models import (
    Complexity,
    ExportDecision,
    GoalAnalysis,
    ProductionBrief,
    ProductionStrategy,
    ReviewOutcome,
    TaskAssignment,
    TaskResult,
    WorkflowChoice,
)

__all__ = [
    "DirectorAgent", "Dispatcher", "ProductionStrategy", "ProductionBrief",
    "GoalAnalysis", "Complexity", "WorkflowChoice", "TaskAssignment",
    "TaskResult", "ReviewOutcome", "ExportDecision",
]
