"""Provider factory: role routing to concrete adapters (draft; W2-03 freezes).

Rules (workgroup D first round):

- ``offline_mock`` mode or the reserved ``mock`` provider id always yields
  deterministic mock adapters - the offline pipeline must run without any
  network or credential.
- LLM roles resolve to the configured OpenAI-compatible adapter.
- Search stays on the mock adapter in V0.1; a configured non-mock search
  provider raises a clear structured error instead of silently pretending.
- Embeddings use the replaceable mock in V0.1 (no vector database).

When a configured model is unavailable the adapter raises the explicit
``PROVIDER_UNAVAILABLE`` error; the worker then either surfaces it or - when
the run was started in offline/mock mode - never contacts the provider at
all. Mock fallback for a *configured* provider is a user decision
(``offline_mock``), never a silent one.
"""

from __future__ import annotations

from typing import Mapping

from morpho_worker.clock import Clock, SystemClock
from morpho_worker.config import ProviderConfig, ProviderKind, ProviderRole, WorkerConfig
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.providers.mock import (
    MockEmbeddingProvider,
    MockLLMProvider,
    MockSearchProvider,
)
from morpho_worker.providers.ports import (
    EmbeddingProvider,
    LLMProvider,
    SearchProvider,
)
from morpho_worker.providers.openai_compat import HttpTransport, OpenAICompatibleLLM
from morpho_worker.providers.retry import RetryPolicy, RetryingProvider


class ProviderFactory:
    def __init__(
        self,
        config: WorkerConfig,
        *,
        env: Mapping[str, str] | None = None,
        transport: HttpTransport | None = None,
        clock: Clock | None = None,
    ) -> None:
        self.config = config
        self._env = dict(env or {})
        self._transport = transport
        self._clock = clock or SystemClock()

    # LLM -----------------------------------------------------------------

    def llm_for(self, role: ProviderRole) -> tuple[ProviderConfig | None, LLMProvider]:
        provider_id = getattr(self.config.roles, role.value)
        if self.config.offline_mock or provider_id == "mock":
            return None, MockLLMProvider()
        provider = self.config.providers.get(provider_id)
        if provider is None:
            raise MorphoError(
                ErrorCode.PROVIDER_UNAVAILABLE,
                f"The {role.value} role references provider {provider_id!r}, which is not configured.",
                retryable=False,
            )
        if provider.kind is not ProviderKind.LLM:
            raise MorphoError(
                ErrorCode.PROVIDER_UNAVAILABLE,
                f"The {role.value} role requires an LLM provider, but {provider_id!r} is a {provider.kind.value} provider.",
                retryable=False,
            )
        adapter = OpenAICompatibleLLM(provider, env=self._env, transport=self._transport)
        return provider, adapter

    # Search ----------------------------------------------------------------

    def search_for(self, *, fixture_results=None) -> SearchProvider:
        """V0.1 ships the mock search adapter only; real search adapters
        follow the W2-03 freeze and the RES-03 adapter boundary."""

        mock = MockSearchProvider(results=fixture_results or ())
        return RetryingProvider(
            mock, RetryPolicy(max_attempts=1, backoff_seconds=0.0), clock=self._clock
        )

    # Embeddings -----------------------------------------------------------

    def embedding_for(self) -> tuple[ProviderConfig | None, EmbeddingProvider]:
        return None, MockEmbeddingProvider()

    # Retry policy -----------------------------------------------------------

    def retry_policy_for(self, provider: ProviderConfig | None) -> RetryPolicy:
        if provider is None:
            return RetryPolicy(max_attempts=1, backoff_seconds=0.0)
        return RetryPolicy(
            max_attempts=provider.max_retries + 1,
            backoff_seconds=provider.retry_backoff_seconds,
        )
