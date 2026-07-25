"""
Working Memory (7.4) — what the AI needs *right now*.

Holds the current project's live artefacts (topic, script, research, timeline,
active tasks). Think of it as RAM: it is cleared when the project ends (7.16).
Backed by a JSON file under ``projects/<id>/`` so a long run survives a restart
and the SSD acts as extended memory (Ch20-style).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from core.config import get_settings


class WorkingMemory:
    def __init__(self, project_id: str) -> None:
        self.project_id = project_id
        self.dir: Path = get_settings().paths.projects / project_id
        self.dir.mkdir(parents=True, exist_ok=True)
        self._file = self.dir / "working.json"
        self._data: dict[str, Any] = {}
        if self._file.exists():
            try:
                self._data = json.loads(self._file.read_text("utf-8"))
            except Exception:
                self._data = {}

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    def set(self, key: str, value: Any) -> None:
        self._data[key] = value
        self._flush()

    def update(self, **kwargs: Any) -> None:
        self._data.update(kwargs)
        self._flush()

    def all(self) -> dict[str, Any]:
        return dict(self._data)

    def clear(self) -> None:
        """7.16 — working memory is wiped when the project ends."""
        self._data = {}
        self._flush()

    def _flush(self) -> None:
        try:
            self._file.write_text(json.dumps(self._data, default=_json_default), "utf-8")
        except Exception:
            pass


def _json_default(obj: Any) -> Any:
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if hasattr(obj, "__dict__"):
        return obj.__dict__
    return str(obj)
