"""
Video Search & B-Roll Agent (Ch13) — the cinematographer.

Implements the 13.4 architecture: query expansion → multi-provider search → cache
→ candidate videos → shot detection → vision + motion + quality analysis → clip
scoring → duplicate removal → ranking → trimmed timeline clip. Reasons at the
**shot** level (13.7): it splits each video, scores every shot, picks the best,
and trims just the useful segment (13.15).

Built from scratch per Ch13 (folder layout 13.19) with tools.md tech: Pexels/
Pixabay · OpenCV (shots/motion/quality) · FFmpeg (trim) · yt-dlp · optional YOLO ·
embedder · Ch7 asset memory. Keeps the pipeline interface (available/search/
materialize).
"""

from __future__ import annotations

import asyncio
from typing import Optional

from core.agents.base import AgentContext, BaseAgent
from core.agents.candidates import Candidate
from core.agents.video.cache import SearchCache, VideoIndexLookup, fingerprint
from core.agents.video.downloader import VideoDownloader
from core.agents.video.duplicate import DuplicateDetector
from core.agents.video.models import ClipResult, Shot, VideoCandidate, VideoRequest, VideoResult
from core.agents.video.motion import MotionAnalyzer
from core.agents.video.providers import VideoProviders
from core.agents.video.query_generator import QueryGenerator
from core.agents.video.ranking import RankingEngine
from core.agents.video.scorer import ShotScorer
from core.agents.video.shot_detector import ShotDetector
from core.agents.video.trimmer import ClipTrimmer
from core.agents.video.vision import ShotVision
from core.providers.search.stock import StockResult
from core.config import get_settings
from core.providers.storage import rel
from core.schemas.edl import Beat, ClipAsset
from core.tools.ffmpeg import make_thumbnail, probe
from core.utils.ids import new_id
from core.utils.logging import get_logger

log = get_logger("video")

_DOWNLOAD_TOP = 3       # candidates to fully analyse (expensive)
_MAX_SHOTS = 8          # shots to analyse per video


