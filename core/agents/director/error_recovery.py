"""
Error Recovery (5.6) — the Director detects failures and retries intelligently.

Implements the 5.13 ladder as an escalating policy:

    Retry → Different Query → Different Provider → Cached Results →
    Generate → Ask User (last resort)

:meth:`next_action` decides the next rung for a failed task given the attempt
count; :meth:`apply` rewrites the task's structured params to enact that rung
(e.g. rephrase the query, force a provider switch, or fall back to generation).
The Director re-dispatches the mutated task; nothing is silently dropped.
"""

from __future__ import annotations

from core.agents.director.models import RecoveryAction, TaskAssignment
from core.utils.logging import get_logger

# The ladder, in escalation order (5.13).
_LADDER = [
    RecoveryAction.RETRY,
    RecoveryAction.REPHRASE_QUERY,
    RecoveryAction.SWITCH_PROVIDER,
    RecoveryAction.USE_CACHE,
    RecoveryAction.GENERATE,
    RecoveryAction.ASK_USER,
]


class ErrorRecovery:
    def __init__(self, max_retries: int = 3) -> None:
        # cap how far up the ladder we climb before asking the user
        self.max_rungs = min(len(_LADDER), max_retries + 2)
        self.log = get_logger("director.recovery")

    def next_action(self, attempt: int) -> RecoveryAction:
        """attempt is 0-based: 0 → RETRY, 1 → REPHRASE_QUERY, ..."""
        if attempt >= self.max_rungs:
            return RecoveryAction.GIVE_UP
        return _LADDER[min(attempt, len(_LADDER) - 1)]

    def apply(self, task: TaskAssignment, action: RecoveryAction) -> TaskAssignment:
        """Rewrite the task's params to enact a recovery rung (2.12 structured)."""
        params = dict(task.params)
        if action == RecoveryAction.REPHRASE_QUERY:
            params["query_variant"] = int(params.get("query_variant", 0)) + 1
            params["rephrase"] = True
        elif action == RecoveryAction.SWITCH_PROVIDER:
            params["exclude_provider"] = params.get("last_provider")
            params["force_switch"] = True
        elif action == RecoveryAction.USE_CACHE:
            params["cache_only"] = True
        elif action == RecoveryAction.GENERATE:
            params["mode"] = "generate"
        elif action == RecoveryAction.ASK_USER:
            params["needs_user"] = True
        self.log.info("recovery %s for task %s", action.value, task.name)
        return task.model_copy(update={"params": params})
