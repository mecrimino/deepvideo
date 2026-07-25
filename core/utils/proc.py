"""
Async subprocess helpers that work on ANY event loop.

Windows + `uvicorn --reload` runs a SelectorEventLoop, where asyncio's own
subprocess transports raise NotImplementedError. Running blocking
``subprocess.run`` in a worker thread sidesteps the loop entirely, so the same
code works in dev (--reload), production and plain scripts.
"""

from __future__ import annotations

import asyncio
import subprocess
from typing import Optional


async def run_exec(*args: str, timeout: Optional[float] = None) -> tuple[int, bytes, bytes]:
    """Run an argv command; returns (returncode, stdout, stderr)."""
    def _blocking() -> tuple[int, bytes, bytes]:
        try:
            p = subprocess.run(list(args), capture_output=True, timeout=timeout)
            return p.returncode, p.stdout, p.stderr
        except subprocess.TimeoutExpired as exc:
            return 124, exc.stdout or b"", exc.stderr or b""
        except OSError as exc:
            return 127, b"", str(exc).encode()

    return await asyncio.to_thread(_blocking)


async def run_shell(cmd: str, *, cwd: Optional[str] = None,
                    timeout: Optional[float] = None) -> tuple[int, bytes, bytes]:
    """Run a shell command string (resolves .cmd shims like npx on Windows)."""
    def _blocking() -> tuple[int, bytes, bytes]:
        try:
            p = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True, timeout=timeout)
            return p.returncode, p.stdout, p.stderr
        except subprocess.TimeoutExpired as exc:
            return 124, exc.stdout or b"", exc.stderr or b""
        except OSError as exc:
            return 127, b"", str(exc).encode()

    return await asyncio.to_thread(_blocking)
