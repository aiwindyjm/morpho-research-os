"""Error-code contract audit (docs/api/ERRORS.md, PRD section 15).

Asserts that the five provider/pipeline codes the worker's consumers
depend on exist verbatim in :class:`morpho_worker.errors.ErrorCode` and
that every provider adapter and the structured-output gate maps failures
onto exactly those codes (no drift, no aliases with different strings).
"""

from __future__ import annotations

import pytest

from morpho_worker.config import ProviderConfig, ProviderKind
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.pipeline.structured import parse_llm_json, validate_llm_payload
from morpho_worker.providers.anthropic import AnthropicLLM
from morpho_worker.providers.gemini import GeminiLLM
from morpho_worker.providers.openai_compat import OpenAICompatibleLLM
from morpho_worker.providers.ports import LLMRequest

#: The audited codes and their exact on-the-wire strings.
AUDITED_CODES = {
    "PROVIDER_AUTH_FAILED": ErrorCode.PROVIDER_AUTH_FAILED,
    "PROVIDER_TIMEOUT": ErrorCode.PROVIDER_TIMEOUT,
    "SEARCH_FAILED": ErrorCode.SEARCH_FAILED,
    "SOURCE_PARSE_FAILED": ErrorCode.SOURCE_PARSE_FAILED,
    "LLM_INVALID_JSON": ErrorCode.LLM_INVALID_JSON,
}


def test_audited_error_codes_exist_verbatim():
    for text, code in AUDITED_CODES.items():
        assert code.value == text
        assert code.name == text
    # Serialization uses the same string in every envelope.
    error = MorphoError(ErrorCode.LLM_INVALID_JSON, "msg")
    assert error.to_dict()["code"] == "LLM_INVALID_JSON"


def test_pipeline_maps_invalid_output_to_llm_invalid_json():
    with pytest.raises(MorphoError) as parse_error:
        parse_llm_json("not json at all")
    assert parse_error.value.code is ErrorCode.LLM_INVALID_JSON
    assert parse_error.value.details["phase"] == "parse"

    from morpho_worker.domain.claims import Claim

    with pytest.raises(MorphoError) as schema_error:
        validate_llm_payload({"predicate": ""}, Claim)
    assert schema_error.value.code is ErrorCode.LLM_INVALID_JSON
    assert schema_error.value.details["phase"] == "schema_validation"


def _openai_compatible_provider():
    return ProviderConfig(
        provider_id="glm",
        kind=ProviderKind.LLM,
        base_url="https://open.bigmodel.test/v4",
        key_reference="env:GLM_API_KEY",
        model="m",
    )


def _native_providers():
    return [
        ProviderConfig(
            provider_id="anthropic",
            kind=ProviderKind.LLM,
            base_url="https://api.anthropic.com",
            key_reference="env:ANTHROPIC_API_KEY",
            model="m",
            protocol="anthropic",
        ),
        ProviderConfig(
            provider_id="gemini",
            kind=ProviderKind.LLM,
            base_url="https://generativelanguage.googleapis.com",
            key_reference="env:GEMINI_API_KEY",
            model="m",
            protocol="gemini",
        ),
    ]


def _adapters():
    env = {
        "GLM_API_KEY": "fixture",
        "ANTHROPIC_API_KEY": "fixture",
        "GEMINI_API_KEY": "fixture",
    }
    yield OpenAICompatibleLLM(_openai_compatible_provider(), env=env)
    for provider in _native_providers():
        if provider.protocol == "anthropic":
            yield AnthropicLLM(provider, env=env)
        else:
            yield GeminiLLM(provider, env=env)


@pytest.mark.parametrize("http_status", [401, 403])
def test_every_adapter_maps_auth_failures_to_provider_auth_failed(http_status):
    for adapter in _adapters():
        adapter._transport = lambda payload, headers: (http_status, {})
        with pytest.raises(MorphoError) as excinfo:
            adapter.complete(LLMRequest(model="m", prompt="p"))
        assert excinfo.value.code is ErrorCode.PROVIDER_AUTH_FAILED, type(adapter)


def test_every_adapter_maps_timeouts_to_provider_timeout():
    def timeout_transport(payload, headers):
        raise TimeoutError("too slow")

    for adapter in _adapters():
        adapter._transport = timeout_transport
        with pytest.raises(MorphoError) as excinfo:
            adapter.complete(LLMRequest(model="m", prompt="p"))
        assert excinfo.value.code is ErrorCode.PROVIDER_TIMEOUT, type(adapter)
        assert excinfo.value.retryable is True


def test_search_and_source_parse_codes_are_used_by_their_stages():
    # Audit by source inspection (behavior is covered by the stage tests):
    # the search layer must raise SEARCH_FAILED and the extraction layer
    # SOURCE_PARSE_FAILED - no drift to synonyms.
    import inspect

    from morpho_worker.providers import searxng
    from morpho_worker.stages import extraction_stage, search_stage

    assert "ErrorCode.SEARCH_FAILED" in inspect.getsource(searxng)
    assert "ErrorCode.SEARCH_FAILED" in inspect.getsource(search_stage)
    assert "ErrorCode.SOURCE_PARSE_FAILED" in inspect.getsource(extraction_stage)
