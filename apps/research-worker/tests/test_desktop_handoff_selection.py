"""Desktop handoff → worker-side FINAL adapter selection (round-2 review P1).

The Rust core's `worker_provider_env` (see apps/desktop/src-tauri/src/
secrets.rs) hands the desktop's Settings/keychain provider configuration to
the worker process through `MORPHO_PROVIDER_*` / `MORPHO_ROLE_*` /
`MORPHO_KEY_*` environment variables. These tests assert what the REVIEW
required on the worker side: after that handoff, the config/factory layer
actually SELECTS the desktop's provider for every LLM role — the built-in
defaults (glm/ollama-local) or a mock search adapter must never silently
take over.

The environment below mirrors the exact shape the Rust handoff emits for a
single configured provider (asserted on the Rust side by
`single_provider_handoff_routes_every_llm_role`); no real key value or
network endpoint is involved.
"""

from __future__ import annotations

import pytest

from morpho_worker.config import ProviderRole, WorkerConfig, from_env
from morpho_worker.providers.factory import ProviderFactory
from morpho_worker.serve import _configured_search_provider


def desktop_handoff_env() -> dict[str, str]:
    """The environment the Rust handoff emits for one configured provider
    (`custom`, resolved key in a child-process env var)."""

    return {
        "MORPHO_PROVIDER_CUSTOM_KIND": "llm",
        "MORPHO_PROVIDER_CUSTOM_BASE_URL": "https://provider.test/v1",
        "MORPHO_PROVIDER_CUSTOM_MODEL": "model-x",
        "MORPHO_PROVIDER_CUSTOM_KEY_REF": "env:MORPHO_KEY_CUSTOM",
        "MORPHO_PROVIDER_CUSTOM_PROTOCOL": "openai",
        "MORPHO_PROVIDER_CUSTOM_TIMEOUT": "30",
        "MORPHO_PROVIDER_CUSTOM_RETRIES": "1",
        "MORPHO_KEY_CUSTOM": "test-only-not-a-real-key",
        "MORPHO_ROLE_PLANNER": "custom",
        "MORPHO_ROLE_VALIDATION": "custom",
        "MORPHO_ROLE_EXTRACTION": "custom",
        "MORPHO_ROLE_SUMMARIZATION": "custom",
        "MORPHO_ROLE_CLASSIFICATION": "custom",
        # The embedding role deliberately stays un-routed (desktop V0.1 is
        # LLM-only; see ADR-025).
    }


def test_handoff_selects_the_desktop_provider_for_every_llm_role():
    env = desktop_handoff_env()
    config = from_env(env, base=WorkerConfig())
    assert config.offline_mock is False, "an explicit handoff is never offline"

    factory = ProviderFactory(config, env=env)
    for role in (
        ProviderRole.PLANNER,
        ProviderRole.VALIDATION,
        ProviderRole.EXTRACTION,
        ProviderRole.SUMMARIZATION,
        ProviderRole.CLASSIFICATION,
    ):
        provider, llm = factory.llm_for(role)
        assert provider is not None, f"{role.value} must not fall back to the mock"
        assert provider.provider_id == "custom"
        assert provider.base_url == "https://provider.test/v1"
        assert llm is not None
        assert not isinstance(llm, type(None))


def test_handoff_does_not_fall_back_to_builtin_defaults():
    """Without role routing the worker would silently run planner=glm and
    extraction=ollama-local (the round-2 defect); with the handoff's
    explicit MORPHO_ROLE_* every role resolves to the desktop provider."""

    config = from_env(desktop_handoff_env(), base=WorkerConfig())
    for role in ProviderRole:
        if role is ProviderRole.EMBEDDING:
            continue
        assert config.provider_for(role) is not None
        assert config.provider_for(role).provider_id == "custom", (
            f"{role.value} must route to the desktop provider, not the builtin default"
        )


def test_search_stays_mock_until_a_search_provider_is_configured():
    """The desktop V0.1 model has no search provider (LLM-only), so the
    handoff configures none — the worker's search stays the deterministic
    mock BY EXPLICIT ABSENCE, never by silent fallback. The second half
    documents what an explicit kind=search configuration selects once the
    desktop can express it (ADR-025)."""

    env = desktop_handoff_env()
    config = from_env(env, base=WorkerConfig())
    assert _configured_search_provider(config) is None

    explicit = dict(env)
    explicit.update(
        {
            "MORPHO_PROVIDER_MYSEARCH_KIND": "search",
            "MORPHO_PROVIDER_MYSEARCH_BASE_URL": "http://127.0.0.1:8888",
            "MORPHO_ROLE_EMBEDDING": "mock",
        }
    )
    search_config = from_env(explicit, base=WorkerConfig())
    assert search_config.providers["mysearch"].kind.value == "search"
    assert _configured_search_provider(search_config) == "mysearch"


def test_role_referencing_an_unconfigured_provider_is_a_structured_error():
    """A routed role whose provider is missing fails loudly — at config
    validation, before any adapter exists. Never a mock fallback."""

    env = desktop_handoff_env()
    env["MORPHO_ROLE_PLANNER"] = "not-configured-anywhere"
    with pytest.raises(Exception) as excinfo:
        from_env(env, base=WorkerConfig())
    assert "not configured" in str(excinfo.value)
