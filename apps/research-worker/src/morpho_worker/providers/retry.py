"""Bounded retry policy primitive (adapters wrap it; frozen by W2-03)."""

from __future__ import annotations

from dataclasses import dataclass

from morpho_worker.clock import Clock, SystemClock
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


class RetryingProvider:
    """Transport-level bounded retry wrapper for direct provider uses (for
    example the search stage). LLM calls used through the structured output
    pipeline are NOT wrapped by this: the pipeline owns output-quality
    retries, and stacking the two would multiply attempts."""

    def __init__(self, inner, policy: RetryPolicy, *, clock: Clock | None = None) -> None:
        self._inner = inner
        self._policy = policy
        self._clock = clock or SystemClock()

    def search(self, request):
        last_error: MorphoError | None = None
        for attempt in self._policy.attempts_range:
            try:
                return self._inner.search(request)
            except MorphoError as exc:
                last_error = exc
                if exc.retryable and attempt < self._policy.max_attempts:
                    sleep_backoff(self._clock, self._policy, attempt)
                    continue
                if exc.retryable:
                    raise retry_failed(
                        self._policy,
                        exc,
                        exhausted_message="The search provider kept failing; giving up after bounded retries.",
                    )
                raise
        raise last_error  # pragma: no cover - unreachable
