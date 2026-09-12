"""Native Claude (Anthropic) and Gemini adapter tests.

Mirrors ``test_providers.py`` for the native adapters: request shape, auth
headers, response parsing, and error mapping - all through injected fake
transports, never a real network, with fixture credentials built at runtime.
"""

import pytest
from pydantic import ValidationError

from morpho_worker.config import (
    ProviderConfig,
    ProviderKind,
    ProviderRole,
    ProviderRoles,
    WorkerConfig,
)
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.providers.anthropic import (
    ANTHROPIC_VERSION,
    AnthropicLLM,
)
from morpho_worker.providers.factory import ProviderFactory
from morpho_worker.providers.gemini import GeminiLLM, endpoint_url
from morpho_worker.providers.ports import LLMRequest

ANTHROPIC_ENV_NAME = "ANTHROPIC_API_KEY"
ANTHROPIC_ENV_VALUE = "anthropic-fixture-value"
GEMINI_ENV_NAME = "GEMINI_API_KEY"
GEMINI_ENV_VALUE = "gemini-fixture-value"


def anthropic_provider(**overrides) -> ProviderConfig:
    data = dict(
        provider_id="anthropic",
        kind=ProviderKind.LLM,
        base_url="https://api.anthropic.com",
        key_reference=f"env:{ANTHROPIC_ENV_NAME}",
        model="claude-sonnet-fixture",
        protocol="anthropic",
    )
    data.update(overrides)
    return ProviderConfig.model_validate(data)


def gemini_provider(**overrides) -> ProviderConfig:
    data = dict(
        provider_id="gemini",
        kind=ProviderKind.LLM,
        base_url="https://generativelanguage.googleapis.com",
        key_reference=f"env:{GEMINI_ENV_NAME}",
        model="gemini-fixture",
        protocol="gemini",
    )
    data.update(overrides)
    return ProviderConfig.model_validate(data)


def request(**overrides) -> LLMRequest:
    data = dict(model="", system="sys text", prompt="user text", prompt_id="p",
                correlation_id="c1")
    data.update(overrides)
    return LLMRequest(**data)


def anthropic_ok(payload, headers):
    return (
        200,
        {
            "model": payload["model"],
            "content": [{"type": "text", "text": '{"ok": '}, {"type": "text", "text": 'true}'}],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 13, "output_tokens": 5},
        },
    )


def gemini_ok(payload, headers):
    return (
        200,
        {
            "modelVersion": "gemini-fixture",
            "candidates": [
                {
                    "content": {"parts": [{"text": '{"ok": '}, {"text": "true}"}]},
                    "finishReason": "STOP",
                }
            ],
            "usageMetadata": {"promptTokenCount": 17, "candidatesTokenCount": 6},
        },
    )


# Anthropic ------------------------------------------------------------------


def test_anthropic_request_shape_and_auth_header():
    captured = {}

    def transport(payload, headers):
        captured.update(payload=payload, headers=headers)
        return anthropic_ok(payload, headers)

    adapter = AnthropicLLM(
        anthropic_provider(), env={ANTHROPIC_ENV_NAME: ANTHROPIC_ENV_VALUE},
        transport=transport,
    )
    response = adapter.complete(request(temperature=0.2, max_output_tokens=512))

    assert captured["payload"]["model"] == "claude-sonnet-fixture"
    assert captured["payload"]["messages"] == [{"role": "user", "content": "user text"}]
    assert captured["payload"]["system"] == "sys text"
    assert captured["payload"]["max_tokens"] == 512
    assert captured["payload"]["temperature"] == 0.2
    assert captured["headers"]["x-api-key"] == ANTHROPIC_ENV_VALUE
    assert captured["headers"]["anthropic-version"] == ANTHROPIC_VERSION
    # Text blocks concatenate; usage maps through.
    assert response.text == '{"ok": true}'
    assert response.input_tokens == 13
    assert response.output_tokens == 5
    assert response.finish_reason == "end_turn"
    assert response.provider_id == "anthropic"


