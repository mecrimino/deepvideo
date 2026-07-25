"""
Logging & Audit Trail (19.15) — record every important orchestrator action.

Each entry is timestamped (agent started/completed, state transitions, retries,
failures) and appended to a per-project audit file, so runs are debuggable and
reproducible. Backed by Loguru (via the core logger) plus a JSONL audit log.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from core.config import get_settings
from core.utils.ids import now_iso
from core.utils.logging import get_logger

log = get_logger("orchestrator")


class AuditTrail:
    def __init__(self, project_id: str) -> None:
        self.project_id = project_id
        self.dir = get_settings().paths.projects / project_id
        self.dir.mkdir(parents=True, exist_ok=True)
        self.file = self.dir / "audit.jsonl"

    def record(self, action: str, **detail: Any) -> None:
        entry = {"at": now_iso(), "action": action, **detail}
        log.info("%s %s", action, {k: v for k, v in detail.items() if k != "error"})
        try:
            with self.file.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps(entry, default=str) + "\n")
        except Exception:
            pass

    def entries(self) -> list[dict]:
        if not self.file.exists():
            return []
        out = []
        for line in self.file.read_text("utf-8").splitlines():
            try:
                out.append(json.loads(line))
            except Exception:
                continue
        return out
