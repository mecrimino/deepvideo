"""
Vision Understanding Agent (Ch14) — the eyes of the AI.

Built from scratch per Ch14 (folder layout 14.21) with tools.md tech: **OpenCV**
(frames, tracking, faces, composition, colour, lighting), **PaddleOCR** (14.8),
optional **YOLO** (14.6), the embedder + **ChromaDB** for scene embeddings
(14.19), **LLM** captioning (14.18) and the Ch7 knowledge graph for the
multimodal scene graph (14.23). Produces the rich metadata package (14.20) every
other agent relies on.
"""

from core.agents.vision.agent import VisionAgent
from core.agents.vision.metadata import DetectedObject, SceneGraph, VisionMetadata

__all__ = ["VisionAgent", "VisionMetadata", "DetectedObject", "SceneGraph"]
