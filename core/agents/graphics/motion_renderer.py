"""
Motion renderer (Ch16.19) — OverlaySpec → animated MP4 via Remotion.

Shells out to the motion/ workspace's Remotion CLI. Renders are cached by spec
hash under cache/motion/, and each clip is registered as a normal ClipAsset so
the timeline, editor preview and FFmpeg export treat it like any other footage.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Optional

from core.config import get_settings
from core.utils.proc import run_shell
from core.schemas.edl import ClipAsset
from core.utils.ids import new_id
from core.utils.logging import get_logger

log = get_logger("graphics.render")

_RENDER_TIMEOUT = 300  # seconds per clip
# Bump when motion/src templates change look — invalidates cached renders.
_TEMPLATE_VERSION = "v3"


def _motion_dir() -> Path:
    return get_settings().paths.root / "motion"


def _out_dir() -> Path:
    d = get_settings().paths.cache / "motion"
    d.mkdir(parents=True, exist_ok=True)
    return d


def renderer_available() -> bool:
    root = get_settings().paths.root
    # npm workspaces hoist deps to the root node_modules
    return any((p / "node_modules" / "remotion").exists() for p in (root / "motion", root))


async def render_motion(spec: dict) -> Optional[ClipAsset]:
    """Render one overlay spec to MP4 (cached). Returns a registered-shape asset."""
    digest = hashlib.sha256(
        (_TEMPLATE_VERSION + json.dumps(spec, sort_keys=True)).encode()
    ).hexdigest()[:16]
    out = _out_dir() / f"mg_{digest}.mp4"
    if not out.exists():
        props = _out_dir() / f"mg_{digest}.props.json"
        props.write_text(json.dumps(spec), "utf-8")
        # shell so Windows resolves npx.cmd; thread-based so it works under
        # uvicorn --reload's SelectorEventLoop (no asyncio subprocess support).
        cmd = f'npx remotion render Overlay "{out}" --props="{props}" --log=error'
        try:
            code, _, err = await run_shell(cmd, cwd=str(_motion_dir()), timeout=_RENDER_TIMEOUT)
            if code != 0 or not out.exists():
                log.warning("remotion render failed: %s", (err or b"").decode(errors="replace")[-400:])
                return None
        finally:
            props.unlink(missing_ok=True)
    from core.providers.storage import rel

    return ClipAsset(
        id=new_id("mg_"),
        path=rel(out),
        durationSec=float(spec.get("durationSec", 3.0)),
        width=int(spec.get("width", 1920)),
        height=int(spec.get("height", 1080)),
        fps=float(spec.get("fps", 30)),
        tags=["motion_graphics", str(spec.get("template", ""))],
    )
