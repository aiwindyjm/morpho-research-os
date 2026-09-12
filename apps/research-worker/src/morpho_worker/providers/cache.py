"""Cache ports and keys (draft; frozen by W2-03/cache contract).

Namespaces follow ``docs/ai/CACHE_AND_COST.md``: search, source-content,
llm, embeddings. Keys include the schema/prompt version, provider/model,
normalized input, and (for content) the source fingerprint. Cache is
replaceable and its hits must never re-consume a provider call.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Protocol

from morpho_worker.ids import stable_key

NAMESPACE_SEARCH = "search"
NAMESPACE_SOURCE_CONTENT = "source-content"
NAMESPACE_LLM = "llm"
NAMESPACE_EMBEDDINGS = "embeddings"
NAMESPACES = (NAMESPACE_SEARCH, NAMESPACE_SOURCE_CONTENT, NAMESPACE_LLM, NAMESPACE_EMBEDDINGS)


def cache_key(
    namespace: str,
    *,
    schema_version: str | int = 1,
    prompt_id: str = "",
    prompt_version: int | None = None,
    provider_id: str = "",
    model: str = "",
    normalized_input: Any = None,
    fingerprint: str = "",
) -> str:
    """Deterministic cache key over all documented components."""

    return stable_key(
        namespace,
        str(schema_version),
        prompt_id,
        prompt_version,
        provider_id,
        model,
        normalized_input,
        fingerprint,
    )


class CachePort(Protocol):
    def get(self, namespace: str, key: str) -> Any | None: ...

    def put(self, namespace: str, key: str, value: Any, *, ttl_seconds: float | None = None) -> None: ...


class InMemoryCache:
    """Thread-safe in-process cache with optional TTL. This is the worker's
    draft implementation; the durable cache lives in the app data directory
    and is owned by the Rust core."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._store: dict[tuple[str, str], tuple[Any, float | None]] = {}

    def get(self, namespace: str, key: str) -> Any | None:
        with self._lock:
            entry = self._store.get((namespace, key))
            if entry is None:
                return None
            value, expires_at = entry
            if expires_at is not None and time.monotonic() > expires_at:
                del self._store[(namespace, key)]
                return None
            return value

    def put(
        self, namespace: str, key: str, value: Any, *, ttl_seconds: float | None = None
    ) -> None:
        expires_at = (time.monotonic() + ttl_seconds) if ttl_seconds is not None else None
        with self._lock:
            self._store[(namespace, key)] = (value, expires_at)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
