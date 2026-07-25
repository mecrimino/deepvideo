"""
Theme Manager (16.16) — consistent style across the whole project.

Each theme fixes fonts, colours, animation speed, shadows, borders and icon
style, so every graphic in a video feels like it belongs to the same production:
Corporate, Minimal, Dark Documentary, Technology, Education, News, Luxury.
"""

from __future__ import annotations

from pydantic import BaseModel


class Theme(BaseModel):
    name: str
    font: str = "C:/Windows/Fonts/arialbd.ttf"
    font_regular: str = "C:/Windows/Fonts/arial.ttf"
    accent: tuple[int, int, int] = (255, 122, 26)
    bg: tuple[int, int, int] = (16, 24, 38)
    text: tuple[int, int, int] = (245, 245, 245)
    speed: float = 0.6          # base animation duration (s)
    shadow: bool = True
    radius: int = 12            # corner radius for panels


_THEMES: dict[str, Theme] = {
    "dark_documentary": Theme(name="dark_documentary", accent=(255, 122, 26), bg=(12, 16, 24)),
    "corporate": Theme(name="corporate", accent=(47, 111, 237), bg=(14, 20, 32), speed=0.5),
    "minimal": Theme(name="minimal", accent=(30, 30, 30), bg=(250, 250, 250), text=(20, 20, 20), shadow=False, speed=0.7),
    "technology": Theme(name="technology", accent=(0, 220, 200), bg=(8, 12, 20)),
    "education": Theme(name="education", accent=(22, 163, 74), bg=(15, 26, 20), speed=0.7),
    "news": Theme(name="news", accent=(224, 36, 36), bg=(10, 10, 10), speed=0.4),
    "luxury": Theme(name="luxury", accent=(198, 168, 90), bg=(10, 10, 12), speed=0.8),
}


class ThemeManager:
    def get(self, name: str) -> Theme:
        return _THEMES.get((name or "").lower(), _THEMES["dark_documentary"])

    def names(self) -> list[str]:
        return list(_THEMES)
