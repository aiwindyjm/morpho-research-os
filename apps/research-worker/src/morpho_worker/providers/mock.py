"""Deterministic mock providers.

These adapters implement the provider ports with scripted, repeatable
behavior so tests and the offline mock mode never touch a network or a real
model. They never require credentials. Scenarios cover the documented test
matrix: success, malformed JSON, schema-invalid JSON, timeout, auth failure,
unavailable provider, and fail-N-times-then-succeed.
"""

from __future__ import annotations

import threading
from typing import Callable, Iterable

from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.providers.ports import (
    LLMRequest,
    LLMResponse,
    RawSearchResult,
    SearchRequest,
)

ScriptItem = str | BaseException | Callable[[LLMRequest], str]


class MockLLMProvider:
    """Scripted LLM adapter.

    ``scripted`` maps a prompt id to a list of script items consumed in
    order per call; a ``str`` is returned verbatim, a ``BaseException`` is
    raised, and a callable receives the request and returns text. When the
    script is exhausted the last item repeats (so single-item scripts are
    stable), unless ``strict_scripts`` is set, which raises on exhaustion.
    """

    def __init__(
        self,
        *,
        scripted: dict[str, list[ScriptItem]] | None = None,
        provider_id: str = "mock",
        model: str = "mock-model",
        strict_scripts: bool = False,
    ) -> None:
        self._scripted = {key: list(value) for key, value in (scripted or {}).items()}
        self.provider_id = provider_id
        self.model = model
        self.strict_scripts = strict_scripts
        self._lock = threading.Lock()
        self.calls: list[LLMRequest] = []

    def complete(self, request: LLMRequest) -> LLMResponse:
        with self._lock:
            self.calls.append(request)
            script = self._scripted.get(request.prompt_id, [])
            if not script:
                raise MorphoError(
                    ErrorCode.PROVIDER_UNAVAILABLE,
                    "No mock response is scripted for this prompt.",
                    developer_detail=f"prompt_id={request.prompt_id!r}",
                    retryable=False,
                )
            item = script[0]
            if len(script) > 1:
                script.pop(0)
            elif self.strict_scripts:
                raise MorphoError(
                    ErrorCode.PROVIDER_UNAVAILABLE,
                    "The mock script for this prompt is exhausted.",
                    developer_detail=f"prompt_id={request.prompt_id!r}",
                    retryable=False,
                )
        if isinstance(item, BaseException):
            raise item
        text = item(request) if callable(item) else item
        return LLMResponse(
            text=text,
            provider_id=self.provider_id,
            model=request.model or self.model,
            # Deterministic pseudo token accounting for tests.
            input_tokens=len(request.prompt) // 4 + len(request.system) // 4 + 1,
            output_tokens=len(text) // 4 + 1,
            duration_ms=1,
            finish_reason="stop",
        )


class MockSearchProvider:
    """Deterministic search adapter over fixture results."""

    def __init__(
        self,
        results: Iterable[RawSearchResult] = (),
        *,
        provider_id: str = "mock",
        failures_before_success: int = 0,
        failure: MorphoError | None = None,
    ) -> None:
        self.results = list(results)
        self.provider_id = provider_id
        self.failures_before_success = failures_before_success
        self.failure = failure or MorphoError(
            ErrorCode.SEARCH_FAILED,
            "The search provider is temporarily failing.",
            developer_detail="mock scenario failures_before_success",
            retryable=True,
        )
        self._lock = threading.Lock()
        self.calls: list[SearchRequest] = []

    def search(self, request: SearchRequest) -> list[RawSearchResult]:
        with self._lock:
            self.calls.append(request)
            if self.failures_before_success > 0:
                self.failures_before_success -= 1
                raise self.failure
        return list(self.results)


class MockEmbeddingProvider:
    """Deterministic embeddings derived from text content. Never random."""

    def __init__(self, dimensions: int = 8, provider_id: str = "mock") -> None:
        self.dimensions = dimensions
        self.provider_id = provider_id

    def embed(self, texts: list[str], *, model: str = "") -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in texts:
            vector = [0.0] * self.dimensions
            for index, byte in enumerate(text.encode("utf-8")):
                vector[(index + byte) % self.dimensions] += (byte % 13) / 13.0
            norm = sum(value * value for value in vector) or 1.0
            vectors.append([round(value / (norm**0.5), 6) for value in vector])
        return vectors
