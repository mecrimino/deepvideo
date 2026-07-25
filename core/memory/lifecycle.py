"""
Memory Lifecycle (7.16) — not everything should be remembered forever.

    project starts → working memory → important? →
        no  → delete
        yes → compress → store long-term → available for future projects

At project end the lifecycle decides which working-memory artefacts are worth
keeping, compresses them (7.15) and promotes them to long-term memory, then wipes
working memory. Importance is a simple, overridable heuristic.
"""

from __future__ import annotations

from typing import Callable, Optional

from core.memory.models import MemoryKind
from core.memory.working import WorkingMemory
from core.utils.logging import get_logger

log = get_logger("memory.lifecycle")

# working-memory keys worth promoting to long-term when a project ends
_IMPORTANT_KEYS = {"topic", "strategy", "review", "scriptText", "style_memory"}


class Lifecycle:
    def __init__(self, backend) -> None:
        self.b = backend

    def is_important(self, key: str, value) -> bool:
        return key in _IMPORTANT_KEYS and bool(value)

    async def consolidate(
        self, working: WorkingMemory, *, importance: Optional[Callable[[str, object], bool]] = None
    ) -> int:
        """Promote important working memories to long-term (compressing large
        ones), then clear working memory. Returns how many were promoted."""
        important = importance or self.is_important
        promoted = 0
        for key, value in working.all().items():
            if not important(key, value):
                continue
            text = value if isinstance(value, str) else str(value)
            rec_id = None
            summary = await self.b.compressor.compress(text, ref_id=f"{working.project_id}:{key}")
            self.b.save(
                summary, kind=MemoryKind.LONG_TERM, scope="global",
                metadata={"project_id": working.project_id, "key": key},
                rating=0.6, confidence=0.6,
            )
            promoted += 1
        log.info("consolidated %d memories from project %s", promoted, working.project_id)
        working.clear()  # working memory is RAM — wiped at project end (7.16)
        return promoted
