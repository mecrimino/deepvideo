"""OpenRouter chat-completions provider (OpenAI-compatible API)."""

from __future__ import annotations

from core.config import get_settings
from core.providers.api_manager import KeyPool, get_api_manager
from core.providers.llm.base import ChatMessage, LLMResult

_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"


class OpenRouterProvider:
    name = "openrouter"

    def __init__(self) -> None:
        settings = get_settings()
        self._pool = KeyPool(list(settings.openrouter_keys))
        self._model = settings.openrouter_model
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
        model = model or self._model
        payload = {
            "model": model,
            "messages": [m.as_dict() for m in messages],
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        data = await self._api.request(
            "POST",
            _ENDPOINT,
            pool=self._pool,
            headers={
                "Content-Type": "application/json",
                "HTTP-Referer": "https://deep-vision.local",
                "X-Title": "Deep Vision",
            },
            json_body=payload,
        )
        text = (
            (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            if isinstance(data, dict)
            else ""
        )
        _record_llm("openrouter.ai", data)
        return LLMResult(text=text or "", model=model, provider=self.name)


def _record_llm(provider_host: str, data) -> None:
    """Feed token usage to the Developer Dashboard metrics (best-effort).

    Keyed by the endpoint host (e.g. ``openrouter.ai``) so token counts land on
    the same provider row the API Manager records requests under.
    """
    try:
        from core.dev.metrics import get_metrics

        usage = (data or {}).get("usage") or {} if isinstance(data, dict) else {}
        get_metrics().record_tokens(provider_host, int(usage.get("total_tokens") or 0))
    except Exception:
        pass
