"""
User Preference Memory (7.9) — the user's habits and defaults.

    voice → ElevenLabs Voice A · subtitle_color → yellow · transition → fade · music → cinematic

Future projects inherit these automatically unless the user overrides them. Keyed
so each preference is a single up-to-date value (setting a key replaces it, not
duplicates it).
"""

from __future__ import annotations

from typing import Optional

from core.memory.models import MemoryKind, MemoryRecord, Preference

_SCOPE = "preferences"


class PreferenceMemory:
    def __init__(self, backend) -> None:
        self.b = backend

    def _record_for(self, key: str) -> Optional[MemoryRecord]:
        for rec in self.b.store.list(kind=MemoryKind.PREFERENCE.value, scope=_SCOPE):
            if rec.metadata.get("key") == key:
                return rec
        return None

    def set(self, key: str, value: str) -> MemoryRecord:
        pref = Preference(key=key, value=value)
        existing = self._record_for(key)
        if existing is not None:                       # replace, don't duplicate
            existing.text = pref.to_text()
            existing.metadata = {"key": key, "value": value}
            return self.b.save_record(existing)
        return self.b.save(pref.to_text(), kind=MemoryKind.PREFERENCE, scope=_SCOPE,
                           metadata={"key": key, "value": value}, rating=0.8)

    def get(self, key: str, default: Optional[str] = None) -> Optional[str]:
        rec = self._record_for(key)
        return rec.metadata.get("value") if rec else default

    def all(self) -> dict[str, str]:
        return {
            rec.metadata["key"]: rec.metadata.get("value", "")
            for rec in self.b.store.list(kind=MemoryKind.PREFERENCE.value, scope=_SCOPE)
            if rec.metadata.get("key")
        }
