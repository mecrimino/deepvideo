"""
Production Plan Builder (11.16) + Emotional Mapping (11.9).

Assembles the finished, machine-readable production plan: every scene has a
visual goal, media type, camera move, transition, overlays, emotion and timing,
plus project-wide constraints (11.14) and a scene graph for narrative continuity
(11.15). Assigns an emotional objective to any scene that lacks one.
"""

from __future__ import annotations

from core.agents.scene.models import SceneGraph, ScenePlanResult, VisualConstraints
from core.schemas.production import Scene

# 11.9 emotional mapping keywords → objective
_EMOTIONS = {
    "excitement": ("launch", "explosion", "fastest", "record", "incredible", "breakthrough", "victory"),
    "tension": ("failure", "crash", "danger", "threat", "war", "attack", "crisis"),
    "wonder": ("mystery", "secret", "hidden", "unknown", "vast", "cosmos", "universe"),
    "curiosity": ("how", "why", "discover", "reveal", "question", "explains"),
    "relief": ("finally", "safe", "success", "recovered", "solved"),
    "celebration": ("achievement", "milestone", "won", "champion", "historic"),
}


def emotion_for(text: str) -> str:
    t = (text or "").lower()
    for emotion, words in _EMOTIONS.items():
        if any(w in t for w in words):
            return emotion
    return "neutral"


class ProductionPlanBuilder:
    def build(self, scenes: list[Scene], *, topic: str = "",
              constraints: VisualConstraints | None = None) -> ScenePlanResult:
        for s in scenes:
            if not s.emotion or s.emotion == "neutral":
                s.emotion = emotion_for(s.narration)
        graph = SceneGraph(
            order=[s.scene_id for s in scenes],
            edges=[(scenes[i].scene_id, scenes[i + 1].scene_id) for i in range(len(scenes) - 1)],
        )
        total = round(sum(s.duration for s in scenes), 2)
        return ScenePlanResult(
            topic=topic, scenes=scenes,
            constraints=constraints or VisualConstraints(),
            graph=graph, estimated_duration=total, status="success",
        )
