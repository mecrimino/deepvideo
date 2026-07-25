"""
Timeline Agent (Ch15) — the master editor.

Assembles all approved assets into a single professional, editable timeline
(15.1): builds tracks, places & trims clips, syncs narration, adds subtitles,
music (with ducking) and sfx, plans transitions, optimizes timing, and serializes
the project — including an OpenTimelineIO export for professional editors (15.18).

Built from scratch per Ch15 (folder layout 15.19) with tools.md tech: Pydantic
(shared Timeline), OpenTimelineIO (export), Loguru. The 15.3 module chain runs in
order (deterministic assembly — no LLM), so ``build`` stays synchronous for the
pipeline.
"""

from __future__ import annotations

from typing import Optional

from core.agents.base import AgentContext, BaseAgent
from core.agents.timeline.effects import EffectsManager
from core.agents.timeline.models import (
    HClip,
    HProject,
    HScene,
    HSequence,
    TimelineBuildInput,
    TimelineResult,
)
from core.agents.timeline.music import MusicManager
from core.agents.timeline.optimizer import TimelineOptimizer
from core.agents.timeline.scheduler import ClipScheduler
from core.agents.timeline.serializer import ProjectSerializer
from core.agents.timeline.subtitles import SubtitlePlacer
from core.agents.timeline.sync import AudioSync
from core.agents.timeline.tracks import TrackBuilder
from core.agents.timeline.transitions import TransitionManager
from core.schemas.edl import Beat, CaptionCue, ClipAsset, Timeline, TimeRange
from core.schemas.pipeline import PickDecision, RetrievePick
from core.schemas.production import Scene
from core.utils.ids import new_id


class TimelineAgent(BaseAgent[TimelineBuildInput, TimelineResult]):
    name = "timeline"

    def __init__(self, ctx: AgentContext) -> None:
        super().__init__(ctx)
        self.tracks = TrackBuilder()
        self.scheduler = ClipScheduler()
        self.audio = AudioSync()
        self.transitions = TransitionManager()
        self.subtitles = SubtitlePlacer()
        self.music = MusicManager()
        self.effects = EffectsManager()
        self.optimizer = TimelineOptimizer()
        self.serializer = ProjectSerializer()

    async def run(self, inp: TimelineBuildInput) -> TimelineResult:
        return self.assemble(inp)

    # ------------------------------------------------------------------ #
    # 15.3 assembly chain (deterministic, synchronous)
    # ------------------------------------------------------------------ #
    def assemble(self, inp: TimelineBuildInput) -> TimelineResult:
        tracks = self.tracks.build()                                   # Track Builder
        self.scheduler.schedule(inp, tracks)                           # Clip Scheduler + trim
        duration = self._duration(inp)
        self.audio.sync(tracks, audio_path=inp.audio_path, duration=duration)  # Audio Sync
        captions = self.subtitles.place(inp.captions)                  # Subtitle Placer
        duck = self.music.place(tracks, music_path=inp.music_path, duration=duration, captions=captions)
        self.effects.place(tracks, inp.sfx)                            # SFX

        # Transition Manager (sidecar plan)
        scene_by_beat = {str(s.scene_id): s for s in inp.scenes}
        video_clips = [c for k in ("V1", "V2", "V3") for c in tracks[k].clips]
        transitions = self.transitions.plan(video_clips, scene_by_beat)

        timeline = Timeline(
            id=new_id("tl_"), fps=inp.fps, width=inp.width, height=inp.height,
            durationSec=round(duration, 3), audioPath=inp.audio_path,
            tracks=list(tracks.values()), captions=captions,
        )
        issues = self.optimizer.optimize(timeline, set(inp.assets))    # Optimizer

        hierarchy = self._hierarchy(inp)                               # 15.21
        # persist the sidecar plans for the renderer/exporter
        wm = self.ctx.memory.working
        wm.set("transitions", transitions)
        wm.set("duck_regions", [d.model_dump() for d in duck])
        self.ctx.emit("timeline.updated", clips=sum(len(t.clips) for t in timeline.tracks),
                      duration=timeline.durationSec, issues=len(issues))
        return TimelineResult(timeline=timeline, hierarchical=hierarchy,
                              duration=timeline.durationSec, duck_regions=duck)

    # ------------------------------------------------------------------ #
    # pipeline compat: beats + picks + assets → Timeline
    # ------------------------------------------------------------------ #
    def build(
        self,
        beats: list[Beat],
        picks: list[PickDecision],
        assets: dict[str, dict],
        *,
        audio_path: Optional[str] = None,
        fps: float = 30,
        width: int = 1920,
        height: int = 1080,
    ) -> Timeline:
        pick_by_beat = {p.beatId: p for p in picks}
        scenes: list[Scene] = []
        assets_by_scene: dict[int, str] = {}
        asset_map: dict[str, ClipAsset] = {}
        captions: list[CaptionCue] = []

        for i, beat in enumerate(beats, start=1):
            scenes.append(Scene(
                scene_id=i, narration=beat.text,
                visual_goal=(beat.queries.shown if beat.queries else beat.text),
                range_start=beat.range.startSec, range_end=beat.range.endSec))
            captions.append(CaptionCue(id=new_id("cap_"), text=beat.text,
                                       range=TimeRange(startSec=beat.range.startSec, endSec=beat.range.endSec)))
            pick = pick_by_beat.get(beat.id)
            if isinstance(pick, RetrievePick):
                raw = assets.get(pick.candidate.clipId)
                if raw:
                    ca = ClipAsset.model_validate(raw) if isinstance(raw, dict) else raw
                    asset_map[ca.id] = ca
                    assets_by_scene[i] = ca.id

        inp = TimelineBuildInput(
            scenes=scenes, assets_by_scene=assets_by_scene, assets=asset_map,
            captions=captions, audio_path=audio_path, fps=fps, width=width, height=height)
        return self.assemble(inp).timeline

    # ------------------------------------------------------------------ #
    def _duration(self, inp: TimelineBuildInput) -> float:
        ends = [s.range_end for s in inp.scenes] + [c.range.endSec for c in inp.captions]
        return round(max(ends, default=0.0), 3)

    def _hierarchy(self, inp: TimelineBuildInput) -> HProject:
        scenes = [
            HScene(scene_id=s.scene_id, title=s.title or s.visual_goal[:30], clips=[
                HClip(kind=(s.media.type if s.media else "video"),
                      ref=inp.assets_by_scene.get(s.scene_id, ""),
                      start=s.range_start, end=s.range_end)])
            for s in inp.scenes
        ]
        return HProject(title=self.ctx.memory.working.get("topic", "Project"),
                        sequences=[HSequence(title="Main", scenes=scenes)])

    def export_otio(self, timeline: Timeline, assets: Optional[dict] = None) -> Optional[str]:
        return self.serializer.export_otio(timeline, assets=assets)
