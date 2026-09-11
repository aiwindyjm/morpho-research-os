import pytest
from pydantic import ValidationError

from morpho_worker.config import (
    ProviderConfig,
    ProviderKind,
    ProviderRole,
    ProviderRoles,
    WorkerConfig,
    default_worker_config,
    from_env,
    resolve_key_reference,
)


def test_default_config_uses_mock_roles_and_no_providers():
    config = WorkerConfig()
    assert config.offline_mock is False
    assert config.providers == {}
    assert all(
        getattr(config.roles, role.value) == "mock" for role in ProviderRole
    )
    assert config.provider_for(ProviderRole.PLANNER) is None


def test_documented_default_routing_local_extraction_strong_planner():
    config = default_worker_config()
    assert config.provider_for(ProviderRole.EXTRACTION).model == "qwen3:8b"
    assert config.providers["ollama-local-fallback"].model == "qwen2.5:7b"
    assert config.provider_for(ProviderRole.PLANNER).provider_id == "glm"
    assert config.provider_for(ProviderRole.VALIDATION).provider_id == "glm"
    assert config.provider_for(ProviderRole.EMBEDDING) is None
    # Local Ollama needs no credential; the strong model uses a reference only.
    assert config.providers["ollama-local"].key_reference == ""
    assert config.providers["glm"].key_reference == "env:GLM_API_KEY"


@pytest.mark.parametrize(
    "raw_reference",
    [
        "raw-literal-not-a-reference-1",
        "raw-literal-not-a-reference-2",
        "raw-literal-not-a-reference-3",
    ],
)
def test_key_reference_rejects_non_reference_values(raw_reference):
    with pytest.raises(ValidationError):
        ProviderConfig(
            provider_id="glm",
            kind=ProviderKind.LLM,
            key_reference=raw_reference,
        )


@pytest.mark.parametrize("reference", ["", "env:GLM_API_KEY", "keychain:glm-primary"])
def test_key_reference_accepts_references(reference):
    provider = ProviderConfig(provider_id="p1", kind=ProviderKind.LLM, key_reference=reference)
    assert provider.key_reference == reference


def test_config_never_holds_resolved_values():
    # Values are resolved only at call time; they can never be part of the
    # config object, its serialized form, or its repr.
    provider_env_name = "GLM_API_KEY"
    resolved = "resolved-at-call-time-only"
    env = {provider_env_name: resolved}
    config = default_worker_config()
    assert resolved not in config.model_dump_json()
    assert resolved not in repr(config)
    assert resolve_key_reference(config.providers["glm"].key_reference, env) == resolved
    assert resolved not in config.model_dump_json()


def test_resolve_key_reference_semantics():
    env = {"NAME": "fixture-value"}
    assert resolve_key_reference("env:NAME", env) == "fixture-value"
    assert resolve_key_reference("env:MISSING", env) is None
    assert resolve_key_reference("keychain:glm", env) is None
    assert resolve_key_reference("", env) is None


def test_role_must_reference_configured_provider():
    with pytest.raises(ValidationError, match="not configured"):
        WorkerConfig(roles=ProviderRoles(planner="glm"))


def test_extra_fields_rejected():
    with pytest.raises(ValidationError):
        WorkerConfig(unknown_field=1)
    with pytest.raises(ValidationError):
        ProviderConfig(provider_id="p", kind="llm", unexpected="raw-literal")


def test_bounds_validated():
    with pytest.raises(ValidationError):
        WorkerConfig(max_concurrency=0)
    with pytest.raises(ValidationError):
        ProviderConfig(provider_id="p", kind="llm", timeout_seconds=0)
    with pytest.raises(ValidationError):
        ProviderConfig(provider_id="p", kind="llm", max_retries=11)


def test_from_env_offline_and_overrides():
    env = {
        "MORPHO_WORKER_OFFLINE": "1",
        "MORPHO_MAX_CONCURRENCY": "4",
        "MORPHO_PROMPTS_DIR": "/tmp/prompts",
        "MORPHO_PROVIDER_GLM_MODEL": "glm-custom",
        "MORPHO_PROVIDER_GLM_TIMEOUT": "30",
        "MORPHO_PROVIDER_CUSTOM_KIND": "llm",
        "MORPHO_PROVIDER_CUSTOM_BASE_URL": "http://localhost:9000/v1",
        "MORPHO_PROVIDER_CUSTOM_MODEL": "small",
        "MORPHO_PROVIDER_CUSTOM_KEY_REF": "env:CUSTOM_REFERENCE",
        "MORPHO_ROLE_EXTRACTION": "custom",
    }
    config = from_env(env)
    assert config.offline_mock is True
    assert config.max_concurrency == 4
    assert config.prompts_dir == "/tmp/prompts"
    assert config.providers["glm"].model == "glm-custom"
    assert config.providers["glm"].timeout_seconds == 30
    assert config.providers["custom"].base_url == "http://localhost:9000/v1"
    assert config.providers["custom"].key_reference == "env:CUSTOM_REFERENCE"
    assert config.provider_for(ProviderRole.EXTRACTION).provider_id == "custom"
    # Untouched roles keep documented defaults.
    assert config.provider_for(ProviderRole.PLANNER).provider_id == "glm"


def test_from_env_missing_values_keep_defaults():
    config = from_env({})
    assert config == default_worker_config()


def test_from_env_rejects_non_reference_key_ref():
    with pytest.raises(ValidationError):
        from_env({"MORPHO_PROVIDER_GLM_KEY_REF": "raw-literal-not-a-reference"})


def test_from_env_bad_number_is_clear_error():
    with pytest.raises(ValueError):
        from_env({"MORPHO_MAX_CONCURRENCY": "many"})
