"""Bounded retry policy primitive (adapters wrap it; frozen by W2-03)."""

from __future__ import annotations

from dataclasses import dataclass

from morpho_worker.clock import Clock
from morpho_worker.errors import MorphoError


@dataclass(frozen=True)
class RetryPolicy:
    max_attempts: int = 3
    backoff_seconds: float = 0.5

    def __post_init__(self) -> None:
        if self.max_attempts < 1:
            raise ValueError("max_attempts must be >= 1")
        if self.backoff_seconds < 0:
            raise ValueError("backoff_seconds must be >= 0")

    @property
    def attempts_range(self) -> range:
        return range(1, self.max_attempts + 1)


def backoff_for_attempt(policy: RetryPolicy, attempt: int) -> float:
    """Exponential backoff capped so bounded retries stay bounded."""

    return policy.backoff_seconds * (2 ** max(0, attempt - 1))


def sleep_backoff(clock: Clock, policy: RetryPolicy, attempt: int) -> None:
    clock.sleep(backoff_for_attempt(policy, attempt))


def retry_failed(
    policy: RetryPolicy,
    error: MorphoError,
    *,
    exhausted_message: str,
) -> MorphoError:
    """Convert a retryable error into its final form once attempts run out."""

    if error.retryable:
        return MorphoError(
            error.code,
            exhausted_message,
            developer_detail=(
                f"retry attempts exhausted: {error.developer_detail or error.user_message}"
            ),
            retryable=False,
            correlation_id=error.correlation_id,
            details={"attempts": policy.max_attempts, "last_error": error.to_dict()},
            cause=error,
        )
    return error
