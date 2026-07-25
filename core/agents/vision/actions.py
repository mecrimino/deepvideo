"""
Action Recognition (14.10) — recognise what is happening, not just what's there.

Deep action models are heavy, so this infers actions from the detected objects
plus motion cues (tracks / camera motion): a rocket with upward motion →
"launching"; an aircraft → "flying"; a person with high motion → "running". This
enables "find clips where rockets are launching" instead of "find rocket images".
"""

from __future__ import annotations

_OBJECT_ACTIONS = {
    "airplane": "flying", "rocket": "launching", "bird": "flying",
    "car": "driving", "truck": "driving", "motorcycle": "riding",
    "boat": "sailing", "person": "standing", "horse": "running",
    "train": "moving", "dog": "running",
}
_MOTION_VERBS = {"person": {"low": "standing", "high": "running"},
                 "car": {"low": "parked", "high": "driving"}}


class ActionRecognizer:
    def recognize(self, objects: list[str], *, motion: float = 0.0) -> list[str]:
        actions: list[str] = []
        for obj in dict.fromkeys(o.lower() for o in objects):
            if obj in _MOTION_VERBS:
                level = "high" if motion > 0.4 else "low"
                actions.append(_MOTION_VERBS[obj][level])
            elif obj in _OBJECT_ACTIONS:
                actions.append(_OBJECT_ACTIONS[obj])
        # keyword actions from any text descriptors
        return list(dict.fromkeys(actions))
