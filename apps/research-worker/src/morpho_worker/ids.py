"""Identifier helpers.

- ``new_id`` returns a UUIDv7 string (time-sortable), matching the UUIDv7
  string requirement in ``docs/DATA_MODEL.md``.
- ``stable_id`` returns a deterministic UUIDv5 string for records whose
  identity must survive re-runs (dedup keys, knowledge node ids, claim ids).
- ``stable_key`` returns a sha256 hex digest over a canonical JSON encoding,
  used for cache keys, dedup keys, and content fingerprints.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
import time
import uuid
from typing import Any

_MORPHO_UUID_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "https://morpho.dev/ids")


def new_id() -> str:
    return str(_uuid7())


_uuid7_lock = threading.Lock()
_uuid7_last_ms = 0
_uuid7_counter = 0


def _uuid7() -> uuid.UUID:
    # RFC 9562 UUIDv7: 48-bit unix millisecond timestamp, version 7, and a
    # 12-bit monotonic counter in rand_a so ids created in the same
    # millisecond still sort in creation order. Python 3.11 has no uuid7.
    global _uuid7_last_ms, _uuid7_counter
    with _uuid7_lock:
        ts_ms = int(time.time() * 1000) & 0xFFFFFFFFFFFF
        if ts_ms <= _uuid7_last_ms:
            ts_ms = _uuid7_last_ms
            _uuid7_counter += 1
            if _uuid7_counter > 0xFFF:
                ts_ms += 1
                _uuid7_counter = 0
        else:
            _uuid7_counter = int.from_bytes(os.urandom(2), "big") & 0x7FF
        _uuid7_last_ms = ts_ms
        rand_a = _uuid7_counter
    rand_b = int.from_bytes(os.urandom(8), "big") & 0x3FFFFFFFFFFFFFFF
    value = ts_ms << 80
    value |= 0x7 << 76             # version 7
    value |= rand_a << 64
    value |= 0b10 << 62            # variant
    value |= rand_b
    return uuid.UUID(int=value)


def stable_id(*parts: Any) -> str:
    """Deterministic id for dedup-critical records (survives re-runs)."""

    canonical = "\x1f".join(str(part) for part in parts)
    return str(uuid.uuid5(_MORPHO_UUID_NAMESPACE, canonical))


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def stable_key(*parts: Any) -> str:
    return hashlib.sha256(canonical_json(list(parts)).encode("utf-8")).hexdigest()


def content_fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