def test_anthropic_missing_credential_is_auth_error():
    adapter = AnthropicLLM(anthropic_provider(), env={}, transport=anthropic_ok)
    with pytest.raises(MorphoError) as excinfo:
        adapter.complete(request())
    assert excinfo.value.code is ErrorCode.PROVIDER_AUTH_FAILED
    assert excinfo.value.retryable is False
    # The error names the reference, never the value.
    assert f"env:{ANTHROPIC_ENV_NAME}" in excinfo.value.developer_detail


def test_anthropic_maps_timeout_to_provider_timeout():
    def timeout_transport(payload, headers):
        raise TimeoutError("too slow")

    adapter = AnthropicLLM(
        anthropic_provider(), env={ANTHROPIC_ENV_NAME: ANTHROPIC_ENV_VALUE},
        transport=timeout_transport,
    )
    with pytest.raises(MorphoError) as excinfo:
        adapter.complete(request())
    assert excinfo.value.code is ErrorCode.PROVIDER_TIMEOUT
    assert excinfo.value.retryable is True


@pytest.mark.parametrize("status", [401, 403])
def test_anthropic_maps_auth_failures(status):
    adapter = AnthropicLLM(
        anthropic_provider(), env={ANTHROPIC_ENV_NAME: ANTHROPIC_ENV_VALUE},
        transport=lambda payload, headers: (status, {}),
    )
    with pytest.raises(MorphoError) as excinfo:
        adapter.complete(request())
    assert excinfo.value.code is ErrorCode.PROVIDER_AUTH_FAILED
    assert excinfo.value.details["http_status"] == status


@pytest.mark.parametrize("status,retryable", [(429, True), (500, True), (400, False)])
def test_anthropic_maps_other_http_statuses(status, retryable):
    adapter = AnthropicLLM(
        anthropic_provider(), env={ANTHROPIC_ENV_NAME: ANTHROPIC_ENV_VALUE},
        transport=lambda payload, headers: (status, {}),
    )
    with pytest.raises(MorphoError) as excinfo:
        adapter.complete(request())
    assert excinfo.value.code is ErrorCode.PROVIDER_UNAVAILABLE
    assert excinfo.value.retryable is retryable


def test_anthropic_unreadable_response_is_unavailable():
    adapter = AnthropicLLM(
        anthropic_provider(), env={ANTHROPIC_ENV_NAME: ANTHROPIC_ENV_VALUE},
        transport=lambda payload, headers: (200, {"unexpected": True}),
    )
    with pytest.raises(MorphoError) as excinfo:
        adapter.complete(request())
    assert excinfo.value.code is ErrorCode.PROVIDER_UNAVAILABLE


# Gemini -----------------------------------------------------------------------


def test_gemini_request_shape_and_auth_header():
    captured = {}

    def transport(payload, headers):
        captured.update(payload=payload, headers=headers)
        return gemini_ok(payload, headers)

    adapter = GeminiLLM(
        gemini_provider(), env={GEMINI_ENV_NAME: GEMINI_ENV_VALUE}, transport=transport,
    )
    response = adapter.complete(request(expect_json=True))

    assert captured["payload"]["contents"] == [
        {"role": "user", "parts": [{"text": "user text"}]}
    ]
    assert captured["payload"]["systemInstruction"] == {"parts": [{"text": "sys text"}]}
    config = captured["payload"]["generationConfig"]
    assert config["responseMimeType"] == "application/json"
    assert config["maxOutputTokens"] == 2048
    assert captured["headers"]["x-goog-api-key"] == GEMINI_ENV_VALUE
    assert "Authorization" not in captured["headers"]
    assert response.text == '{"ok": true}'
    assert response.input_tokens == 17
    assert response.output_tokens == 6
    assert response.finish_reason == "STOP"


def test_gemini_endpoint_url_quotes_the_model():
    assert endpoint_url("https://x.test/", "gemini-2.5 pro") == (
        "https://x.test/v1beta/models/gemini-2.5%20pro:generateContent"
    )


