"""
Event bus (Ch17 event-driven collaboration / Ch19.3).

Agents and the orchestrator publish events (``script.approved``,
``scene.generated``, ``voice.completed``, ``timeline.updated``,
``review.failed`` ...). Subscribers react to only what they care about. Used
here to stream live progress to the frontend processing monitor and to record an
observable activity log (Ch2.13).
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from core.utils.ids import now_iso
from core.utils.logging import get_logger

log = get_logger("events")

Listener = Callable[["Event"], None]


@dataclass
class Event:
    name: str
    at: str = field(default_factory=now_iso)
    payload: dict[str, Any] = field(default_factory=dict)


class EventBus:
    def __init__(self) -> None:
        self._listeners: dict[str, list[Listener]] = defaultdict(list)
        self._wildcard: list[Listener] = []

    def on(self, name: str, listener: Listener) -> None:
        if name == "*":
            self._wildcard.append(listener)
        else:
            self._listeners[name].append(listener)

    def emit(self, name: str, **payload: Any) -> None:
        event = Event(name=name, payload=payload)
        for listener in list(self._listeners.get(name, ())) + list(self._wildcard):
            try:
                listener(event)
            except Exception as exc:  # a bad listener must not break the run
                log.debug("listener for %s failed: %s", name, exc)


_bus: Optional[EventBus] = None


def get_event_bus() -> EventBus:
    global _bus
    if _bus is None:
        _bus = EventBus()
    return _bus