class VideoSearchAgent(BaseAgent[Beat, list[Candidate]]):
    name = "video_search"

    def __init__(self, ctx: AgentContext) -> None:
        super().__init__(ctx)
        self.queries = QueryGenerator(self.llm)
        self.providers = VideoProviders()
        self.downloader = VideoDownloader()
        self.shots = ShotDetector()
        self.vision = ShotVision()
        self.motion = MotionAnalyzer()
        self.scorer = ShotScorer()
        self.trimmer = ClipTrimmer()
        self.duplicate = DuplicateDetector()
        self.ranking = RankingEngine()
        self.cache = SearchCache()
        self.index = VideoIndexLookup(ctx.memory)
        self._registry: dict[str, VideoCandidate] = {}

    @property
    def available(self) -> bool:
        return self.providers.available

    # ------------------------------------------------------------------ #
    # full flow (13.4 / 13.20 API)
    # ------------------------------------------------------------------ #
    async def search_scene(self, request: VideoRequest) -> VideoResult:
        candidates = await self._collect(request)
        if not candidates:
            return VideoResult(scene_id=request.scene_id, status="no_results")  # 13.17

        for c in candidates:                                   # metadata pre-rank
            c.semantic = self.scorer.semantic(Shot(shot_id=0), request, c.tags) or 0.0
        self._set_license(candidates)
        candidates.sort(key=lambda c: c.semantic, reverse=True)

        analysed = await asyncio.gather(*(self._analyse(c, request) for c in candidates[:_DOWNLOAD_TOP]))
        analysed = [c for c in analysed if c and c.best_shot]
        if not analysed:
            return VideoResult(scene_id=request.scene_id, status="no_results", pooled=len(candidates))

        analysed = self.duplicate.dedupe(analysed)             # 13.14
        ranked = self.ranking.rank(analysed, request)          # 13.16
        for c in ranked:
            self._registry[c.video_id] = c

        best = ranked[0]
        clip = await self._make_clip(best, request.duration)
        result = VideoResult(scene_id=request.scene_id, clip=clip,
                             alternatives=[self._clip_of(c) for c in ranked[1:4]],
                             pooled=len(candidates), status="success" if clip else "no_results")
        self.ctx.emit("video.selected", scene_id=request.scene_id,
                      score=best.final_score, pooled=len(candidates))
        return result

    async def _collect(self, request: VideoRequest, *, expand: bool = True) -> list[VideoCandidate]:
        if not self.providers.available:
            return []
        if expand:
            queries = await self.queries.generate(request)
        else:
            # API-budget mode (pipeline): the beat ALREADY carries LLM-written
            # queries from the scene stage — reuse them. ≤2 queries per beat
            # instead of an extra LLM call + 8 expanded queries (Ch20 quotas).
            queries = []
            for q in [request.visual_goal, *(request.keywords or [])]:
                q = (q or "").strip()
                if q and q.lower() not in (x.lower() for x in queries):
                    queries.append(q)
                if len(queries) >= 2:
                    break
        cache_key = f"{request.visual_goal}|{queries}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            return [VideoCandidate.model_validate(c) for c in cached]
        cands = await self.providers.search(request, queries)
        self.cache.set(cache_key, [c.model_dump() for c in cands])
        return cands

    async def _analyse(self, c: VideoCandidate, request: VideoRequest) -> Optional[VideoCandidate]:
        path = await self.downloader.download(c)
        if path is None:
            return None
        shots = self.shots.detect(path)[:_MAX_SHOTS]
        for shot in shots:
            shot.video_id = c.video_id
            shot.camera, shot.motion_score = self.motion.analyze(path, shot)
            self.vision.analyze(shot)
            self.scorer.quality(shot)
            self.scorer.semantic(shot, request, c.tags)
        c.shots = shots
        c.best_shot = max(shots, key=lambda s: s.semantic * 0.6 + s.quality * 0.4, default=None)
        return c

    async def _make_clip(self, c: VideoCandidate, target: float) -> Optional[ClipResult]:
        if not c.best_shot or not c.local_path:
            return None
        start, end = self.trimmer.window(c.best_shot, target)
        trimmed = await self.trimmer.trim(c.local_path, start, end)
        self._remember(c)
        return ClipResult(
            video_id=c.video_id, provider=c.provider, url=c.url,
            local_path=rel(trimmed) if trimmed else c.local_path,
            start=0.0 if trimmed else start, end=(end - start) if trimmed else end,
            camera=c.best_shot.camera, quality=c.best_shot.quality,
            final_score=c.final_score, width=c.width, height=c.height,
        )

    def _clip_of(self, c: VideoCandidate) -> ClipResult:
        s = c.best_shot
        return ClipResult(video_id=c.video_id, provider=c.provider, url=c.url,
                          start=s.start if s else 0, end=s.end if s else 0,
                          camera=s.camera if s else "static", quality=s.quality if s else 0,
                          final_score=c.final_score)

    # ------------------------------------------------------------------ #
    # pipeline compat
    # ------------------------------------------------------------------ #
    async def search(self, beat: Beat, *, per_query: int = 6) -> list[Candidate]:
        if not self.providers.available:
            return []
        request = self._request_from_beat(beat)
        candidates = await self._collect(request, expand=False)
        if not candidates:
            return []
        for c in candidates:
            c.semantic = self.scorer.semantic(Shot(shot_id=0), request, c.tags) or 0.0
        self._set_license(candidates)
        # metadata-level ranking (no downloads); materialize does shot analysis
        ranked = self.ranking.rank(candidates, request)
        out: list[Candidate] = []
        for c in ranked[: self.ctx.settings.retrieve_top_k]:
            self._registry[c.video_id] = c
            out.append(self._to_pipeline_candidate(c))
        return out

    async def materialize(self, candidate_id: str, beat: Beat) -> Optional[ClipAsset]:
        c = self._registry.get(candidate_id)
        if c is None:
            return None
        request = self._request_from_beat(beat)
        analysed = await self._analyse(c, request)
        beat_dur = beat.range.duration or 6.0
        if analysed is None or not analysed.best_shot:
            # fall back to a plain middle-trim of the whole video
            path = c.local_path or (await self.downloader.download(c) or "")
            if not path:
                return None
            info = await probe(path)
            shot = Shot(shot_id=1, start=0.0, end=info.durationSec or beat_dur)
            analysed = c
            analysed.best_shot = shot
        clip = await self._make_clip(analysed, beat_dur)
        if clip is None:
            return None
        video_path = clip.local_path if clip.local_path else c.local_path
        info = await probe(video_path)
        clip_id = new_id("clip_")
        # Poster frame so the editor timeline shows a real thumbnail, not a
        # blank block. Grab it mid-clip; failure just leaves thumbPath unset.
        thumb: Optional[str] = None
        try:
            dest = get_settings().paths.cache / "thumbnails" / f"{clip_id}.jpg"
            tp = await make_thumbnail(video_path, dest, at_sec=(info.durationSec or beat_dur) / 2)
            if tp is not None:
                thumb = rel(tp)
        except Exception as exc:
            log.debug("thumbnail failed for %s: %s", clip_id, exc)
        return ClipAsset(
            id=clip_id, path=clip.local_path or rel(c.local_path),
            durationSec=info.durationSec or beat_dur, width=info.width or c.width,
            height=info.height or c.height, fps=info.fps, tags=c.tags,
            thumbPath=thumb, source="stock", license=c.license,
        )

    # ------------------------------------------------------------------ #
    def _request_from_beat(self, beat: Beat) -> VideoRequest:
        q = beat.queries
        return VideoRequest(
            visual_goal=(q.shown if q else beat.text),
            keywords=(q.keywords if q and q.keywords else [beat.text[:40]]),
            style=self.ctx.memory.working.get("style", "cinematic"),
            duration=beat.range.duration or 6.0,
        )

    def _set_license(self, candidates: list[VideoCandidate]) -> None:
        for c in candidates:
            c.license = {"pexels": "Pexels License", "pixabay": "Pixabay License"}.get(c.provider, "unknown")
            c.license_score = 1.0 if c.provider in ("pexels", "pixabay") else 0.3

    def _to_pipeline_candidate(self, c: VideoCandidate) -> Candidate:
        stock = StockResult(id=c.video_id, source=c.provider, kind="video",
                            thumbUrl=c.thumb_url, mediaUrl=c.url, width=c.width,
                            height=c.height, durationSec=c.durationSec, tags=c.tags)
        return Candidate(id=c.video_id, stock=stock, query=c.query,
                         semantic=c.semantic, quality=0.5, motion=0.5, score=c.final_score)

    def _remember(self, c: VideoCandidate) -> None:
        if self.ctx.memory is None:
            return
        try:
            from core.memory.models import AssetMemory

            self.ctx.memory.assets.remember(AssetMemory(
                asset_id=f"vid_{fingerprint(c.url)}", source=c.provider, license=c.license,
                tags=c.tags, quality_score=c.final_score, path=c.local_path))
        except Exception:
            pass
