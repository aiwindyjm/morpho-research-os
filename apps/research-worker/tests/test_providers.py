import pytest

from morpho_worker.clock import FakeClock
from morpho_worker.config import (
    ProviderKind,
    ProviderRole,
    WorkerConfig,
    default_worker_config,
)
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.providers.factory import ProviderFactory
from morpho_worker.providers.mock import (
    MockEmbeddingProvider,
    MockLLMProvider,
    MockSearchProvider,
)
from morpho_worker.providers.openai_compat import (
    EndpointNotAllowed,
    OpenAICompatibleLLM,
    validate_endpoint,
)
from morpho_worker.providers.ports import LLMRequest, RawSearchResult, SearchRequest
from morpho_worker.providers.retry import RetryPolicy, RetryingProvider
from morpho_worker.providers.usage import estimate_cost
from pydantic import ValidationError

# Fixture credential material for the strong-model provider. The *name*
# matches the key reference in the default config; the value is an obvious
# test fixture, resolved at call time exactly like the real flow.
_provider_env_name = "GLM_API_KEY"
_provider_env_value = "resolved-fixture-value"


def glm_env():
    return {_provider_env_name: _provider_env_value}


def make_config(**overrides):
    data = default_worker_config().model_dump()
    data.update(overrides)
    return WorkerConfig.model_validate(data)


def ok_transport(payload, headers):
    return (
        200,
        {
            "model": payload.get("model", ""),
            "choices": [{"message": {"content": "{}"}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 3, "completion_tokens": 2},
        },
    )


def test_endpoint_rules_allow_https_and_loopback_http_only():
    assert validate_endpoint("https://open.bigmodel.cn/api/paas/v4/x")
    assert validate_endpoint("http://127.0.0.1:11434/v1/x")
    assert validate_endpoint("http://localhost:11434/v1/x")
    assert validate_endpoint("http://[::1]:11434/v1/x")
    with pytest.raises(EndpointNotAllowed):
        validate_endpoint("http://169.254.169.254/latest/meta-data")
    with pytest.raises(EndpointNotAllowed):
        validate_endpoint("http://internal-service.local/v1")
    with pytest.raises(EndpointNotAllowed):
        validate_endpoint("ftp://example.com")


def test_adapter_builds_expected_request_and_resolves_reference_from_env():
    captured = {}

    def transport(payload, headers):
        captured.update(payload=payload, headers=headers)
        return (
            200,
            {
                "model": "glm-4.6",
                "choices": [
                    {"message": {"content": '{"ok": true}'}, "finish_reason": "stop"}
                ],
                "usage": {"prompt_tokens": 11, "completion_tokens": 7},
            },
        )

    provider = make_config().providers["glm"]
    adapter = OpenAICompatibleLLM(
        provider, env=glm_env(), transport=transport
    )
    request = LLMRequest(model="", system="sys", prompt="user text", prompt_id="p", correlation_id="c1")
    response = adapter.complete(request)

    assert captured["payload"]["model"] == "glm-4.6"
    assert captured["payload"]["messages"] == [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "user text"},
    ]
    assert captured["payload"]["response_format"] == {"type": "json_object"}
    assert captured["headers"]["Authorization"] == f"Bearer {_provider_env_value}"
    assert response.text == '{"ok": true}'
    assert response.input_tokens == 11
    assert response.output_tokens == 7
    assert response.duration_ms >= 0


def test_adapter_missing_credential_is_clear_auth_error():
    provider = make_config().providers["glm"]
    adapter = OpenAICompatibleLLM(provider, env={}, transport=ok_transport)
    with pytest.raises(MorphoError) as excinfo:
        adapter.complete(LLMRequest(model="glm-4.6", prompt="hi"))
    assert excinfo.value.code is ErrorCode.PROVIDER_AUTH_FAILED
    assert excinfo.value.retryable is False
    # The error detail names the reference, never a value.
    assert "env:GLM_API_KEY" in excinfo.value.developer_detail


