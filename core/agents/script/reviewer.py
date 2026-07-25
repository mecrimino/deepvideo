"""
Script Reviewer (10.16) — quality metrics + revision gate.

Scores the draft on factual accuracy, readability, engagement, pacing,
repetition, clarity, estimated retention and visual compatibility. If the overall
score is below threshold the workflow sends the script back for another pass
(10.12 multi-pass writing).
"""

from __future__ import annotations

from core.agents.script.models import ScriptOutput
from core.agents.script.utils import words
from core.utils.text import split_sentences


class ScriptReviewer:
    def __init__(self, threshold: int = 70) -> None:
        self.threshold = threshold

    def review(self, output: ScriptOutput) -> tuple[int, dict]:
        scenes = output.scenes
        metrics: dict[str, int] = {}

        # factual accuracy — penalise unsupported claims (10.14)
        n_scenes = max(1, len(scenes))
        unsupported = len(output.unsupported_claims)
        metrics["factual"] = max(0, 100 - int(100 * unsupported / n_scenes))

        # readability — prefer ~12–22 words/sentence
        sents = [s for sc in scenes for s in split_sentences(sc.narration)]
        avg_len = (sum(words(s) for s in sents) / len(sents)) if sents else 0
        metrics["readability"] = 100 if 8 <= avg_len <= 24 else max(40, 100 - int(abs(avg_len - 16) * 4))

        # engagement — hook present + emotional variety
        emotions = {sc.emotion for sc in scenes}
        metrics["engagement"] = min(100, (30 if output.hook else 0) + len(emotions) * 18)

        # pacing — scenes not too long
        long_scenes = sum(1 for sc in scenes if sc.duration > 12)
        metrics["pacing"] = max(40, 100 - long_scenes * 8)

        # repetition — repeated visual goals
        goals = [sc.visual_goal for sc in scenes]
        repeats = len(goals) - len(set(goals))
        metrics["repetition"] = max(40, 100 - repeats * 6)

        # visual compatibility — every scene has a visual goal
        with_visual = sum(1 for sc in scenes if sc.visual_goal)
        metrics["visual"] = int(100 * with_visual / n_scenes)

        overall = round(sum(metrics.values()) / len(metrics)) if metrics else 0
        output.review_score = overall
        return overall, metrics

    def passed(self, score: int) -> bool:
        return score >= self.threshold
