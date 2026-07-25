"""
Keyword Index (8.9) — exact-match lexical search over chunks (SQLite FTS5).

This is the SQLite side of the RAG store: it is the source-of-truth for chunk
text/metadata *and* provides BM25 keyword search via FTS5. Hybrid search (8.9)
merges these lexical hits with the vector hits so we get both exact matches and
semantic matches.
"""

from __future__ import annotations

import json
import re
import sqlite3
import threading
from pathlib import Path
from typing import Optional

from core.config import get_settings
from core.rag.models import Chunk, Source

_SCHEMA = """
CREATE TABLE IF NOT EXISTS chunks (
    id       TEXT PRIMARY KEY,
    doc_id   TEXT NOT NULL,
    idx      INTEGER NOT NULL DEFAULT 0,
    text     TEXT NOT NULL,
    source   TEXT NOT NULL DEFAULT '{}',
    metadata TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(cid UNINDEXED, text);
"""

_TOKEN_RE = re.compile(r"[A-Za-z0-9]+")


class KeywordIndex:
    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = path or (get_settings().paths.cache / "rag.db")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    def add(self, chunks: list[Chunk]) -> None:
        if not chunks:
            return
        with self._lock:
            for c in chunks:
                self._conn.execute(
                    "INSERT OR REPLACE INTO chunks (id,doc_id,idx,text,source,metadata) VALUES (?,?,?,?,?,?)",
                    (c.id, c.doc_id, c.index, c.text, c.source.model_dump_json(), json.dumps(c.metadata)),
                )
                self._conn.execute("DELETE FROM chunks_fts WHERE cid=?", (c.id,))
                self._conn.execute("INSERT INTO chunks_fts (cid,text) VALUES (?,?)", (c.id, c.text))
            self._conn.commit()

    def get(self, ids: list[str]) -> dict[str, Chunk]:
        if not ids:
            return {}
        q = ",".join("?" * len(ids))
        with self._lock:
            rows = self._conn.execute(f"SELECT * FROM chunks WHERE id IN ({q})", ids).fetchall()
        return {r["id"]: self._row(r) for r in rows}

    def search(self, query: str, *, top_k: int = 20) -> list[tuple[str, float]]:
        terms = _TOKEN_RE.findall(query.lower())
        if not terms:
            return []
        match = " OR ".join(terms)
        try:
            with self._lock:
                rows = self._conn.execute(
                    "SELECT cid, bm25(chunks_fts) AS r FROM chunks_fts "
                    "WHERE chunks_fts MATCH ? ORDER BY r LIMIT ?",
                    (match, top_k),
                ).fetchall()
        except sqlite3.OperationalError:
            return []
        # bm25: lower is better → map to a 0..1 score
        return [(r["cid"], 1.0 / (1.0 + max(0.0, r["r"]))) for r in rows]

    def count(self) -> int:
        with self._lock:
            return self._conn.execute("SELECT COUNT(*) AS n FROM chunks").fetchone()["n"]

    def delete_doc(self, doc_id: str) -> None:
        with self._lock:
            ids = [r["id"] for r in self._conn.execute("SELECT id FROM chunks WHERE doc_id=?", (doc_id,)).fetchall()]
            self._conn.execute("DELETE FROM chunks WHERE doc_id=?", (doc_id,))
            for cid in ids:
                self._conn.execute("DELETE FROM chunks_fts WHERE cid=?", (cid,))
            self._conn.commit()

    @staticmethod
    def _row(r) -> Chunk:
        return Chunk(
            id=r["id"], doc_id=r["doc_id"], index=r["idx"], text=r["text"],
            source=Source.model_validate_json(r["source"]),
            metadata=json.loads(r["metadata"] or "{}"),
        )


_index: Optional[KeywordIndex] = None


def get_keyword_index() -> KeywordIndex:
    global _index
    if _index is None:
        _index = KeywordIndex()
    return _index
