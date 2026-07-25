"""
Reviewer, Critic & Self-Improvement Agent (Ch18) — quality control.

Runs specialised critics instead of one general reviewer (18.1): story, fact,
visual, audio, timeline, motion-graphics and accessibility. It aggregates their
scores (18.13), predicts viewer-retention risks (18.12), plans targeted
improvements routed to the responsible agent (18.14), and remembers recurring
mistakes for future projects (18.20). It never fixes problems itself — it tells
the right agent what to improve (18.2). A debate moderator (18.19) resolves
conflicting critic opinions.

Built from scratch per Ch18 (folder layout 18.17) with tools.md tech: Pydantic
(shared ReviewReport), LLM (story critique + debate), Ch7 memory (self-learning).
"""

from __future__ import annotations

from core.agents.base import AgentContext, BaseAgent
from core.agents.reviewer.accessibility import AccessibilityReviewer
from core.agents.reviewer.audio import AudioReviewer
from core.agents.reviewer.facts import FactReviewer
from core.agents.reviewer.graphics import GraphicsReviewer
from core.agents.reviewer.planner import ImprovementPlanner
from core.agents.reviewer.report import ReportBuilder
from core.agents.reviewer.scoring import Critique, ProjectContext, ScoreAggregator
from core.agents.reviewer.story import StoryReviewer
from core.agents.reviewer.timeline import TimelineReviewer
from core.agents.reviewer.visuals import VisualReviewer
from core.schemas.edl import Timeline
from core.schemas.production import KnowledgePackage, ReviewReport, Scene


class ReviewerAgent(BaseAgent[Timeline, ReviewReport]):
    name = "reviewer"

    def __init__(self, ctx: AgentContext) -> None:
        super().__init__(ctx)
        self.critics = [
            StoryReviewer(self.llm), FactReviewer(), VisualReviewer(), AudioReviewer(),
            TimelineReviewer(), GraphicsReviewer(), AccessibilityReviewer(),
        ]
        self.aggregator = ScoreAggregator()
        self.planner = ImprovementPlanner()
        self.report = ReportBuilder()

    async def run(self, timeline: Timeline) -> ReviewReport:
        return await self.review(self._context(timeline))

    async def review(self, ctx: ProjectContext) -> ReviewReport:
        critiques: list[Critique] = []
        for critic in self.critics:
            try:
                critiques.append(await critic.review(ctx))
            except Exception as exc:
                self.log.warning("%s critic failed: %s", critic.category, exc)

        overall, scores = self.aggregator.aggregate(critiques)          # 18.13
        recs = self.planner.plan(critiques)                             # 18.14
        recs += self._retention(ctx)                                    # 18.12
        threshold = self.ctx.settings.review_threshold
        report = self.report.build(overall, scores, recs, threshold=threshold)

        self._self_improve(report, ctx)                                 # 18.20
        self.ctx.emit("review.completed", score=overall, passed=report.passed,
                      recommendations=len(report.recommendations))
        if not report.passed:
            self.ctx.emit("review.failed", score=overall)
        return report

    # ------------------------------------------------------------------ #
    # 18.12 viewer-retention predictor
    # ------------------------------------------------------------------ #
    def _retention(self, ctx: ProjectContext):
        from core.schemas.production import ReviewIssue

        out = []
        clips = sorted((c for t in ctx.timeline.tracks if t.kind == "video" for c in t.clips),
                       key=lambda c: c.range.startSec)
        for i, c in enumerate(clips, 1):
            if c.range.duration > (ctx.settings.max_beat_sec * 2 if ctx.settings else 12):
                out.append(ReviewIssue(category="story", scene=i, agent="timeline", priority="low",
                                       action=f"Long static shot ({c.range.duration:.0f}s) may lose viewers — cut or add motion."))
        return out[:5]

    # ------------------------------------------------------------------ #
    # 18.19 debate between critics
    # ------------------------------------------------------------------ #
    async def debate(self, topic: str, opinions: dict[str, str]) -> str:
        """Resolve conflicting critic opinions into one decision."""
        if self.llm.available:
            try:
                joined = "\n".join(f"{k} critic: {v}" for k, v in opinions.items())
                return (await self.llm.chat(
                    "You are a debate moderator for video critics. Weigh the opinions and give ONE clear decision.",
                    f"Topic: {topic}\n{joined}\n\nDecision:", effort="fast", max_tokens=120)).strip()
            except Exception:
                pass
        # deterministic: narrative relevance outweighs pure visual quality (18.19)
        if "story" in opinions and "doesn't match" in opinions["story"].lower():
            return "Replace the clip — narrative relevance outweighs visual quality here."
        return "Keep the current clip."

    # ------------------------------------------------------------------ #
    # 18.20 self-improvement memory
    # ------------------------------------------------------------------ #
    def _self_improve(self, report: ReviewReport, ctx: ProjectContext) -> None:
        try:
            for cat, sc in report.category_scores.items():
                if sc < 70:
                    self.ctx.memory.remember_experience(
                        f"Recurring weakness: {cat} scored {sc} on a "
                        f"{ctx.timeline.durationSec:.0f}s video.", rating=sc / 100)
        except Exception:
            pass

    # ------------------------------------------------------------------ #
    def _context(self, timeline: Timeline) -> ProjectContext:
        wm = self.ctx.memory.working
        research = None
        raw = wm.get("research")
        if isinstance(raw, dict):
            try:
                research = KnowledgePackage.model_validate(raw)
            except Exception:
                research = None
        scenes = []
        for s in (wm.get("scene_plan", {}) or {}).get("scenes", []):
            try:
                scenes.append(Scene.model_validate(s))
            except Exception:
                pass
        return ProjectContext(
            timeline=timeline, scenes=scenes, research=research,
            audio_plan=wm.get("audio_plan", {}) or {},
            render_package=wm.get("render_package", {}) or {},
            settings=self.ctx.settings,
        )
