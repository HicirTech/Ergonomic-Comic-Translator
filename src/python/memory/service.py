"""
Mem0 memory service — uses local Qdrant (embedded, no server/Docker) and Ollama.

Configuration is read from environment variables so the TypeScript layer can
pass settings without modifying this file:

  OLLAMA_HOST            Ollama base URL (default: http://localhost:11434)
  OLLAMA_TRANSLATE_MODEL LLM used for memory extraction (default: translategemma:12b)
  OLLAMA_EMBED_MODEL     Embedding model for vector search (default: nomic-embed-text)
  QDRANT_STORAGE_PATH    Directory for on-disk Qdrant storage (default: .tmp/qdrant_storage)
"""

import os
import sys

try:
    from mem0 import Memory
except ImportError as exc:
    print(
        f"[ERROR] Missing dependency: {exc}. Run `bun run memory:bootstrap` first.",
        file=sys.stderr,
    )
    sys.exit(2)


def build_config() -> dict:
    """Build the Mem0 configuration from environment variables."""
    ollama_host = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    ollama_model = os.getenv("OLLAMA_TRANSLATE_MODEL", "translategemma:12b")
    ollama_embed_model = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
    qdrant_path = os.getenv("QDRANT_STORAGE_PATH", ".tmp/qdrant_storage")

    return {
        "vector_store": {
            "provider": "qdrant",
            "config": {
                "collection_name": "comic_translator_memory",
                # Local embedded mode — no Qdrant server or Docker required.
                # Data is persisted to disk at qdrant_path.
                "path": qdrant_path,
            },
        },
        "llm": {
            "provider": "ollama",
            "config": {
                "model": ollama_model,
                "ollama_base_url": ollama_host,
                "temperature": 0.1,
            },
        },
        "embedder": {
            "provider": "ollama",
            "config": {
                "model": ollama_embed_model,
                "ollama_base_url": ollama_host,
            },
        },
        "version": "v1.1",
    }


def get_memory() -> Memory:
    """Return a configured Memory instance."""
    return Memory.from_config(build_config())
