"""
Scene Captioning (14.18) — a concise, searchable description of the scene.

    "A SpaceX Falcon 9 rocket launches at sunset while smoke surrounds the pad."

Written by the LLM from the extracted metadata when available; otherwise composed
from the objects / action / lighting / camera descriptors.
"""

from __future__ import annotations

from core.providers.llm.router import LLMUnavailable
from core.utils.logging import get_logger

log = get_logger("vision.caption")


class SceneCaptioner:
    def __init__(self, llm=None) -> None:
        self.llm = llm

    async def caption(self, *, objects, actions, scene, lighting, camera, emotion, text) -> str:
        parts = {
            "objects": ", ".join(objects[:6]) or "none",
            "actions": ", ".join(actions) or "none",
            "scene": scene or "unknown",
            "lighting": lighting or "unknown",
            "camera": camera or "unknown",
            "emotion": emotion or "neutral",
            "text": ", ".join(text[:3]) or "none",
        }
        if self.llm is not None and self.llm.available:
            try:
                cap = await self.llm.chat(
                    "You write one concise caption describing a video shot. One sentence, no preamble.",
                    f"Scene metadata: {parts}. Write the caption.",
                    effort="fast", max_tokens=60,
                )
                if cap.strip():
                    return cap.strip().strip('"')
            except LLMUnavailable:
                pass
            except Exception as exc:
                log.debug("caption llm failed: %s", exc)
        # template fallback
        clean_scene = scene if scene not in ("general", "unknown", "") else ""
        subj = ", ".join(objects[:3]) or clean_scene or "a scene"
        act = f" {actions[0]}" if actions else ""
        light = f" in {lighting.replace('_', ' ')}" if lighting and lighting != "unknown" else ""
        return f"{camera.replace('_',' ') or 'A'} shot of {subj}{act}{light}.".strip().capitalize()
