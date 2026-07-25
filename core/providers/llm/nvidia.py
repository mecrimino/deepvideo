"""NVIDIA NIM chat provider — GLM 5.2 for motion-graphics design.

OpenAI-compatible endpoint, consumed via SSE streaming: the free NIM queue can
take minutes before first byte, and non-streaming requests time out. Callers
should BATCH work into one call (the queue wait dominates, not tokens).
Host cap (38 req/min) is enforced by the ApiManager limiter table.
"""

from __future__ import annotations

import json
from functools import lru_cache

import httpx

from core.config import get_settings
from core.providers.llm.base import ChatMessage, LLMResult
from core.utils.logging import get_logger

log = get_logger("llm.nvidia")

_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions"


class NvidiaProvider:
    name = "nvidia"

    def __init__(self) -> None:
        settings = get_settings()
        self._keys = list(settings.nvidia_keys)
        self._model = settings.nvidia_model

    @property
    def available(self) -> bool:
        return bool(self._keys)

    async def chat(
        self,
        messages: list[ChatMessage],
        *,
        model: str | None = None,
        temperature: float = 1.0,
        max_tokens: int = 16384,
        seed: int = 42,
        timeout_sec: float = 600.0,
    ) -> LLMResult:
        payload = {
            "model": model or self._model,
            "messages": [m.as_dict() for m in messages],
            "temperature": temperature,
            "top_p": 1,
            "max_tokens": max_tokens,
            "seed": seed,
            "stream": True,
        }
        last_exc: Exception | None = None
        for key in self._keys:  # rotate on auth/rate errors
            try:
                text = await self._stream(key, payload, timeout_sec)
                return LLMResult(text=text, model=payload["model"], provider=self.name)
            except httpx.HTTPStatusError as exc:
                last_exc = exc
                if exc.response.status_code in (401, 403, 429):
                    log.warning("nvidia key rejected (%s), trying next", exc.response.status_code)
                    continue
                raise
            except httpx.TransportError as exc:
                last_exc = exc
                log.warning("nvidia transport error: %s", exc)
        raise RuntimeError(f"nvidia GLM call failed: {last_exc}")

    async def _stream(self, key: str, payload: dict, timeout_sec: float) -> str:
        parts: list[str] = []
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout_sec, connect=15)) as client:
            async with client.stream(
                "POST", _ENDPOINT,
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json=payload,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: ") or line == "data: [DONE]":
                        continue
                    try:
                        delta = json.loads(line[6:])["choices"][0].get("delta", {})
                    except Exception:
                        continue
                    chunk = delta.get("content")
                    if chunk:
                        parts.append(chunk)
        return "".join(parts)


@lru_cache(maxsize=1)
def get_glm() -> NvidiaProvider:
    return NvidiaProvider()
