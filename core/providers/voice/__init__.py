"""Voice/TTS providers (Ch17.5). Kokoro-ONNX local TTS is the default engine."""

from core.providers.voice.kokoro import KokoroTTS, get_tts

__all__ = ["KokoroTTS", "get_tts"]
