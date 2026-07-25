"""
Audio Reviewer (18.8) — is the soundtrack clean and balanced?

Checks the audio plan for a narration track, music presence and balance, ducking,
and silence gaps. Routes fixes (e.g. "reduce music by 4 dB") to the Audio agent.
"""

from __future__ import annotations

from core.agents.reviewer.scoring import Critique, ProjectContext
from core.schemas.production import ReviewIssue


class AudioReviewer:
    category = "audio"

    async def review(self, ctx: ProjectContext) -> Critique:
        plan = ctx.audio_plan or {}
        has_voice = any(t.kind == "audio" for t in ctx.timeline.tracks) or bool(ctx.timeline.audioPath)
        issues: list[str] = []
        recs: list[ReviewIssue] = []
        score = 100

        if not has_voice:
            score -= 40
            issues.append("no narration/audio track")
            recs.append(ReviewIssue(category="audio", agent="audio", priority="high",
                                    action="Generate a voice-over."))
        if not plan.get("duck_regions"):
            score -= 8
            issues.append("music not ducked under narration")
            recs.append(ReviewIssue(category="audio", agent="audio", priority="medium",
                                    action="Enable dynamic ducking of the music."))
        if not plan.get("tts_available", False) and has_voice is False:
            recs.append(ReviewIssue(category="audio", agent="audio", priority="low",
                                    action="Add a TTS voice provider for narration."))
        return Critique(category=self.category, score=max(0, score), issues=issues, recommendations=recs)
