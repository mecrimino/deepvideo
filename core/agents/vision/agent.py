"""
Vision Understanding Agent (Ch14) — the eyes of the AI.

Understands images and videos the way an editor does (14.1): it extracts frames
intelligently (14.5), detects & tracks objects (14.6/14.7), reads on-screen text
(14.8), classifies the scene (14.9) and actions (14.10), detects & clusters faces
(14.11), estimates emotion (14.12), reads camera framing (14.13) and composition
(14.14), analyses colour (14.15) and lighting (14.16), reasons temporally (14.17),
writes a caption (14.18), generates an embedding (14.19) and assembles the
metadata package + scene graph (14.20/14.23).

Built from scratch per Ch14 (folder layout 14.21) with tools.md tech: OpenCV ·
PaddleOCR · optional YOLO · embedder + ChromaDB · LLM captioning · Ch7 graph.
"""

from __future__ import annotations

from pathlib import Path

from core.agents.base import AgentContext, BaseAgent
from core.agents.vision.actions import ActionRecognizer
from core.agents.vision.captions import SceneCaptioner
from core.agents.vision.composition import CompositionAnalyzer
from core.agents.vision.embeddings import EmbeddingGenerator
from core.agents.vision.faces import FaceAnalyzer
from core.agents.vision.frames import FrameExtractor
from core.agents.vision.lighting import ColorLightingAnalyzer
from core.agents.vision.metadata import MetadataBuilder, VisionMetadata
from core.agents.vision.objects import ObjectDetector
from core.agents.vision.ocr import OCREngine
from core.agents.vision.tracking import ObjectTracker
from core.utils.logging import get_logger

log = get_logger("vision")

# 14.9 scene classification cues (object → environment)
_SCENE_HINTS = {
    "airport": {"airplane", "runway", "jet"}, "space": {"rocket", "sky", "spacecraft"},
    "ocean": {"boat", "water", "surfboard"}, "city": {"car", "building", "traffic light", "bus"},
    "office": {"laptop", "keyboard", "desk", "chair", "tv"}, "nature": {"tree", "mountain", "bird"},
    "sports": {"ball", "sports ball", "person"},
}


