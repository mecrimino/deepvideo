"""
Composition Analysis (14.14) + Camera Shot Detection (14.13).

Composition scores visual quality from rule-of-thirds energy, symmetry and
leading lines (Hough) using OpenCV. Camera-shot framing (wide / medium / close-up
/ extreme close-up) is inferred from how much of the frame the main subject
(largest face/object) fills.
"""

from __future__ import annotations

from core.utils.logging import get_logger

log = get_logger("vision.composition")


class CompositionAnalyzer:
    def score(self, frame) -> int:
        try:
            import cv2
            import numpy as np

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            h, w = gray.shape
            edges = cv2.Canny(gray, 80, 200)

            # rule of thirds: edge energy near the third-lines is good
            thirds_x = [w // 3, 2 * w // 3]
            thirds_y = [h // 3, 2 * h // 3]
            band = max(2, w // 40)
            energy = 0.0
            for x in thirds_x:
                energy += edges[:, max(0, x - band): x + band].mean()
            for y in thirds_y:
                energy += edges[max(0, y - band): y + band, :].mean()
            thirds_score = min(1.0, energy / 160.0)

            # symmetry: left/right mirror similarity
            left = gray[:, : w // 2].astype("float")
            right = np.fliplr(gray[:, w - w // 2:]).astype("float")
            m = min(left.shape[1], right.shape[1])
            sym = 1.0 - min(1.0, np.abs(left[:, :m] - right[:, :m]).mean() / 90.0)

            # leading lines: presence of strong straight lines
            lines = cv2.HoughLinesP(edges, 1, 3.14159 / 180, 80, minLineLength=w // 4, maxLineGap=20)
            lead = min(1.0, (len(lines) if lines is not None else 0) / 12.0)

            score = 0.45 * thirds_score + 0.30 * sym + 0.25 * lead
            return int(round(40 + score * 60))  # map to a 40–100 quality range
        except Exception as exc:
            log.debug("composition failed: %s", exc)
            return 60

    def camera_shot(self, frame, faces: list, detections: list) -> str:
        try:
            h, w = frame.shape[:2]
            area = float(h * w) or 1.0
            biggest = 0.0
            for (x, y, fw, fh) in faces:
                biggest = max(biggest, (fw * fh) / area)
            for d in detections:
                if len(d.bbox) == 4:
                    bw, bh = d.bbox[2] - d.bbox[0], d.bbox[3] - d.bbox[1]
                    biggest = max(biggest, (bw * bh) / area)
            if biggest == 0:
                return "wide"
            if biggest > 0.55:
                return "extreme_close_up"
            if biggest > 0.30:
                return "close_up"
            if biggest > 0.12:
                return "medium"
            return "wide"
        except Exception:
            return "wide"
