"""
Image Search data models (12.3/12.17).

The request is already structured (from the Scene Planner); the candidate carries
the full scored metadata (12.17) so ranking and downstream processing are trivial.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class SceneRequest(BaseModel):
    """12.3 — structured visual requirement from the Scene Planner."""

    scene_id: int = 0
    visual_goal: str = ""
    keywords: list[str] = Field(default_factory=list)
    style: str = "cinematic"
    minimum_resolution: str = "1920x1080"
    orientation: str = "landscape"  # landscape | portrait | square

    @property
    def min_wh(self) -> tuple[int, int]:
        try:
            w, h = self.minimum_resolution.lower().split("x")
            return int(w), int(h)
        except Exception:
            return 1920, 1080


class ImageCandidate(BaseModel):
    """12.17 — a scored candidate image."""

    asset_id: str
    provider: str = ""
    query: str = ""
    url: str = ""
    thumb_url: str = ""
    keywords: list[str] = Field(default_factory=list)
    width: int = 0
    height: int = 0
    tags: list[str] = Field(default_factory=list)
    license: str = "unknown"
    # scores (0..1)
    semantic_score: float = 0.0
    technical_score: float = 0.0
    aesthetic_score: float = 0.0
    license_score: float = 0.0
    style_score: float = 0.0
    final_score: float = 0.0
    # provenance
    phash: str = ""
    local_path: str = ""
    generated: bool = False

    @property
    def orientation(self) -> str:
        if not self.height:
            return "unknown"
        r = self.width / self.height
        return "landscape" if r >= 1.2 else "portrait" if r < 0.9 else "square"


class AssetResult(BaseModel):
    """12.19 — the agent's response."""

    scene_id: int = 0
    selected_asset: Optional[ImageCandidate] = None
    alternatives: list[ImageCandidate] = Field(default_factory=list)
    status: str = "success"
    pooled: int = 0
