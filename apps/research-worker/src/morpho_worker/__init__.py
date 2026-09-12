"""Morpho Research OS local research worker.

The worker owns research planning/execution, provider adapters, extraction,
validation, and normalization. It never writes the Vault, never writes SQLite
directly, and never mutates UI state: validated results are handed to an
injected result sink (later bridged to Rust persistence through the worker
protocol).
"""

from morpho_worker.config import ProviderConfig, ProviderKind, WorkerConfig
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.version import (
    WORKER_PROTOCOL_VERSION,
    app_version,
    health_payload,
    is_protocol_compatible,
    version_payload,
)

__version__ = app_version()

__all__ = [
    "ErrorCode",
    "MorphoError",
    "ProviderConfig",
    "ProviderKind",
    "WORKER_PROTOCOL_VERSION",
    "WorkerConfig",
    "__version__",
    "app_version",
    "health_payload",
    "is_protocol_compatible",
    "version_payload",
]
