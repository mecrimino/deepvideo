"""
License Validation (12.12) — every asset must know its usage rights.

Records commercial-use / attribution status per provider so the Timeline agent
knows how each asset may be used, and produces a license-preference score for
ranking (12.14). Pexels and Pixabay are free for commercial use.
"""

from __future__ import annotations

from core.agents.image.models import ImageCandidate

# provider → (license label, commercial_ok, attribution_required, preference 0..1)
_LICENSES = {
    "pexels": ("Pexels License", True, False, 1.0),
    "pixabay": ("Pixabay License", True, False, 1.0),
    "generated": ("AI-generated", True, False, 0.8),
}


class LicenseValidator:
    def validate(self, candidates: list[ImageCandidate]) -> list[ImageCandidate]:
        for c in candidates:
            label, commercial, attribution, pref = _LICENSES.get(
                c.provider, ("unknown", False, True, 0.3))
            c.license = label
            c.license_score = pref if commercial else 0.2
            c.__dict__.setdefault("_commercial", commercial)  # kept for downstream metadata
        return candidates
