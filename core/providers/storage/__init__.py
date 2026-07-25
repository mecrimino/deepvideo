"""
Storage provider (Ch3 "large media in object storage, references in the DB").

On this hardware storage is the local SSD (Ch20.17). This wraps asset placement
under ``cache/`` and ``projects/`` and returns repo-relative paths so the same
path string is valid on the Node gateway and in the frontend editor. Swapping to
S3/R2/MinIO later means reimplementing this one module (Ch1.6 replaceable).
"""

from __future__ import annotations

import json
import shutil
import threading
from pathlib import Path
from typing import Optional

from core.config import get_settings

# One shared catalog file the Node gateway also reads (cache/clips.json) — the
# single source of truth mapping assetId → ClipAsset for the whole studio.
_CATALOG_LOCK = threading.RLock()


def _root() -> Path:
    return get_settings().paths.root


def _catalog_path() -> Path:
    return get_settings().paths.cache / "clips.json"


def load_catalog() -> list[dict]:
    path = _catalog_path()
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text("utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def register_asset(asset) -> dict:
    """Add/replace a :class:`ClipAsset` in the shared catalog (idempotent by path)."""
    item = asset.model_dump() if hasattr(asset, "model_dump") else dict(asset)
    with _CATALOG_LOCK:
        catalog = load_catalog()
        by_path = {c.get("path"): i for i, c in enumerate(catalog)}
        if item.get("path") in by_path:
            catalog[by_path[item["path"]]] = item
        else:
            catalog.append(item)
        try:
            _catalog_path().write_text(json.dumps(catalog, indent=2), "utf-8")
        except Exception:
            pass
    return item


def get_asset(asset_id: str) -> Optional[dict]:
    for c in load_catalog():
        if c.get("id") == asset_id:
            return c
    return None


def rel(path: str | Path) -> str:
    """Return a path relative to the repo root using forward slashes."""
    p = Path(path).resolve()
    try:
        return p.relative_to(_root().resolve()).as_posix()
    except ValueError:
        return p.as_posix()


def project_dir(project_id: str) -> Path:
    d = get_settings().paths.projects / project_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def place_asset(src: str | Path, project_id: str, *, subdir: str = "assets") -> str:
    """Copy an asset into the project's folder and return its relative path."""
    src = Path(src)
    dest_dir = project_dir(project_id) / subdir
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / src.name
    if src.resolve() != dest.resolve():
        shutil.copy2(src, dest)
    return rel(dest)
