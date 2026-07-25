"""
Draft Generator (10.5) + Scene-Aware Writing (10.10).

Writes the spoken narration for each section from the facts assigned to it (never
inventing facts — 10.14), sized to the section's target duration, then annotates
it into scenes: each scene carries a visual goal, emotion, importance and
estimated duration (10.10/10.15) so the Scene Planner can work automatically.
"""

from __future__ import annotations

from core.agents.script.models import ScriptInput, ScriptSection, SceneScript
from core.agents.script.prompts import SECTION_SYSTEM, audience_style
from core.agents.script.utils import speak_seconds, words_for_seconds
from core.providers.llm.router import LLMUnavailable
from core.utils.logging import get_logger
from core.utils.text import split_sentences

log = get_logger("script.draft")

_KEYWORD_STOP = {"the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
                 "is", "was", "were", "that", "this", "it", "its", "as", "by", "from"}


def _emotion(text: str) -> str:
    t = text.lower()
    if any(w in t for w in ("launch", "explosion", "fastest", "record", "incredible", "breakthrough")):
        return "excitement"
    if any(w in t for w in ("war", "died", "crash", "failure", "tragic", "lost")):
        return "serious"
    if any(w in t for w in ("secret", "mystery", "hidden", "unknown", "classified")):
        return "suspense"
    if any(w in t for w in ("future", "hope", "legacy", "dream", "finally")):
        return "inspirational"
    return "neutral"


def _visual_goal(text: str) -> str:
    words = [w.strip(".,") for w in text.split() if w.lower() not in _KEYWORD_STOP and len(w) > 2]
    return " ".join(words[:5]) or text[:40]


class DraftGenerator:
    def __init__(self, llm) -> None:
        self.llm = llm

    async def write(self, inp: ScriptInput, section: ScriptSection, facts: list[str], start_id: int) -> int:
        section.narration = await self._narrate(inp, section, facts)
        section.scenes = self._annotate(section.narration, start_id)
        return start_id + len(section.scenes)

    async def _narrate(self, inp: ScriptInput, section: ScriptSection, facts: list[str]) -> str:
        target_words = max(20, words_for_seconds(section.target_duration))
        if self.llm.available:
            try:
                fact_block = "\n".join(f"- {f}" for f in facts) or f"(general knowledge about {inp.knowledge_package.topic})"
                text = await self.llm.chat(
                    SECTION_SYSTEM,
                    f"Topic: {inp.knowledge_package.topic}\nSection: {section.title} "
                    f"({section.kind})\nAudience style: {audience_style(inp.audience)}\n"
                    f"Target length: ~{target_words} words.\nFacts you may use:\n{fact_block}\n\n"
                    "Write the narration for this section only.",
                    effort="smart", max_tokens=min(1200, target_words * 3),
                )
                if text.strip():
                    return text.strip()
            except LLMUnavailable:
                pass
            except Exception as exc:
                log.warning("section draft failed: %s", exc)
        # deterministic fallback: weave the facts into sentences
        if facts:
            return " ".join(f"{f.rstrip('.')}." for f in facts)
        return f"{section.title}. {inp.knowledge_package.summary[:200]}"

    def _annotate(self, narration: str, start_id: int) -> list[SceneScript]:
        scenes: list[SceneScript] = []
        sentences = split_sentences(narration)
        sid = start_id
        i = 0
        while i < len(sentences):
            # 1–2 sentences per scene
            chunk = " ".join(sentences[i : i + 2]).strip()
            i += 2
            if not chunk:
                continue
            scenes.append(SceneScript(
                scene_id=sid, title=_visual_goal(chunk)[:40], narration=chunk,
                visual_goal=_visual_goal(chunk), duration=max(2.0, speak_seconds(chunk)),
                emotion=_emotion(chunk), importance="high" if sid == start_id else "medium",
            ))
            sid += 1
        return scenes