def test_adapter_maps_timeout_and_connection_errors():
    provider = make_config().providers["glm"]

    def timeout_transport(payload, headers):
        raise TimeoutError("too slow")

    def refused_transport(payload, headers):
        raise OSError("connection refused")

    with pytest.raises(MorphoError) as excinfo:
        OpenAICompatibleLLM(
            provider, env=glm_env(), transport=timeout_transport
        ).complete(LLMRequest(model="m", prompt="p"))
    assert excinfo.value.code is ErrorCode.PROVIDER_TIMEOUT
    assert excinfo.value.retryable is True

    with pytest.raises(MorphoError) as excinfo:
        OpenAICompatibleLLM(
            provider, env=glm_env(), transport=refused_transport
        ).complete(LLMRequest(model="m", prompt="p"))
    assert excinfo.value.code is ErrorCode.PROVIDER_UNAVAILABLE
    assert excinfo.value.retryable is True
    # The unavailability message is explicit for the user.
    assert "could not be reached" in excinfo.value.user_message


@pytest.mark.parametrize(
    "status,retryable",
    [(401, False), (403, False), (429, True), (500, True), (400, False)],
)
def test_adapter_maps_http_statuses(status, retryable):
    provider = make_config().providers["glm"]
    adapter = OpenAICompatibleLLM(
        provider,
        env=glm_env(),
        transport=lambda payload, headers: (status, {}),
    )
    with pytest.raises(MorphoError) as excinfo:
        adapter.complete(LLMRequest(model="glm-4.6", prompt="p"))
    assert excinfo.value.details["http_status"] == status
    assert excinfo.value.retryable is retryable


def test_mock_provider_scenarios_raise_documented_errors():
    provider = MockLLMProvider(
        scripted={
            "p.timeout": [MorphoError(ErrorCode.PROVIDER_TIMEOUT, "The model timed out.")],
            "p.auth": [MorphoError(ErrorCode.PROVIDER_AUTH_FAILED, "auth")],
            "p.unavail": [MorphoError(ErrorCode.PROVIDER_UNAVAILABLE, "down")],
            "p.bad": ["not-json"],
        }
    )
    with pytest.raises(MorphoError) as timeout_error:
        provider.complete(LLMRequest(model="m", prompt="p", prompt_id="p.timeout"))
    assert timeout_error.value.code is ErrorCode.PROVIDER_TIMEOUT
    with pytest.raises(MorphoError) as auth_error:
        provider.complete(LLMRequest(model="m", prompt="p", prompt_id="p.auth"))
    assert auth_error.value.code is ErrorCode.PROVIDER_AUTH_FAILED
    with pytest.raises(MorphoError) as unavailable_error:
        provider.complete(LLMRequest(model="m", prompt="p", prompt_id="p.unavail"))
    assert unavailable_error.value.code is ErrorCode.PROVIDER_UNAVAILABLE
    # The invalid-JSON scenario returns text; classification happens in the
    # parse/validate gate, not in the provider.
    assert provider.complete(LLMRequest(model="m", prompt="p", prompt_id="p.bad")).text == "not-json"


