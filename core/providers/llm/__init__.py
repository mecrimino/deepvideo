"""LLM providers + multi-model router (Ch1.7 "best model for each task")."""

from core.providers.llm.router import LLMRouter, get_llm

__all__ = ["LLMRouter", "get_llm"]