def test_gemini_missing_credential_is_auth_error():
    adapter = GeminiLLM(gemini_provider(), env={}, transport=gemini_ok)
    with pytest.raises(MorphoError) as excinfo:
        adapter.complete(request())
    assert excinfo.value.code is ErrorCode.PROVIDER_AUTH_FAILED
    assert f"env:{GEMINI_ENV_NAME}" in excinfo.value.developer_detail


def test_gemini_maps_timeout_to_provider_timeout():
    def timeout_transport(payload, headers):
        raise TimeoutError("too slow")

    adapter = GeminiLLM(
        gemini_provider(), env={GEMINI_ENV_NAME: GEMINI_ENV_VALUE},
        transport=timeout_transport,
    )
    with pytest.raises(MorphoError) as excinfo:
        adapter.complete(request())
    assert excinfo.value.code is ErrorCode.PROVIDER_TIMEOUT


@pytest.mark.parametrize("status", [401, 403])
def test_gemini_maps_auth_failures(status):
    adapter = GeminiLLM(
        gemini_provider(), env={GEMINI_ENV_NAME: GEMINI_ENV_VALUE},
        transport=lambda payload, headers: (status, {}),
    )
    with pytest.raises(MorphoError) as excinfo:
        adapter.complete(request())
    assert excinfo.value.code is ErrorCode.PROVIDER_AUTH_FAILED


def test_gemini_unreadable_response_is_unavailable():
    adapter = GeminiLLM(
        gemini_provider(), env={GEMINI_ENV_NAME: GEMINI_ENV_VALUE},
        transport=lambda payload, headers: (200, {"candidates": []}),
    )
    with pytest.raises(MorphoError) as excinfo:
        adapter.complete(request())
    assert excinfo.value.code is ErrorCode.PROVIDER_UNAVAILABLE


# Config + factory routing ------------------------------------------------------


def test_protocol_field_rejects_unknown_values():
    with pytest.raises(ValidationError):
        anthropic_provider(protocol="bedrock")


def test_default_config_registers_native_adapters_unrouted():
    from morpho_worker.config import default_worker_config

    config = default_worker_config()
    anthropic = config.providers["anthropic"]
    gemini = config.providers["gemini"]
    assert anthropic.protocol == "anthropic" and gemini.protocol == "gemini"
    # Unrouted and model-less: accidental use fails loudly, never silently.
    assert anthropic.model == "" and gemini.model == ""
    roles = config.roles.model_dump()
    assert "anthropic" not in roles.values() and "gemini" not in roles.values()


def test_factory_routes_protocol_to_native_adapter():
    config = WorkerConfig(
        providers={
            "anthropic": anthropic_provider(),
            "gemini": gemini_provider(),
        },
        roles=ProviderRoles(planner="anthropic", validation="gemini"),
    )
    factory = ProviderFactory(
        config,
        env={ANTHROPIC_ENV_NAME: ANTHROPIC_ENV_VALUE, GEMINI_ENV_NAME: GEMINI_ENV_VALUE},
        transport=anthropic_ok,
    )
    provider_config, adapter = factory.llm_for(ProviderRole.PLANNER)
    assert provider_config.provider_id == "anthropic"
    assert isinstance(adapter, AnthropicLLM)
    _, validator = factory.llm_for(ProviderRole.VALIDATION)
    assert isinstance(validator, GeminiLLM)


def test_provider_env_declares_protocol():
    from morpho_worker.config import from_env

    config = from_env(
        {
            "MORPHO_PROVIDER_BEDROCK_CLAUDE_KIND": "llm",
            "MORPHO_PROVIDER_BEDROCK_CLAUDE_PROTOCOL": "Anthropic",
            "MORPHO_PROVIDER_BEDROCK_CLAUDE_MODEL": "some-model",
            "MORPHO_PROVIDER_BEDROCK_CLAUDE_BASE_URL": "https://api.anthropic.com",
        }
    )
    provider = config.providers["bedrock-claude"]
    assert provider.protocol == "anthropic"
    assert provider.model == "some-model"
