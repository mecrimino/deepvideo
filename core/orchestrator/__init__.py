"""
Autonomous Workflow Orchestrator (Ch19) — coordinates every agent.

Built per Ch19 (folder layout 19.17) with tools.md tech: a **LangGraph** state
machine (19.4) with checkpointing, over a State Manager, Scheduler, Event Bus,
Agent Dispatcher, Progress Monitor and Recovery Manager (19.3). It runs the whole
studio from goal → finished video, in parallel where dependencies allow (19.5),
with retries (19.10), human-approval interrupts (19.11), disk checkpoints (19.9),
audit trails (19.15) and dynamic replanning (19.20).

The frontend-facing mini run (``pipeline.py``) and render jobs (``render.py``)
remain available for the editor's script→timeline flow.
"""

from core.orchestrator.config import WorkflowConfig
from core.orchestrator.events import EventBus, get_event_bus
from core.orchestrator.models import WorkflowResult, WorkflowState
from core.orchestrator.progress import ProgressMonitor
from core.orchestrator.recovery import ErrorClass, RecoveryManager
from core.orchestrator.scheduler import Scheduler
from core.orchestrator.state import ProjectState, RunRecord, RunRegistry, get_registry

# WorkflowEngine + AgentDispatcher pull the full agent crew (LangGraph +
# LangChain). Load them LAZILY so importing the orchestrator for the mini
# pipeline / events / state doesn't require those heavy, optional deps (Ch20).
_LAZY = {"WorkflowEngine": "engine", "AgentDispatcher": "dispatcher"}


def __getattr__(name: str):  # PEP 562
    if name in _LAZY:
        import importlib

        mod = importlib.import_module(f"core.orchestrator.{_LAZY[name]}")
        return getattr(mod, name)
    raise AttributeError(f"module 'core.orchestrator' has no attribute '{name}'")


__all__ = [
    "WorkflowEngine", "WorkflowConfig", "WorkflowResult", "WorkflowState",
    "AgentDispatcher", "Scheduler", "ProgressMonitor", "RecoveryManager", "ErrorClass",
    "EventBus", "get_event_bus", "ProjectState", "RunRecord", "RunRegistry", "get_registry",
]
