"""
Central configuration for the Deep Vision core (Ch3 / Ch20).

Built on **pydantic-settings** (tools.md: ".env + Pydantic Settings"). Every
cloud key is optional; with none set the core still boots and heavy AI degrades
to local fallbacks (Ch20). Values load from the environment / repo-root ``.env``.
Key fields accept a comma/space separated list for rotation.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo root is two levels up from this file (core/config.py -> core -> root).
ROOT = Path(__file__).resolve().parents[1]


class Paths:
    """Runtime data directories (gitignored; kept via .gitkeep)."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.cache = root / "cache"
        self.downloads = root / "downloads"
        self.temp = root / "temp"
        self.logs = root / "logs"
        self.projects = root / "projects"
        self.assets = root / "assets"

    def ensure(self) -> None:
        for p in (
            self.cache, self.cache / "api", self.cache / "images", self.cache / "voices",
            self.cache / "videos", self.cache / "thumbnails", self.cache / "embeddings",
            self.cache / "chroma", self.downloads, self.temp, self.temp / "render",
            self.temp / "upload", self.logs, self.projects,
        ):
            p.mkdir(parents=True, exist_ok=True)


def _split_keys(value) -> list[str]:
    """Parse a comma/whitespace separated list of API keys (for rotation)."""
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(v).strip() for v in value if str(v).strip()]
    parts = [p.strip() for chunk in str(value).split(",") for p in chunk.split()]
    return [p for p in parts if p]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- cloud API keys (all optional; rotation-friendly comma/space lists) -
    # Stored raw as strings (so pydantic-settings doesn't JSON-decode them) and
    # exposed as parsed lists via the properties below.
    openrouter_keys_raw: str = Field("", validation_alias=AliasChoices("OPENROUTER_API_KEYS", "OPENROUTER_API_KEY"))
    groq_keys_raw: str = Field("", validation_alias=AliasChoices("GROQ_API_KEYS", "GROQ_API_KEY"))
    openai_keys_raw: str = Field("", validation_alias=AliasChoices("OPENAI_API_KEYS", "OPENAI_API_KEY"))
    pexels_keys_raw: str = Field("", validation_alias=AliasChoices("PEXELS_API_KEYS", "PEXELS_API_KEY"))
    pixabay_keys_raw: str = Field("", validation_alias=AliasChoices("PIXABAY_API_KEYS", "PIXABAY_API_KEY"))
    tavily_keys_raw: str = Field("", validation_alias=AliasChoices("TAVILY_API_KEYS", "TAVILY_API_KEY"))
    nvidia_keys_raw: str = Field("", validation_alias=AliasChoices("NVIDIA_API_KEYS", "NVIDIA_API_KEY"))
    nvidia_model: str = Field("z-ai/glm-5.2", alias="NVIDIA_MODEL")

    # --- model routing (Ch1.7 multi-model) — provider-specific -----------
    openrouter_model: str = Field("tencent/hy3:free", alias="OPENROUTER_MODEL")
    groq_model: str = Field("openai/gpt-oss-120b", alias="GROQ_MODEL")
    llm_model_fast: str = Field("tencent/hy3:free", alias="LLM_MODEL_FAST")
    llm_model_smart: str = Field("openai/gpt-oss-120b", alias="LLM_MODEL_SMART")
    whisper_model: str = Field("base", alias="WHISPER_MODEL")  # local faster-whisper size: tiny|base|small|medium
    embed_dim: int = 384

    # --- text-to-speech (local Kokoro-ONNX, keyless; tools.md) ------------
    tts_base_url: str = Field("http://localhost:8001", alias="TTS_BASE_URL")
    tts_enabled: bool = Field(True, alias="TTS_ENABLED")
    default_voice: str = Field("af_heart", alias="DEFAULT_VOICE")

    # --- AI image generation (cloud, keyless-friendly) --------------------
    cf_image_worker_url: str = Field("", alias="CF_IMAGE_WORKER_URL")
    cf_image_worker_secret: str = Field("", alias="CF_IMAGE_WORKER_SECRET")
    pollinations_image_url: str = Field("https://image.pollinations.ai/prompt/{prompt}",
                                        alias="POLLINATIONS_IMAGE_URL")

    # --- pipeline tunables (mirror shared PipelineSettings) ----------------
    retrieve_top_k: int = 12
    match_threshold: float = 0.35  # calibrated for the hashed embedder fallback
    visual_weight: float = 0.5
    max_beat_sec: float = 6.0
    review_threshold: int = 90  # Ch19.16
    max_retries: int = 3  # Ch19.10
    parallelism: int = 8  # Ch19.16

    # --- networking -------------------------------------------------------
    core_host: str = Field("127.0.0.1", alias="CORE_HOST")
    core_port: int = Field(8000, alias="CORE_PORT")
    request_timeout_sec: float = 60.0

    # --- infrastructure (Ch20.14 config.json; low-end PC) -----------------
    cache_enabled: bool = True             # 20.6 cache everything
    max_parallel_api_calls: int = 3        # 20.14/20.16 cap concurrent cloud calls
    local_rendering: bool = True           # 20.12 render with local FFmpeg

    @property
    def openrouter_keys(self) -> list[str]:
        return _split_keys(self.openrouter_keys_raw)

    @property
    def groq_keys(self) -> list[str]:
        return _split_keys(self.groq_keys_raw)

    @property
    def openai_keys(self) -> list[str]:
        return _split_keys(self.openai_keys_raw)

    @property
    def pexels_keys(self) -> list[str]:
        return _split_keys(self.pexels_keys_raw)

    @property
    def pixabay_keys(self) -> list[str]:
        return _split_keys(self.pixabay_keys_raw)

    @property
    def tavily_keys(self) -> list[str]:
        return _split_keys(self.tavily_keys_raw)

    @property
    def nvidia_keys(self) -> list[str]:
        return _split_keys(self.nvidia_keys_raw)

    @property
    def paths(self) -> Paths:
        return Paths(ROOT)

    @property
    def has_llm(self) -> bool:
        return bool(self.openrouter_keys or self.groq_keys or self.openai_keys)

    @property
    def has_stock(self) -> bool:
        return bool(self.pexels_keys or self.pixabay_keys)

    @property
    def has_transcription(self) -> bool:
        import importlib.util
        return importlib.util.find_spec("faster_whisper") is not None


def _load_config_json() -> dict:
    """Ch20.14 — runtime infra config, separate from code (env still wins)."""
    path = ROOT / "config.json"
    if not path.exists():
        return {}
    try:
        import json

        data = json.loads(path.read_text("utf-8"))
        return {k: v for k, v in data.items() if not k.startswith("_")}
    except Exception:
        return {}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Build (once) the settings snapshot from the environment + config.json."""
    s = Settings()
    # apply infra toggles from config.json (only if not set via env)
    cfg = _load_config_json()
    import os

    if "cache_enabled" in cfg and os.getenv("CACHE_ENABLED") is None:
        object.__setattr__(s, "cache_enabled", bool(cfg["cache_enabled"]))
    if "max_parallel_api_calls" in cfg and os.getenv("MAX_PARALLEL_API_CALLS") is None:
        object.__setattr__(s, "max_parallel_api_calls", int(cfg["max_parallel_api_calls"]))
    if "local_rendering" in cfg and os.getenv("LOCAL_RENDERING") is None:
        object.__setattr__(s, "local_rendering", bool(cfg["local_rendering"]))
    s.paths.ensure()
    return s
