"""
Reviewer, Critic & Self-Improvement Agents (Ch18) — quality control.

Built from scratch per Ch18 (folder layout 18.17) with tools.md tech: seven
specialised **Pydantic**-typed critics (story/fact/visual/audio/timeline/motion/
accessibility, 18.5–18.11) aggregated into a scorecard (18.13), an improvement
planner that routes fixes to the responsible agent (18.14), a viewer-retention
predictor (18.12), an LLM debate moderator (18.19) and **Ch7** self-improvement
memory (18.20). Produces the shared :class:`ReviewReport` (18.16).
"""

from core.agents.reviewer.agent import ReviewerAgent
from core.agents.reviewer.scoring import Critique, ProjectContext

__all__ = ["ReviewerAgent", "Critique", "ProjectContext"]
