"""Provider-neutral ports (draft; frozen by W2-03).

The domain depends only on these protocols and their request/response types.
Provider identities and models are configuration; provider-specific details
never cross this boundary. All adapters implement timeout, bounded retry,
redaction, and usage accounting around these ports.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, runtime_checkable


@dataclass(frozen=True)
class LLMRequest:
    """One completion request. ``system``/``prompt`` are already-rendered
    prompt texts (the structured pipeline renders templates)."""

    model: str
    system: str = ""
    prompt: str = ""
    temperature: float = 0.0
    max_output_tokens: int = 2048
    #: Identifies the expected output contract (prompt id, e.g.
    #: "planner.plan-draft"); used for cache keys and usage records.
    prompt_id: str = ""
    prompt_version: int = 1
    correlation_id: str = ""
    #: JSON expected: adapters should request structured output when the
    #: backend supports it, but the worker always parses/validates itself.
    expect_json: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class LLMResponse:
    text: str
    provider_id: str
    model: str
    #: Token counts reported by the backend; 0/None when unknown.
    input_tokens: int | None = None
    output_tokens: int | None = None
    duration_ms: int = 0
    finish_reason: str = ""


@runtime_checkable
class LLMProvider(Protocol):
    def complete(self, request: LLMRequest) -> LLMResponse:
        """Blocking completion. Raises MorphoError on failure with a code
        from the documented error set (PROVIDER_TIMEOUT, PROVIDER_AUTH_FAILED,
        LLM_INVALID_JSON never raised here - parsing happens above this
        layer, PROVIDER_UNAVAILABLE proposal)."""
        ...


@dataclass(frozen=True)
class RawSearchResult:
    """One provider search hit before canonicalization."""

    title: str
    url: str
    snippet: str = ""
    source_type: str = "web_page"
    published_at: str | None = None
    #: Optional provider-supplied full content (mock/draft path).
    content: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SearchRequest:
    query: str
    max_results: int = 10
    languages: list[str] = field(default_factory=list)
    source_types: list[str] = field(default_factory=list)
    source_domains: list[str] = field(default_factory=list)
    time_range_from: str | None = None
    time_range_to: str | None = None
    correlation_id: str = ""


@runtime_checkable
class SearchProvider(Protocol):
    def search(self, request: SearchRequest) -> list[RawSearchResult]:
        """Blocking search. Raises MorphoError (SEARCH_FAILED, retryable
        variants) on failure."""
        ...


@runtime_checkable
class EmbeddingProvider(Protocol):
    def embed(self, texts: list[str], *, model: str = "") -> list[list[float]]:
        """Blocking embedding. V0.1 uses the replaceable mock."""
        ...