def test_retrying_provider_retries_then_succeeds_and_exhausts():
    flaky = MockSearchProvider(
        results=[RawSearchResult(title="t", url="https://example.test/a")],
        failures_before_success=2,
    )
    policy = RetryPolicy(max_attempts=3, backoff_seconds=0.0)
    wrapped = RetryingProvider(flaky, policy, clock=FakeClock())
    results = wrapped.search(SearchRequest(query="q"))
    assert len(results) == 1
    assert len(flaky.calls) == 3

    hopeless = MockSearchProvider(results=[], failures_before_success=99)
    wrapped2 = RetryingProvider(hopeless, policy, clock=FakeClock())
    with pytest.raises(MorphoError) as excinfo:
        wrapped2.search(SearchRequest(query="q"))
    # Retryable failures become final after exhausting attempts.
    assert excinfo.value.retryable is False
    assert excinfo.value.details["attempts"] == 3

    fatal = MockSearchProvider(
        results=[],
        failures_before_success=99,
        failure=MorphoError(ErrorCode.PROVIDER_AUTH_FAILED, "auth", retryable=False),
    )
    wrapped3 = RetryingProvider(fatal, policy, clock=FakeClock())
    with pytest.raises(MorphoError) as auth_exc:
        wrapped3.search(SearchRequest(query="q"))
    assert auth_exc.value.code is ErrorCode.PROVIDER_AUTH_FAILED
    assert len(fatal.calls) == 1  # non-retryable fails fast


def test_factory_routes_offline_mock_mode_without_config():
    factory = ProviderFactory(WorkerConfig(offline_mock=True))
    provider_config, llm = factory.llm_for(ProviderRole.PLANNER)
    assert provider_config is None
    assert isinstance(llm, MockLLMProvider)
    assert isinstance(factory.search_for(), RetryingProvider)
    assert isinstance(factory.embedding_for()[1], MockEmbeddingProvider)


def test_factory_routes_roles_to_configured_providers():
    config = make_config()
    factory = ProviderFactory(config, env=glm_env(), transport=ok_transport)
    planner_config, planner = factory.llm_for(ProviderRole.PLANNER)
    assert planner_config.provider_id == "glm"
    assert isinstance(planner, OpenAICompatibleLLM)
    _, validator = factory.llm_for(ProviderRole.VALIDATION)
    assert isinstance(validator, OpenAICompatibleLLM)


def test_factory_unconfigured_role_is_clear_error():
    # The config validator already rejects dangling roles at construction;
    # this test mutates a validated config (as an embedding host could) and
    # verifies the factory still fails with a clear structured error.
    config = make_config()
    config.providers.pop("glm")
    factory = ProviderFactory(config, env={})
    with pytest.raises(MorphoError) as excinfo:
        factory.llm_for(ProviderRole.PLANNER)
    assert excinfo.value.code is ErrorCode.PROVIDER_UNAVAILABLE
    assert "glm" in excinfo.value.user_message


def test_dangling_role_is_rejected_at_config_time():
    raw = make_config().model_dump()
    raw["providers"] = {
        key: value for key, value in raw["providers"].items() if key != "glm"
    }
    raw["roles"]["planner"] = "glm"
    with pytest.raises(ValidationError, match="not configured"):
        WorkerConfig.model_validate(raw)


def test_factory_offline_mode_needs_no_credentials_even_for_real_roles():
    factory = ProviderFactory(make_config(offline_mock=True), env={}, transport=None)
    _, planner = factory.llm_for(ProviderRole.PLANNER)
    assert isinstance(planner, MockLLMProvider)


def test_mock_embedding_is_deterministic():
    embedding = MockEmbeddingProvider(dimensions=8)
    first = embedding.embed(["abc", "abc", "different"])
    second = embedding.embed(["abc", "abc", "different"])
    assert first == second
    assert first[0] == first[1]
    assert first[0] != first[2]
    assert all(abs(sum(v * v for v in vector) - 1.0) < 1e-3 for vector in first)


def test_estimate_cost_is_none_without_pricing():
    assert (
        estimate_cost(
            input_tokens=100, output_tokens=50, cost_per_1k_input=None, cost_per_1k_output=None
        )
        is None
    )
    assert estimate_cost(
        input_tokens=1000, output_tokens=1000, cost_per_1k_input=0.001, cost_per_1k_output=0.002
    ) == pytest.approx(0.003)


def test_usage_record_rejects_negative_tokens():
    from morpho_worker.providers.usage import UsageRecord

    with pytest.raises(ValidationError):
        UsageRecord(usage_id="u1", provider_id="p", model="m", input_tokens=-1)
