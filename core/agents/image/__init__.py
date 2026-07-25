"""
Image Search & Asset Retrieval Agent (Ch12) — the AI picture editor.

Built from scratch per Ch12 (folder layout 12.18) with tools.md tech: **Pexels +
Pixabay** multi-provider search (12.6), **OpenCV** vision quality (12.8), the
embedder for semantic match (12.9), **Pillow** perceptual-hash de-dup (12.11),
license validation (12.12), weighted ranking (12.14), **Ch7 asset memory** reuse
(12.15) and an AI-generation fallback (12.16). Chooses images deliberately, like
a professional picture editor — not the first result.
"""

from core.agents.image.agent import ImageSearchAgent
from core.agents.image.models import AssetResult, ImageCandidate, SceneRequest

__all__ = ["ImageSearchAgent", "SceneRequest", "ImageCandidate", "AssetResult"]