class VisionAgent(BaseAgent[str, VisionMetadata]):
    name = "vision"

    def __init__(self, ctx: AgentContext) -> None:
        super().__init__(ctx)
        self.frames = FrameExtractor()
        self.objects = ObjectDetector()
        self.tracker = ObjectTracker()
        self.ocr = OCREngine()
        self.faces = FaceAnalyzer()
        self.actions = ActionRecognizer()
        self.composition = CompositionAnalyzer()
        self.colorlight = ColorLightingAnalyzer()
        self.captioner = SceneCaptioner(self.llm)
        self.embeddings = EmbeddingGenerator(ctx.memory)
        self.builder = MetadataBuilder()

    async def run(self, asset: str) -> VisionMetadata:
        return await self.analyze(asset)

    async def analyze(self, asset: str, *, ocr: bool = True) -> VisionMetadata:
        frames = self.frames.extract(asset)
        if not frames:
            return VisionMetadata(asset=str(asset), status="unreadable")
        is_image = self.frames.is_image(asset)
        rep_ts, rep_frame = frames[len(frames) // 2]  # representative frame

        # objects (per frame) + tracking (14.6/14.7)
        per_frame = [self.objects.detect(f) for _ts, f in frames] if self.objects.available else []
        tracks = self.tracker.track(per_frame) if per_frame else []
        objects = sorted({t["label"] for t in tracks}) or sorted({d.label for dets in per_frame for d in dets})
        detections = per_frame[len(per_frame) // 2] if per_frame else []

        # faces across frames + cluster (14.11)
        sigs, total_faces = [], 0
        for _ts, f in frames:
            for box in self.faces.detect(f):
                total_faces += 1
                sig = self.faces.signature(f, box)
                if sig:
                    sigs.append(sig)
        clusters = self.faces.cluster(sigs)

        # single-frame analyses on the representative frame
        composition = self.composition.score(rep_frame)                       # 14.14
        camera = self.composition.camera_shot(rep_frame, self.faces.detect(rep_frame), detections)  # 14.13
        colors = self.colorlight.colors(rep_frame)                            # 14.15
        lighting = self.colorlight.lighting(rep_frame)                        # 14.16
        text = self.ocr.read(rep_frame) if ocr else []                        # 14.8

        motion = self._motion(frames)
        actions = self.actions.recognize(objects, motion=motion)              # 14.10
        scene = self._classify_scene(objects, lighting)                       # 14.9
        emotion = self._emotion(actions, lighting, colors)                    # 14.12
        temporal = self._temporal(per_frame) if not is_image else ""          # 14.17

        caption = await self.captioner.caption(objects=objects, actions=actions, scene=scene,
                                               lighting=lighting, camera=camera, emotion=emotion, text=text)
        emb_ref, dim = self.embeddings.generate(asset=str(asset), caption=caption, objects=objects, scene=scene)

        meta = self.builder.build(
            asset=str(asset), kind="image" if is_image else "video", scene=scene,
            objects=objects, detections=detections, actions=actions,
            faces=total_faces, face_clusters=clusters, text=text, camera=camera,
            camera_motion=temporal, composition=composition, colors=colors,
            lighting=lighting, emotion=emotion, caption=caption,
            embedding_ref=emb_ref, embedding_dim=dim,
            durationSec=(frames[-1][0] if not is_image else 0.0),
        )
        self._store_graph(meta)                                               # 14.23
        self.ctx.emit("vision.analyzed", asset=str(asset), scene=scene, objects=len(objects))
        return meta

    # ------------------------------------------------------------------ #
    def _motion(self, frames) -> float:
        if len(frames) < 2:
            return 0.0
        try:
            import cv2
            import numpy as np

            diffs = []
            for (_t1, a), (_t2, b) in zip(frames, frames[1:]):
                ga = cv2.cvtColor(cv2.resize(a, (120, 68)), cv2.COLOR_BGR2GRAY)
                gb = cv2.cvtColor(cv2.resize(b, (120, 68)), cv2.COLOR_BGR2GRAY)
                diffs.append(float(np.abs(ga.astype("int") - gb.astype("int")).mean()))
            return min(1.0, (sum(diffs) / len(diffs)) / 20.0)
        except Exception:
            return 0.0

    def _classify_scene(self, objects: list[str], lighting: str) -> str:
        objset = {o.lower() for o in objects}
        best, best_hits = "", 0
        for scene, hints in _SCENE_HINTS.items():
            hits = len(objset & hints)
            if hits > best_hits:
                best, best_hits = scene, hits
        if best:
            return best
        return "night_scene" if lighting == "night" else "general"

    def _emotion(self, actions: list[str], lighting: str, colors: list[str]) -> str:
        if any(a in ("launching", "flying", "running") for a in actions):
            return "excitement"
        if lighting in ("golden_hour", "sunset"):   # warm light reads as wonder
            return "wonder"
        if lighting == "night":
            return "tension"
        if "black" in colors[:1]:                    # a very dark frame
            return "tension"
        return "neutral"

    def _temporal(self, per_frame) -> str:
        """14.17 — did the scene meaningfully change across frames?"""
        if len(per_frame) < 2:
            return ""
        sets = [frozenset(d.label for d in dets) for dets in per_frame]
        changes = sum(1 for a, b in zip(sets, sets[1:]) if a != b)
        return "sequence" if changes > len(sets) // 3 else "steady"

    def _store_graph(self, meta: VisionMetadata) -> None:
        if self.ctx.memory is None:
            return
        try:
            for obj in meta.objects:
                self.ctx.memory.graph.add(meta.scene or "scene", "contains", obj, scope="vision")
            for act in meta.actions:
                self.ctx.memory.graph.add(meta.scene or "scene", "action", act, scope="vision")
        except Exception:
            pass
