"""
Memory System (Ch7) — the AI's memory, shared by all agents (7.17).

Built from scratch per Ch7 using tools.md tech: **ChromaDB** vector memory (7.12),
**SQLite** structured store + knowledge graph (7.5/7.11), **Pydantic** records
(7.18), **LLM** compression (7.15), **Loguru** logs. Human-brain-inspired forms
(7.2): working, long-term, episodic, semantic, procedural, preference and asset
memory, retrieved by meaning and ranked by five factors (7.13/7.14).

``MemorySystem`` is kept as an alias of :class:`MemoryService` for existing
callers.
"""

from core.memory.embedder import cosine, get_embedder
from core.memory.knowledge_graph import KnowledgeGraph
from core.memory.models import (
    AssetMemory,
    Episode,
    MemoryHit,
    MemoryKind,
    MemoryRecord,
    Preference,
    Procedure,
    RankFactors,
)
from core.memory.retrieval import RetrievalPipeline
from core.memory.service import MemoryService, get_memory
from core.memory.vector_store import VectorStore
from core.memory.working import WorkingMemory

# backward-compatible aliases
MemorySystem = MemoryService
VectorMemory = VectorStore

__all__ = [
    "MemoryService", "MemorySystem", "get_memory", "MemoryKind", "MemoryRecord",
    "MemoryHit", "RankFactors", "Episode", "Preference", "AssetMemory", "Procedure",
    "KnowledgeGraph", "VectorStore", "VectorMemory", "WorkingMemory",
    "RetrievalPipeline", "get_embedder", "cosine",
]
