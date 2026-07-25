"""Groq chat-completions provider (OpenAI-compatible, very fast free tier)."""

from __future__ import annotations

from core.config import get_settings
from core.providers.api_manager import KeyPool, get_api_manager
from core.providers.llm.base import ChatMessage, LLMResult
from core.providers.llm.openrouter import _record_llm

_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

# Groq-hosted open models; used when the router is asked for a Groq model or as
# a fallback provider. Names are the Groq catalogue ids.
DEFAULT_MODEL = "llama-3.3-70b-versatile"


class GroqProvider:
    name = "groq"

    def __init__(self) -> None:
        settings = get_settings()
        self._pool = KeyPool(list(settings.groq_keys))
        self._model = settings.groq_model
        self._api = get_api_manager()

    @property
    def available(self) -> bool:
        return bool(self._pool)

    async def chat(
        self,
        messages: list[ChatMessage],
        *,
        model: str | None = None,
        temperature: float = 0.4,
        max_tokens: int = 1200,
    ) -> LLMResult:
        # Use the configured Groq model verbatim (e.g. openai/gpt-oss-120b).
        groq_model = model or self._model
        # Reasoning models spend tokens on hidden reasoning BEFORE the answer —
        # a small max_tokens returns empty content. Give them headroom.
        if "gpt-oss" in groq_model or "reasoning" in groq_model:
            max_tokens = max(max_tokens, 1024)
        payload = {
            "model": groq_model,
            "messages": [m.as_dict() for m in messages],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        data = await self._api.request(
            "POST",
            _ENDPOINT,
            pool=self._pool,
            headers={"Content-Type": "application/json"},
            json_body=payload,
        )
        text = (
            (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            if isinstance(data, dict)
            else ""
        )
        _record_llm("api.groq.com", data)
        return LLMResult(text=text or "", model=groq_model, provider=self.name)
