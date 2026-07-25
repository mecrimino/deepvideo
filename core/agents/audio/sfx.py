"""
Sound Effect Placement (17.11).

The Scene Planner may specify events ({"event":"rocket_ignition","time":42.3}).
The SFX Engine resolves each event to a sound from the local sfx library and
places it at the event time, so effects sync to on-screen action.
"""

from __future__ import annotations

from core.agents.audio.models import SFXCue
from core.config import get_settings
from core.providers.storage import rel
from core.utils.logging import get_logger

log = get_logger("audio.sfx")

# common event → search keyword
_EVENTS = {
    "rocket_ignition": "whoosh", "explosion": "explosion", "launch": "rocket",
    "transition": "whoosh", "impact": "impact", "typing": "keyboard",
    "camera": "shutter", "footsteps": "footsteps",
}


class SFXEngine:
    def __init__(self) -> None:
        self.library = get_settings().paths.assets / "sfx"

    def place(self, events: list[dict]) -> list[SFXCue]:
        cues: list[SFXCue] = []
        for ev in events:
            name = str(ev.get("event", "")).lower()
            at = float(ev.get("time", ev.get("atSec", 0)) or 0)
            cues.append(SFXCue(event=name, atSec=round(at, 3), path=self._find(name)))
        return cues

    def _find(self, event: str) -> str:
        if not self.library.exists():
            return ""
        keyword = _EVENTS.get(event, event)
        for p in self.library.glob("*"):
            if keyword in p.stem.lower() and p.suffix.lower() in (".wav", ".mp3", ".ogg"):
                return rel(p)
        return ""
