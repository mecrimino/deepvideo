"""
SQLite backing store (tools.md: Database = SQLite) — the source of truth.

Holds the canonical memory records (for update/delete/list and ranking metadata),
the knowledge-graph edges (7.11) and the compression archive (7.15). ChromaDB
holds only the vectors keyed by record id; full records live here. One database
file under ``cache/memory.db``.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Optional

from core.config import get_settings
from core.memory.models import MemoryKind, MemoryRecord

_SCHEMA = """
CREATE TABLE IF NOT EXISTS records (
    id         TEXT PRIMARY KEY,
    kind       TEXT NOT NULL,
    scope      TEXT NOT NULL DEFAULT 'global',
    text       TEXT NOT NULL,
    metadata   TEXT NOT NULL DEFAULT '{}',
    rating     REAL NOT NULL DEFAULT 0.5,
    confidence REAL NOT NULL DEFAULT 0.5,
    uses       INTEGER NOT NULL DEFAULT 0,
    archived   INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rec_kind  ON records(kind);
CREATE INDEX IF NOT EXISTS idx_rec_scope ON records(scope);

CREATE TABLE IF NOT EXISTS kg_edges (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    subject    TEXT NOT NULL,
    predicate  TEXT NOT NULL,
    object     TEXT NOT NULL,
    scope      TEXT NOT NULL DEFAULT 'global',
    confidence REAL NOT NULL DEFAULT 0.5,
    UNIQUE(subject, predicate, object, scope)
);
CREATE INDEX IF NOT EXISTS idx_kg_subject ON kg_edges(subject);
CREATE INDEX IF NOT EXISTS idx_kg_object  ON kg_edges(object);

CREATE TABLE IF NOT EXISTS archive (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_id     TEXT NOT NULL,
    original   TEXT NOT NULL,
    created_at REAL NOT NULL
);
"""


class Store:
    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = path or (get_settings().paths.cache / "memory.db")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    def _exec(self, sql: str, params=()):
        with self._lock:
            cur = self._conn.execute(sql, tuple(params))
            self._conn.commit()
            return cur

    def _query(self, sql: str, params=()):
        with self._lock:
            return list(self._conn.execute(sql, tuple(params)).fetchall())

    # -- records ------------------------------------------------------- #
    def upsert(self, rec: MemoryRecord) -> MemoryRecord:
        now = time.time()
        rec.created_at = rec.created_at or now
        rec.updated_at = now
        self._exec(
            """INSERT INTO records (id,kind,scope,text,metadata,rating,confidence,uses,archived,created_at,updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET text=excluded.text, metadata=excluded.metadata,
                 rating=excluded.rating, confidence=excluded.confidence, uses=excluded.uses,
                 archived=excluded.archived, updated_at=excluded.updated_at""",
            (rec.id, rec.kind.value, rec.scope, rec.text, json.dumps(rec.metadata),
             rec.rating, rec.confidence, rec.uses, int(rec.archived), rec.created_at, rec.updated_at),
        )
        return rec

    def get(self, rec_id: str) -> Optional[MemoryRecord]:
        rows = self._query("SELECT * FROM records WHERE id=?", (rec_id,))
        return _row_to_record(rows[0]) if rows else None

    def many(self, ids: list[str]) -> dict[str, MemoryRecord]:
        if not ids:
            return {}
        q = ",".join("?" * len(ids))
        rows = self._query(f"SELECT * FROM records WHERE id IN ({q})", ids)
        return {r["id"]: _row_to_record(r) for r in rows}

    def list(self, *, kind: Optional[str] = None, scope: Optional[str] = None) -> list[MemoryRecord]:
        sql, params = "SELECT * FROM records WHERE archived=0", []
        if kind:
            sql += " AND kind=?"; params.append(kind)
        if scope:
            sql += " AND scope=?"; params.append(scope)
        return [_row_to_record(r) for r in self._query(sql, params)]

    def delete(self, rec_id: str) -> None:
        self._exec("DELETE FROM records WHERE id=?", (rec_id,))

    def bump_uses(self, rec_id: str) -> None:
        self._exec("UPDATE records SET uses=uses+1, updated_at=? WHERE id=?", (time.time(), rec_id))

    def set_archived(self, rec_id: str, archived: bool = True) -> None:
        self._exec("UPDATE records SET archived=? WHERE id=?", (int(archived), rec_id))

    # -- knowledge graph (7.11) --------------------------------------- #
    def add_edge(self, s: str, p: str, o: str, scope: str, confidence: float) -> None:
        self._exec(
            "INSERT OR IGNORE INTO kg_edges (subject,predicate,object,scope,confidence) VALUES (?,?,?,?,?)",
            (s.strip(), p.strip(), o.strip(), scope, confidence),
        )

    def edges_for(self, entity: str, scope: str) -> list[sqlite3.Row]:
        return self._query(
            """SELECT subject,predicate,object,confidence FROM kg_edges
               WHERE (subject=? OR object=?) AND (scope=? OR scope='global')""",
            (entity, entity, scope),
        )

    # -- archive (7.15) ----------------------------------------------- #
    def archive(self, ref_id: str, original: str) -> None:
        self._exec("INSERT INTO archive (ref_id,original,created_at) VALUES (?,?,?)",
                   (ref_id, original, time.time()))

    def get_archive(self, ref_id: str) -> Optional[str]:
        rows = self._query("SELECT original FROM archive WHERE ref_id=? ORDER BY id DESC LIMIT 1", (ref_id,))
        return rows[0]["original"] if rows else None


def _row_to_record(r) -> MemoryRecord:
    return MemoryRecord(
        id=r["id"], kind=MemoryKind(r["kind"]), scope=r["scope"], text=r["text"],
        metadata=json.loads(r["metadata"] or "{}"), rating=r["rating"],
        confidence=r["confidence"], uses=r["uses"], archived=bool(r["archived"]),
        created_at=r["created_at"], updated_at=r["updated_at"],
    )


_store: Optional[Store] = None


def get_store() -> Store:
    global _store
    if _store is None:
        _store = Store()
    return _store
