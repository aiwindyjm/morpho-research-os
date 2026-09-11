"""Usage accounting (draft; frozen by W2-03).

LLMUsage records input/output tokens, provider, model, duration, estimated
cost, cache hits, retry attempts, and task/run ids so every provider
consumption is traceable. The worker never persists usage itself; ledgers
are injected (in-memory here, Rust-backed later).
"""

from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field


class UsageRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    usage_id: str
    provider_id: str
    model: str
    purpose: str = ""
    prompt_id: str = ""
    prompt_version: int = 1
    run_id: str = ""
    task_id: str = ""
    correlation_id: str = ""
    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    duration_ms: int = Field(default=0, ge=0)
    #: None means unknown pricing; never silently reported as zero cost.
    estimated_cost: float | None = None
    cache_hit: bool = False
    attempt: int = 1
    status: str = "success"
    error_code: str | None = None
    created_at: str = ""


class UsageLedger(Protocol):
    def record(self, usage: UsageRecord) -> None: ...

    def all(self) -> list[UsageRecord]: ...


class InMemoryUsageLedger:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._records: list[UsageRecord] = []

    def record(self, usage: UsageRecord) -> None:
        with self._lock:
            self._records.append(usage)

    def all(self) -> list[UsageRecord]:
        with self._lock:
            return list(self._records)

    def totals(self) -> dict[str, int]:
        with self._lock:
            return {
                "records": len(self._records),
                "input_tokens": sum(r.input_tokens for r in self._records),
                "output_tokens": sum(r.output_tokens for r in self._records),
                "cache_hits": sum(1 for r in self._records if r.cache_hit),
                "failures": sum(1 for r in self._records if r.status != "success"),
            }


def estimate_cost(
    *, input_tokens: int, output_tokens: int, cost_per_1k_input: float | None,
    cost_per_1k_output: float | None
) -> float | None:
    """Deterministic cost estimate; None when pricing is unconfigured."""

    if cost_per_1k_input is None or cost_per_1k_output is None:
        return None
    return round(
        (input_tokens / 1000.0) * cost_per_1k_input
        + (output_tokens / 1000.0) * cost_per_1k_output,
        6,
    )


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
