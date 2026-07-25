"""Shared LLM types + the provider protocol."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol, runtime_checkable

Role = Literal["system", "user", "assistant"]


@dataclass
class ChatMessage:
    role: Role
    content: str

    def as_dict(self) -> dict[str, str]:
        return {"role": self.role, "content": self.content}


@dataclass
class LLMResult:
    text: str
    model: str
    provider: str


@runtime_checkable
class LLMProvider(Protocol):
    name: str

    @property
    def available(self) -> bool:  # has a key configured
        ...

    async def chat(
        self, messages: list[ChatMessage], *, model: str, temperature: float, max_tokens: int
    ) -> LLMResult:
        ...
