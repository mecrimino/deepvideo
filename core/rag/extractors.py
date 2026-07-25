"""
Text Extraction (8.5) — turn any source into clean text.

Supported inputs and the tool used:
  * PDF        → ``pypdf``; if a page yields no text (scanned), **PaddleOCR** (tools.md)
  * HTML/URL   → ``httpx`` fetch + a lightweight tag stripper
  * Markdown/TXT → read as-is
  * YouTube    → ``yt-dlp`` (tools.md) subtitle track

All heavy libraries are imported lazily so importing this module is cheap, and
every extractor degrades gracefully (returns "" rather than raising).
"""

from __future__ import annotations

import re
from pathlib import Path

import httpx

from core.utils.logging import get_logger

log = get_logger("rag.extract")

_TAG_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.DOTALL | re.IGNORECASE)
_HTML_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"[ \t]+")


def clean_text(text: str) -> str:
    """8.5 cleaning — collapse whitespace, drop control chars."""
    text = text.replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = _WS_RE.sub(" ", text)
    return text.strip()


def html_to_text(html: str) -> str:
    html = _TAG_RE.sub(" ", html)
    html = re.sub(r"</(p|div|h[1-6]|li|br)>", "\n", html, flags=re.IGNORECASE)
    return clean_text(_HTML_RE.sub(" ", html))


def extract_txt(path: str | Path) -> str:
    try:
        return clean_text(Path(path).read_text("utf-8", errors="ignore"))
    except Exception as exc:
        log.warning("txt read failed: %s", exc)
        return ""


def extract_pdf(path: str | Path) -> str:
    path = Path(path)
    text = ""
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        pages = [(p.extract_text() or "") for p in reader.pages]
        text = "\n\n".join(pages).strip()
    except Exception as exc:
        log.warning("pypdf failed: %s", exc)
    if len(text) >= 40:
        return clean_text(text)
    # scanned PDF → OCR fallback (PaddleOCR, tools.md)
    ocr = _ocr_pdf(path)
    return clean_text(ocr or text)


def _ocr_pdf(path: Path) -> str:
    try:
        from paddleocr import PaddleOCR  # heavy; lazy
        import numpy as np  # noqa: F401
        from pdf2image import convert_from_path
    except Exception:
        return ""
    try:
        ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)
        out: list[str] = []
        for img in convert_from_path(str(path)):
            import numpy as np
            result = ocr.ocr(np.array(img), cls=True)
            for line in (result or []):
                for _box, (txt, _conf) in line:
                    out.append(txt)
        return "\n".join(out)
    except Exception as exc:
        log.warning("OCR failed: %s", exc)
        return ""


async def fetch_url(url: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "DeepVision/0.1"})
            resp.raise_for_status()
            ctype = resp.headers.get("content-type", "")
            if "html" in ctype or resp.text.lstrip().startswith("<"):
                return html_to_text(resp.text)
            return clean_text(resp.text)
    except Exception as exc:
        log.warning("url fetch failed (%s): %s", url[:60], exc)
        return ""


def extract_youtube_transcript(url: str) -> str:
    try:
        import yt_dlp  # tools.md downloader
    except Exception:
        return ""
    opts = {"skip_download": True, "writesubtitles": True, "writeautomaticsub": True,
            "subtitleslangs": ["en"], "quiet": True, "no_warnings": True}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
        subs = (info.get("subtitles") or {}).get("en") or (info.get("automatic_captions") or {}).get("en")
        if not subs:
            return info.get("description", "") or ""
        import httpx as _h
        data = _h.get(subs[-1]["url"], timeout=20).text
        # strip VTT/XML timing → plain text
        lines = [l for l in data.splitlines() if l and "-->" not in l and not l.strip().isdigit()]
        return clean_text(" ".join(html_to_text(l) for l in lines))
    except Exception as exc:
        log.warning("yt transcript failed: %s", exc)
        return ""


def extract_file(path: str | Path) -> str:
    ext = Path(path).suffix.lower()
    if ext == ".pdf":
        return extract_pdf(path)
    if ext in (".html", ".htm"):
        return html_to_text(Path(path).read_text("utf-8", errors="ignore"))
    return extract_txt(path)
