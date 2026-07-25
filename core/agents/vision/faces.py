"""
Face Detection & Clustering (14.11).

Detects faces per frame with an OpenCV Haar cascade and clusters recurring faces
across frames by a compact grayscale-histogram signature (no identity assigned —
just "the same person appears here and here"). Names can be attached later from
external knowledge.
"""

from __future__ import annotations

from core.utils.logging import get_logger

log = get_logger("vision.faces")

_CASCADE = None


def _cascade():
    global _CASCADE
    if _CASCADE is None:
        try:
            import cv2

            _CASCADE = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        except Exception:
            _CASCADE = False
    return _CASCADE or None


class FaceAnalyzer:
    def detect(self, frame) -> list[tuple[int, int, int, int]]:
        cascade = _cascade()
        if cascade is None:
            return []
        try:
            import cv2

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))
            return [tuple(int(v) for v in f) for f in faces]
        except Exception as exc:
            log.debug("face detect failed: %s", exc)
            return []

    def signature(self, frame, box) -> list[float]:
        try:
            import cv2

            x, y, w, h = box
            crop = frame[y : y + h, x : x + w]
            small = cv2.cvtColor(cv2.resize(crop, (32, 32)), cv2.COLOR_BGR2GRAY)
            hist = cv2.calcHist([small], [0], None, [16], [0, 256]).flatten()
            s = float(hist.sum()) or 1.0
            return [float(v) / s for v in hist]
        except Exception:
            return []

    def cluster(self, signatures: list[list[float]], *, threshold: float = 0.35) -> int:
        """Greedy clustering by histogram distance → number of distinct faces."""
        clusters: list[list[float]] = []
        for sig in signatures:
            if not sig:
                continue
            placed = False
            for c in clusters:
                dist = sum(abs(a - b) for a, b in zip(sig, c))
                if dist < threshold:
                    placed = True
                    break
            if not placed:
                clusters.append(sig)
        return len(clusters)
