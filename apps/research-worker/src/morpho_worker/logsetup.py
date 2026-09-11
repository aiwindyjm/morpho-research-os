"""Minimal logging setup.

The worker never receives raw secret values (only references), so there is
nothing secret to log by construction. Events leaving the worker go through
the event bus redaction layer (see ``morpho_worker.events``).
"""

from __future__ import annotations

import logging

_CONFIGURED = False


def configure_logging(level: int = logging.INFO) -> None:
    global _CONFIGURED
    if _CONFIGURED:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(levelname)s %(name)s %(message)s"))
    root = logging.getLogger("morpho_worker")
    root.addHandler(handler)
    root.setLevel(level)
    root.propagate = False
    _CONFIGURED = True


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(f"morpho_worker.{name}")
