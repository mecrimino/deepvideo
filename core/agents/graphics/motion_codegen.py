"""
Motion codegen (Ch16) — GLM 5.2 writes the Remotion component itself.

Two system prompts (prompts/*.md, user-authored) drive generation:
  - text_animation_system.md   → kinetic typography, titles, quotes, CTAs
  - motion_graphics_system.md  → shapes, particles, data callouts (stats)

The generated TSX is validated (must export MyComposition, no forbidden APIs),
written under motion/src/generated/, and rendered with a per-clip entry file.
Any failure at any step returns None — the caller falls back to the spec-based
template renderer, so a bad generation never breaks a run.

Codegen calls run in PARALLEL per beat (the NVIDIA queue wait dominates and
parallel requests wait concurrently); the 38 req/min cap is far above the
handful of motion beats in a video.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
from pathlib import Path
from typing import Optional

from core.config import get_settings
from core.providers.llm.base import ChatMessage
from core.providers.llm.nvidia import get_glm
from core.schemas.edl import ClipAsset
from core.utils.ids import new_id
from core.utils.logging import get_logger
from core.utils.proc import run_shell

log = get_logger("graphics.codegen")

_PROMPTS = Path(__file__).parent / "prompts"
_RENDER_TIMEOUT = 300

# Templates whose content is text-first → text-animation prompt; the rest
# (numbers/data/shape-led) → motion-graphics prompt.
_TEXT_TEMPLATES = {"title_card", "quote", "callout", "end_screen", "badge", "lower_third"}

# The determinism contract from the prompts, enforced mechanically.
_FORBIDDEN = re.compile(
    r"Math\.random|Date\.now|new Date\(|performance\.now|setTimeout|setInterval"
    r"|requestAnimationFrame|@keyframes|from ['\"](?!remotion|@remotion/|react)"
)


def _system_prompt(template: str) -> str:
    name = ("text_animation_system.md" if template in _TEXT_TEMPLATES
            else "motion_graphics_system.md")
    return (_PROMPTS / name).read_text("utf-8")


def _extract_tsx(raw: str) -> Optional[str]:
    """Accept raw TSX; tolerate a stray markdown fence despite the contract."""
    text = raw.strip()
    fence = re.search(r"```(?:tsx|typescript|ts)?\s*\n(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    if "export const MyComposition" not in text:
        return None
    if _FORBIDDEN.search(text):
        log.warning("generated TSX used a forbidden API — rejected")
        return None
    return text


def _entry_tsx(module: str, duration_frames: int, fps: int, w: int, h: int) -> str:
    return f"""import React from 'react';
import {{ Composition, registerRoot }} from 'remotion';
import {{ MyComposition }} from './{module}';

const Root: React.FC = () => (
  <Composition id="Gen" component={{MyComposition}}
    durationInFrames={{{duration_frames}}} fps={{{fps}}} width={{{w}}} height={{{h}}} />
);
registerRoot(Root);
"""


async def generate_and_render(spec: dict, *, niche: str = "") -> Optional[ClipAsset]:
    """One motion beat: GLM writes the component, Remotion renders it."""
    glm = get_glm()
    if not glm.available:
        return None
    settings = get_settings()
    fps = int(spec.get("fps", 30))
    frames = max(1, round(float(spec.get("durationSec", 3.0)) * fps))
    w, h = int(spec.get("width", 1920)), int(spec.get("height", 1080))

    digest = hashlib.sha256(("codegen:" + json.dumps(spec, sort_keys=True)).encode()).hexdigest()[:16]
    out = settings.paths.cache / "motion" / f"gen_{digest}.mp4"
    gen_dir = settings.paths.root / "motion" / "src" / "generated"

    if not out.exists():
        user = (
            f"Video niche: {niche or 'general'}\n"
            f"Composition: {w}x{h} @ {fps}fps, durationInFrames={frames}.\n"
            f"Graphic intent: {spec.get('template')}\n"
            f"Main text: {spec.get('text')!r}\n"
            f"Secondary text: {spec.get('secondary') or 'none'}\n"
            f"Emphasize these words with the accent color: {spec.get('highlight') or []}\n"
            f"Icon (emoji, optional to use): {spec.get('icon') or 'none'}\n"
            f"Theme: {spec.get('theme')} — pick a fitting dark background and ONE "
            f"accent color; high contrast text.\n"
            f"The animation must fill the whole duration: enter, hold readable, exit.\n"
            f"PRODUCTION VALUE (non-negotiable): this must look like a premium After "
            f"Effects template, not a slide. Layered background (gradient + slowly "
            f"drifting radial glow + a few faint deterministic particles + vignette); "
            f"staggered entrances (words/elements offset a few frames each); glow/"
            f"text-shadow on the accent; a subtle continuous drift or pulse during the "
            f"hold so no frame is static; numbers count up; dividers/underlines draw in."
        )
        try:
            res = await glm.chat(
                [ChatMessage("system", _system_prompt(str(spec.get("template", "")))),
                 ChatMessage("user", user)],
                max_tokens=16384,
            )
        except Exception as exc:
            log.warning("codegen GLM call failed: %s", exc)
            return None
        tsx = _extract_tsx(res.text)
        if tsx is None:
            log.warning("codegen output invalid — falling back to template renderer")
            return None

        gen_dir.mkdir(parents=True, exist_ok=True)
        comp = gen_dir / f"gen_{digest}.tsx"
        entry = gen_dir / f"gen_{digest}.entry.tsx"
        comp.write_text(tsx, "utf-8")
        entry.write_text(_entry_tsx(f"gen_{digest}", frames, fps, w, h), "utf-8")

        cmd = (f'npx remotion render "src/generated/gen_{digest}.entry.tsx" Gen "{out}" '
               f"--log=error")
        code, _, err = await run_shell(cmd, cwd=str(settings.paths.root / "motion"),
                                       timeout=_RENDER_TIMEOUT)
        if code != 0 or not out.exists():
            log.warning("codegen render failed (falling back): %s",
                        (err or b"").decode(errors="replace")[-400:])
            return None

    from core.providers.storage import rel

    return ClipAsset(
        id=new_id("mg_"), path=rel(out), durationSec=float(spec.get("durationSec", 3.0)),
        width=w, height=h, fps=float(fps),
        tags=["motion_graphics", "codegen", str(spec.get("template", ""))],
    )


async def generate_all(specs: dict[str, dict], *, niche: str = "") -> dict[str, ClipAsset]:
    """Run codegen for all motion beats CONCURRENTLY (queue waits overlap)."""
    if not specs:
        return {}
    ids = list(specs)
    results = await asyncio.gather(
        *(generate_and_render(specs[i], niche=niche) for i in ids),
        return_exceptions=True,
    )
    out: dict[str, ClipAsset] = {}
    for beat_id, res in zip(ids, results):
        if isinstance(res, ClipAsset):
            out[beat_id] = res
    log.info("codegen produced %d/%d clips", len(out), len(ids))
    return out
