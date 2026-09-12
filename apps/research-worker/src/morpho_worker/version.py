"""Worker and protocol version metadata.

Draft status: the authoritative version/compatibility matrix is defined by
W0-03 and the worker protocol is frozen by W2-02. Until then:

- the app/worker version is read from the repository ``VERSION`` file with a
  fallback constant, and
- the protocol version is the draft string ``"1"``.

Do not add business fields here; W2-02 owns the final contract.
"""

from __future__ import annotations

import functools
from pathlib import Path

_FALLBACK_VERSION = "0.0.1"
VERSION_FILE_NAME = "VERSION"

#: Draft worker protocol version. Frozen by W2-02.
WORKER_PROTOCOL_VERSION = "1"


def _find_repo_root(start: Path) -> Path | None:
    for candidate in [start, *start.parents]:
        if (candidate / VERSION_FILE_NAME).is_file():
            return candidate
    return None


@functools.lru_cache(maxsize=1)
def app_version() -> str:
    """Return the worker version from the repository VERSION file.

    The VERSION file uses either ``version: 0.0.1`` or a bare ``0.0.1`` line.
    Missing or unreadable files fall back to the packaged version constant so
    that health endpoints never fail because of a deployment detail.
    """

    root = _find_repo_root(Path(__file__).resolve())
    if root is not None:
        try:
            text = (root / VERSION_FILE_NAME).read_text(encoding="utf-8").strip()
        except OSError:
            return _FALLBACK_VERSION
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            if line.lower().startswith("version:"):
                line = line.split(":", 1)[1].strip()
            return line or _FALLBACK_VERSION
    return _FALLBACK_VERSION


def is_protocol_compatible(requested: str) -> bool:
    """Draft compatibility rule: major version must match exactly.

    W2-02 replaces this with the frozen compatibility matrix.
    """

    return str(requested).strip() == WORKER_PROTOCOL_VERSION


def health_payload(*, process_status: str = "ok") -> dict:
    return {
        "schema_version": "1",
        "status": process_status,
        "worker_version": app_version(),
        "protocol_version": WORKER_PROTOCOL_VERSION,
    }


def version_payload() -> dict:
    return {
        "schema_version": "1",
        "worker_version": app_version(),
        "protocol_version": WORKER_PROTOCOL_VERSION,
        "accepted_protocol_versions": [WORKER_PROTOCOL_VERSION],
    }
