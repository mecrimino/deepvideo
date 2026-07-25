"""
Timing Estimation (10.11) — estimate narration length at ~150 wpm.

Sums the per-scene estimates into a total and reports how close the script is to
the requested duration, so the pacing optimizer / reviewer can flag a script
that runs too long or too short.
"""

from __future__ import annotations

from core.agents.script.models import ScriptOutput


class TimingAnalyzer:
    def analyze(self, output: ScriptOutput, target: float) -> ScriptOutput:
        total = sum(s.duration for s in output.scenes)
        output.estimated_duration = round(total, 1)
        # attach a pacing note when far from target (±25%)
        if target and total:
            drift = (total - target) / target
            if drift > 0.25:
                output.visual_notes.append(f"Script ~{total:.0f}s is longer than target {target:.0f}s — consider trimming.")
            elif drift < -0.25:
                output.visual_notes.append(f"Script ~{total:.0f}s is shorter than target {target:.0f}s — consider expanding.")
        return output
