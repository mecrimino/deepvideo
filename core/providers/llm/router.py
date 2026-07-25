"""
Multi-model LLM router (Ch1.7 / Ch5).

Agents never pick a provider themselves — they ask the router for an ``effort``
level and get the best available model:

    fast   → quick, cheap model for decomposition / classification / queries
    smart  → stronger model for script writing, review, reasoning

Provider order is OpenRouter → Groq. If **no** provider has a key, the router is
``available == False`` and agents fall back to their own deterministic logic
(the system still produces a video, just without LLM polish — Ch20 degrade
gracefully).
"""

from __future__ import annotations

import time
from typing import Any, Optional

from core.config import get_settings
from core.providers.llm.base import ChatMessage
from core.providers.llm.groq import GroqProvider
from core.providers.llm.openrouter import OpenRouterProvider
from core.utils.logging import get_logger
from core.utils.text import extract_json

log = get_logger("llm")


def _record_llm_call(provider: str, model: str, ms: float, ok: bool,
                     system: str, user: str) -> None:
    """Feed the Developer Dashboard's LLM-call feed (best-effort)."""
    try:
        from core.dev.metrics import get_metrics

        get_metrics().record_llm_call(provider=provider, model=model, ms=ms,
                                      ok=ok, system=system, user=user)
    except Exception:
        pass


class LLMUnavailable(RuntimeError):
    """No LLM provider is configured; caller should use a deterministic path."""


class LLMRouter:
    def __init__(self) -> None:
        self._settings = get_settings()
        self._providers = [OpenRouterProvider(), GroqProvider()]

    @property
    def available(self) -> bool:
        return any(p.available for p in self._providers)

    def _model_for(self, effort: str) -> str:
        return (
            self._settings.llm_model_smart
            if effort == "smart"
            else self._settings.llm_model_fast
        )

    async def chat(
        self,
        system: str,
        user: str,
        *,
        effort: str = "fast",
        temperature: float = 0.4,
        max_tokens: int = 1200,
    ) -> str:
        """Return the assistant text, trying each available provider in order."""
        messages = [ChatMessage("system", system), ChatMessage("user", user)]
        errors: list[str] = []
        for provider in self._providers:
            if not provider.available:
                continue
            t0 = time.monotonic()
            try:
                # each provider uses its own configured model (OpenRouter vs Groq)
                result = await provider.chat(
                    messages, model=None, temperature=temperature, max_tokens=max_tokens
                )
                if result.text.strip():
                    log.info("llm ok via %s (%s)", result.provider, result.model)
                    _record_llm_call(result.provider, result.model,
                                     (time.monotonic() - t0) * 1000, True, system, user)
                    return result.text
                # empty reply must be VISIBLE, not silently skipped
                errors.append(f"{provider.name}: empty response")
                _record_llm_call(provider.name, result.model,
                                 (time.monotonic() - t0) * 1000, False, system, user)
            except Exception as exc:  # try the next provider
                errors.append(f"{provider.name}: {exc}")
                _record_llm_call(provider.name, "",
                                 (time.monotonic() - t0) * 1000, False, system, user)
                log.warning("llm provider %s failed: %s", provider.name, exc)
        if not self.available:
            raise LLMUnavailable("no LLM provider configured")
        raise RuntimeError("all LLM providers failed: " + "; ".join(errors))

    async def json(
        self,
        system: str,
        user: str,
        *,
        effort: str = "fast",
        temperature: float = 0.2,
        max_tokens: int = 1500,
    ) -> Optional[Any]:
        """Chat and parse a JSON object/array from the reply (or ``None``)."""
        sys_json = (
            system
            + "\n\nRespond with STRICT, valid JSON only. No prose, no code fences."
        )
        try:
            text = await self.chat(
                sys_json, user, effort=effort, temperature=temperature, max_tokens=max_tokens
            )
        except LLMUnavailable:
            raise
        return extract_json(text)


_router: Optional[LLMRouter] = None


def get_llm() -> LLMRouter:
    global _router
    if _router is None:
        _router = LLMRouter()
    return _router
