"""
Recovery Manager (19.10 retry + 19.14 error classification).

Wraps agent calls with retry (exponential backoff, capped attempts) and
classifies failures so each category can be handled differently: network,
provider timeout, missing asset, hallucination, GPU/memory, invalid state.
"""

from __future__ import annotations

import asyncio
from enum import Enum
from typing import Awaitable, Callable, Optional, TypeVar

from core.utils.logging import get_logger

log = get_logger("orchestrator.recovery")

T = TypeVar("T")


class ErrorClass(str, Enum):
    NETWORK = "network"
    TIMEOUT = "provider_timeout"
    MISSING_ASSET = "missing_asset"
    HALLUCINATION = "hallucination"
    GPU_MEMORY = "gpu_memory"
    INVALID_STATE = "invalid_state"
    UNKNOWN = "unknown"


def classify(exc: Exception) -> ErrorClass:
    msg = str(exc).lower()
    if any(w in msg for w in ("connection", "network", "dns", "unreachable", "resolve")):
        return ErrorClass.NETWORK
    if any(w in msg for w in ("timeout", "timed out", "429", "rate")):
        return ErrorClass.TIMEOUT
    if any(w in msg for w in ("no such file", "not found", "missing", "404")):
        return ErrorClass.MISSING_ASSET
    if any(w in msg for w in ("cuda", "out of memory", "vram", "gpu")):
        return ErrorClass.GPU_MEMORY
    if any(w in msg for w in ("state", "invalid", "keyerror")):
        return ErrorClass.INVALID_STATE
    return ErrorClass.UNKNOWN


class RecoveryManager:
    def __init__(self, max_retries: int = 3) -> None:
        self.max_retries = max_retries

    async def run(self, name: str, fn: Callable[[], Awaitable[T]], *, default: Optional[T] = None) -> T:
        last: Optional[Exception] = None
        for attempt in range(self.max_retries):
            try:
                return await fn()
            except Exception as exc:  # noqa: BLE001
                last = exc
                cat = classify(exc)
                log.warning("stage '%s' failed (%s, attempt %d/%d): %s",
                            name, cat.value, attempt + 1, self.max_retries, exc)
                if cat in (ErrorClass.INVALID_STATE,):
                    break  # not worth retrying
                await asyncio.sleep(min(8.0, 0.5 * (2 ** attempt)))
        log.error("stage '%s' escalated after retries: %s", name, last)
        if default is not None:
            return default
        raise last  # type: ignore[misc]
