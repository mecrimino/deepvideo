"""
Vision metadata models (14.20) + Metadata Builder + Multimodal Scene Graph (14.23).

The :class:`VisionMetadata` package is the foundation for semantic search — every
image/shot becomes rich, structured, queryable data. The scene graph links
objects, people, actions, location, emotion and camera motion to one scene
embedding so the studio can answer complex queries ("nighttime drone shots of
rockets launching").
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class DetectedObject(BaseModel):
    label: str
    confidence: float = 0.0
    bbox: list[int] = Field(default_factory=list)  # [x1,y1,x2,y2]


class VisionMetadata(BaseModel):
    asset: str = ""
    kind: str = "image"                 # image | video
    scene: str = ""                     # 14.9 scene classification
    objects: list[str] = Field(default_factory=list)
    detections: list[DetectedObject] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)     # 14.10
    faces: int = 0                                        # 14.11
    face_clusters: int = 0
    text: list[str] = Field(default_factory=list)        # 14.8 OCR
    camera: str = ""                                     # 14.13 shot framing
    camera_motion: str = ""                              # (video)
    composition: int = 0                                 # 14.14 score /100
    colors: list[str] = Field(default_factory=list)      # 14.15 dominant colours
    lighting: str = ""                                   # 14.16
    emotion: str = "neutral"                             # 14.12
    caption: str = ""                                    # 14.18
    embedding_ref: str = ""                              # 14.19 vector id
    embedding_dim: int = 0
    durationSec: float = 0.0
    status: str = "success"


class SceneGraph(BaseModel):
    """14.23 — relationships around a scene, tied to one embedding."""

    scene: str = ""
    objects: list[str] = Field(default_factory=list)
    people: int = 0
    actions: list[str] = Field(default_factory=list)
    location: str = ""
    emotion: str = "neutral"
    camera_motion: str = ""
    embedding_ref: str = ""


class MetadataBuilder:
    def build(self, **parts) -> VisionMetadata:
        return VisionMetadata(**{k: v for k, v in parts.items() if v is not None})

    def scene_graph(self, meta: VisionMetadata) -> SceneGraph:
        return SceneGraph(
            scene=meta.scene, objects=meta.objects, people=meta.face_clusters or meta.faces,
            actions=meta.actions, location=meta.scene, emotion=meta.emotion,
            camera_motion=meta.camera_motion or meta.camera, embedding_ref=meta.embedding_ref,
        )
