"""
Structured, observable logging (Ch2.13) — powered by **Loguru** (tools.md).

Loguru is the Python logger of record for the project. To avoid rewriting every
call site, :func:`get_logger` returns a thin adapter that accepts the classic
``log.info("value %s", x)`` printf style and forwards it to Loguru (which is
otherwise ``{}``-style). One stderr sink + a rotating ``logs/core.log`` file sink
are configured once, process-wide.
"""

from __future__ import annotations

import sys
from functools import lru_cache

from loguru import logger as _loguru

from core.config import get_settings

_CONFIGURED = False


def _configure() -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    _loguru.remove()
    fmt = (
        "<green>{time:HH:mm:ss}</green> <level>{level: <5}</level> "
        "[<cyan>{extra[name]}</cyan>] {message}"
    )
    _loguru.add(sys.stderr, format=fmt, level="INFO", enqueue=True, backtrace=False)
    try:
        log_path = get_settings().paths.logs / "core.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        _loguru.add(
            str(log_path),
            format="{time:HH:mm:ss} {level: <5} [{extra[name]}] {message}",
            level="DEBUG",
            rotation="10 MB",
            retention="7 days",
            enqueue=True,
        )
    except Exception:
        pass
    # Developer-Dashboard sink — mirror every log line into the live metrics
    # ring buffer so the Logs panel shows real structured logs (Ch2.13).
    try:
        _loguru.add(_dashboard_sink, level="DEBUG", format="{message}", enqueue=True)
    except Exception:
        pass
    _CONFIGURED = True


def _dashboard_sink(message) -> None:
    try:
        from core.dev.metrics import get_metrics

        r = message.record
        get_metrics().record_log(
            r["level"].name, r["extra"].get("name", ""),
            r["message"], r["time"].strftime("%H:%M:%S"),
        )
    except Exception:
        pass


class _LoguruAdapter:
    """printf-style shim so existing ``log.info("x %s", y)`` calls keep working."""

    __slots__ = ("_log",)

    def __init__(self, name: str) -> None:
        self._log = _loguru.bind(name=name)

    @staticmethod
    def _fmt(msg: object, args: tuple) -> str:
        text = str(msg)
        if args:
            try:
                return text % args
            except Exception:
                return text + " " + " ".join(str(a) for a in args)
        return text

    def debug(self, msg: object, *args: object) -> None:
        self._log.opt(depth=1).debug(self._fmt(msg, args))

    def info(self, msg: object, *args: object) -> None:
        self._log.opt(depth=1).info(self._fmt(msg, args))

    def warning(self, msg: object, *args: object) -> None:
        self._log.opt(depth=1).warning(self._fmt(msg, args))

    warn = warning

    def error(self, msg: object, *args: object) -> None:
        self._log.opt(depth=1).error(self._fmt(msg, args))

    def exception(self, msg: object, *args: object) -> None:
        self._log.opt(depth=1, exception=True).error(self._fmt(msg, args))


@lru_cache(maxsize=None)
def get_logger(name: str) -> _LoguruAdapter:
    _configure()
    return _LoguruAdapter(name)
