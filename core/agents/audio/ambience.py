"""
Ambient Audio (17.12) — subtle background ambience makes scenes feel real.

Maps a scene's location/scene-type to an ambience bed (forest→birds, city→
traffic, ocean→waves, space center→crowd). Ambience sits low beneath narration.
"""

from __future__ import annotations

_AMBIENCE = {
    "airport": "aircraft_ambience", "city": "city_traffic", "ocean": "ocean_waves",
    "nature": "forest_birds", "space": "launch_control", "office": "office_room_tone",
    "sports": "stadium_crowd",
}


class AmbienceEngine:
    def select(self, scene_type: str) -> str:
        return _AMBIENCE.get((scene_type or "").lower(), "")
