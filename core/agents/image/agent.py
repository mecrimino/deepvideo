"""
Image Search & Asset Retrieval Agent (Ch12) — the AI picture editor.

Implements the 12.4 architecture:

    query generation → multi-provider search → cache/asset-memory lookup →
    candidate pool → vision scoring (semantic+technical) → aesthetic scoring →
    duplicate removal → license validation → ranking → best asset

with asset-memory reuse (12.15) and an AI-generation fallback when nothing
suitable is found (12.16). Built from scratch per Ch12 (folder layout 12.18) with
tools.md tech: Pexels/Pixabay · OpenCV · Pillow · embedder · Ch7 asset memory.

Keeps the pipeline-facing interface (``available`` / ``search`` / ``materialize``).
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Optional

from core.agents.base import AgentContext, BaseAgent
from core.agents.candidates import Candidate
from core.agents.image.aesthetics import AestheticScorer
from core.agents.image.cache import AssetMemoryLookup, SearchCache
from core.agents.image.downloader import ImageDownloader
from core.agents.image.duplicate import DuplicateDetector, dhash
from core.agents.image.license import LicenseValidator
from core.agents.image.models import AssetResult, ImageCandidate, SceneRequest
from core.agents.image.providers import ImageProviders
from core.agents.image.queries import QueryGenerator
from core.agents.image.ranking import RankingEngine
from core.agents.image.scorer import VisionScorer
from core.providers.search.stock import StockResult
from core.providers.storage import rel
from core.schemas.edl import Beat, ClipAsset
from core.utils.ids import new_id
from core.utils.logging import get_logger

log = get_logger("image")

_SHORTLIST = 12  # candidates to download + vision-score (12.7)


class ImageSearchAgent(BaseAgent[Beat, list[Candidate]]):
    name = "image_search"

    def __init__(self, ctx: AgentContext) -> None:
        super().__init__(ctx)
        self.queries = QueryGenerator(self.llm)
        self.providers = ImageProviders()
        self.downloader = ImageDownloader()
        self.scorer = VisionScorer()
        self.aesthetics = AestheticScorer()
        self.duplicate = DuplicateDetector()
        self.license = LicenseValidator()
        self.ranking = RankingEngine()
        self.cache = SearchCache()
        self.asset_memory = AssetMemoryLookup(ctx.memory)
        self._registry: dict[str, ImageCandidate] = {}

    @property
    def available(self) -> bool:
        return self.providers.available

    # ------------------------------------------------------------------ #
    # full flow (12.4 / 12.19 API)
    # ------------------------------------------------------------------ #
    async def search_scene(self, request: SceneRequest) -> AssetResult:
        # 12.15 — reuse an existing asset if we already have a good one
        reused = self.asset_memory.find(request)
        if reused:
            cand = ImageCandidate(asset_id=reused.get("asset_id", new_id("img_")),
                                  provider=reused.get("source", ""), url=reused.get("path", ""),
                                  local_path=reused.get("path", ""), license="reused")
            return AssetResult(scene_id=request.scene_id, selected_asset=cand, status="reused")

        candidates = await self._collect(request)
        if not candidates:
            gen = await self._generate(request)  # 12.16 AI fallback
            if gen is None:
                return AssetResult(scene_id=request.scene_id, status="no_results")
            candidates = [gen]

        # metadata scoring, then keep a shortlist to vision-score (12.7)
        for c in candidates:
            c.semantic_score = self.scorer.semantic(c, request)
            c.technical_score = self.scorer.technical(c)  # metadata-only for now
        self.license.validate(candidates)
        candidates.sort(key=lambda c: c.semantic_score, reverse=True)
        shortlist = candidates[:_SHORTLIST]

        # 12.8/12.10/12.11 — download thumbnails and analyse them
        await asyncio.gather(*(self._vision_analyze(c, request) for c in shortlist))
        shortlist = self.duplicate.dedupe(shortlist)                     # 12.11
        ranked = self.ranking.rank(shortlist, request)                  # 12.14

        for c in ranked:
            self._registry[c.asset_id] = c
        best = ranked[0] if ranked else None
        result = AssetResult(scene_id=request.scene_id, selected_asset=best,
                             alternatives=ranked[1:5], pooled=len(candidates),
                             status="success" if best else "no_results")
        self.ctx.emit("image.selected", scene_id=request.scene_id,
                      score=best.final_score if best else 0, pooled=len(candidates))
        return result

    async def _collect(self, request: SceneRequest, *, expand: bool = True) -> list[ImageCandidate]:
        if not self.providers.available:
            return []
        if expand:
            queries = await self.queries.generate(request)
        else:
            # API-budget mode (pipeline): reuse the beat's LLM-written queries,
            # ≤2 per beat — no extra LLM call, no 8-query fan-out (Ch20 quotas).
            queries = []
            for q in [request.visual_goal, *(getattr(request, "keywords", None) or [])]:
                q = (q or "").strip()
                if q and q.lower() not in (x.lower() for x in queries):
                    queries.append(q)
                if len(queries) >= 2:
                    break
        cache_key = f"{request.visual_goal}|{queries}"
        cached = self.cache.get(cache_key)
        if cached is not None:
            return [ImageCandidate.model_validate(c) for c in cached]
        candidates = await self.providers.search(request, queries)
        self.cache.set(cache_key, [c.model_dump() for c in candidates])
        return candidates

    async def _vision_analyze(self, c: ImageCandidate, request: SceneRequest) -> None:
        thumb = await self.downloader.thumb(c)
        if thumb is not None:
            c.local_path = str(thumb)
            c.phash = dhash(thumb)
            c.technical_score = self.scorer.technical(c, thumb)   # 12.8 OpenCV
            c.aesthetic_score = self.aesthetics.score(c, thumb)   # 12.10
        else:
            c.aesthetic_score = self.aesthetics.score(c)

    async def _generate(self, request: SceneRequest) -> Optional[ImageCandidate]:
        """12.16 — AI image generation fallback (Pollinations / CF worker)."""
        from core.providers.image.generator import get_image_generator

        gen = get_image_generator()
        if not gen.available:
            return None
        prompt = f"{request.visual_goal or ' '.join(request.keywords)}, {request.style}, high detail"
        path = await gen.generate(prompt)
        if path is None:
            return None
        from core.providers.storage import rel

        cand = ImageCandidate(
            asset_id=new_id("img_"), provider="generated", query=prompt,
            url=rel(path), thumb_url=rel(path), local_path=str(path),
            width=1280, height=720, generated=True,
            semantic_score=0.8, technical_score=0.7, aesthetic_score=0.7, license_score=0.8,
        )
        self._registry[cand.asset_id] = cand
        return cand

    # ------------------------------------------------------------------ #
    # pipeline compat: beat → candidates (metadata-level, fast)
    # ------------------------------------------------------------------ #
    async def search(self, beat: Beat, *, per_query: int = 8) -> list[Candidate]:
        if not self.providers.available:
            return []
        request = self._request_from_beat(beat)
        candidates = await self._collect(request, expand=False)
        if not candidates:
            return []
        for c in candidates:
            c.semantic_score = self.scorer.semantic(c, request)
            c.technical_score = self.scorer.technical(c)
            c.aesthetic_score = self.aesthetics.score(c)
        self.license.validate(candidates)
        candidates = self.duplicate.dedupe(candidates)
        ranked = self.ranking.rank(candidates, request)
        out: list[Candidate] = []
        for c in ranked[: self.ctx.settings.retrieve_top_k]:
            self._registry[c.asset_id] = c
            out.append(self._to_pipeline_candidate(c, beat))
        return out

    async def materialize(self, candidate_id: str, beat: Beat) -> Optional[ClipAsset]:
        c = self._registry.get(candidate_id)
        if c is None:
            return None
        if c.generated and c.local_path:                 # already-generated file
            full = Path(c.local_path)
        else:
            full = await self.downloader.full(c)
        if full is None or not Path(full).exists():
            return None
        dur = beat.range.duration or 4.0
        asset = ClipAsset(
            id=new_id("clip_"), path=rel(full), durationSec=dur,
            width=c.width or 1920, height=c.height or 1080, tags=c.tags,
            thumbPath=rel(full), source="stock",
            license="AI-generated" if c.generated else c.license,
        )
        self._remember_asset(c, asset)  # 12.15 asset memory
        return asset

    # ------------------------------------------------------------------ #
    def _request_from_beat(self, beat: Beat) -> SceneRequest:
        q = beat.queries
        return SceneRequest(
            visual_goal=(q.shown if q else beat.text),
            keywords=(q.keywords if q and q.keywords else [beat.text[:40]]),
            style=self.ctx.memory.working.get("style", "cinematic"),
        )

    def _to_pipeline_candidate(self, c: ImageCandidate, beat: Beat) -> Candidate:
        stock = StockResult(id=c.asset_id, source=c.provider, kind="image",
                            thumbUrl=c.thumb_url, mediaUrl=c.url, width=c.width,
                            height=c.height, tags=c.tags)
        return Candidate(id=c.asset_id, stock=stock, query=c.query,
                         semantic=c.semantic_score, quality=c.technical_score,
                         score=c.final_score)

    def _remember_asset(self, c: ImageCandidate, asset: ClipAsset) -> None:
        if self.ctx.memory is None:
            return
        try:
            from core.memory.models import AssetMemory

            self.ctx.memory.assets.remember(AssetMemory(
                asset_id=asset.id, source=c.provider, license=c.license,
                tags=c.tags, quality_score=c.final_score, path=asset.path))
        except Exception:
            pass

    # 12.20 design improvement — feedback learning hook
    def feedback(self, asset_id: str, reviewer_score: float) -> None:
        """Record how a selected image performed so ranking can improve over time."""
        if self.ctx.memory is None:
            return
        try:
            self.ctx.memory.remember_experience(
                f"Image {asset_id} scored {reviewer_score:.2f} in review.", rating=reviewer_score)
        except Exception:
            pass
