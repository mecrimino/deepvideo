"""
Workflow Configuration (19.16) — tunables kept separate from code.

Parallelism, retry limits, checkpoint cadence, review threshold and whether the
run pauses for human approval. Defaults come from the core settings so one place
governs the whole studio.
"""

from __future__ import annotations

from pydantic import BaseModel

from core.config import get_settings


class WorkflowConfig(BaseModel):
    parallelism: int = 8               # 19.5
    max_retries: int = 3               # 19.10
    checkpoint_interval_sec: float = 300.0  # 19.9 ("5m")
    review_threshold: int = 90         # 19.16
    max_revisions: int = 1             # 19.20 review→improve loop cap
    require_approval: bool = False     # 19.11 human-in-the-loop
    ingest_web: bool = True            # allow research web ingest

    @classmethod
    def from_settings(cls) -> "WorkflowConfig":
        s = get_settings()
        return cls(parallelism=s.parallelism, max_retries=s.max_retries,
                   review_threshold=s.review_threshold)
