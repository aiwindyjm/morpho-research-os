import pytest
from pydantic import BaseModel

from morpho_worker.clock import FakeClock
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.pipeline.prompts import PromptRegistry, parse_frontmatter, render_template
from morpho_worker.pipeline.structured import (
    StructuredOutputPipeline,
    parse_llm_json,
    validate_llm_payload,
)
from morpho_worker.providers.cache import InMemoryCache
from morpho_worker.providers.mock import MockLLMProvider
from morpho_worker.providers.retry import RetryPolicy
from morpho_worker.providers.usage import InMemoryUsageLedger

PLAN_PROMPT = """+++
prompt_id = "test.sample"
version = 1
purpose = "test asset"
input_schema_ref = "test.input.v1"
output_schema_ref = "test.output.v1"
+++

Answer about {{topic}} with depth {{depth}}.
"""

VALID_PAYLOAD = '{"title": "t", "count": 3}'
FENCED_PAYLOAD = "```json\n" + VALID_PAYLOAD + "\n```"
SCHEMA_INVALID_PAYLOAD = '{"unexpected": true}'


class SampleOutput(BaseModel):
    title: str
    count: int


@pytest.fixture()
def registry(tmp_path):
    area = tmp_path / "test"
    area.mkdir()
    (area / "sample.v1.md").write_text(PLAN_PROMPT, encoding="utf-8")
    return PromptRegistry(base_dir=tmp_path)


@pytest.fixture()
def clock():
    return FakeClock()


def make_pipeline(llm, registry, clock, cache=None, usage=None, attempts=3):
    return StructuredOutputPipeline(
        llm,
        registry,
        usage=usage,
        cache=cache,
        retry=RetryPolicy(max_attempts=attempts, backoff_seconds=0.0),
        clock=clock,
    )


def run_pipeline(pipeline, **overrides):
    kwargs = dict(
        prompt_id="test.sample",
        prompt_input={"topic": "entanglement", "depth": 3},
        output_schema=SampleOutput,
        normalize=lambda model: f"normalized:{model.title}:{model.count}",
        provider_id="mock",
        model="mock-model",
        run_id="run-1",
        task_id="task-1",
        correlation_id="corr-1",
    )
    kwargs.update(overrides)
    return pipeline.run(**kwargs)


def test_frontmatter_parsing_and_strict_rendering():
    metadata, body = parse_frontmatter(PLAN_PROMPT)
    assert metadata["prompt_id"] == "test.sample"
    assert metadata["version"] == 1
    assert "{{topic}}" in body
    assert (
        render_template(body, {"topic": "T", "depth": 2})
        == "Answer about T with depth 2."
    )
    with pytest.raises(ValueError, match="missing template variables"):
        render_template(body, {"topic": "T"})
    with pytest.raises(ValueError, match="frontmatter"):
        parse_frontmatter("no frontmatter here")


def test_registry_rejects_id_and_version_mismatch(tmp_path):
    area = tmp_path / "test"
    area.mkdir()
    # sample.v1.md declares a different id inside its frontmatter.
    wrong_id = PLAN_PROMPT.replace(
        'prompt_id = "test.sample"', 'prompt_id = "test.other"'
    )
    (area / "sample.v1.md").write_text(wrong_id, encoding="utf-8")
    # A file named v2 that still declares version 1 inside.
    (area / "sample.v2.md").write_text(PLAN_PROMPT, encoding="utf-8")
    registry = PromptRegistry(base_dir=tmp_path)
    with pytest.raises(ValueError, match="declares id"):
        registry.load("test.sample")
    with pytest.raises(ValueError, match="declares version"):
        registry.load("test.sample", version=2)
    with pytest.raises(FileNotFoundError):
        registry.load("test.missing")


def test_pipeline_parse_validate_normalize_happy_path(registry, clock):
    llm = MockLLMProvider(scripted={"test.sample": [FENCED_PAYLOAD]})
    pipeline = make_pipeline(llm, registry, clock)
    normalized, usage = run_pipeline(pipeline)
    assert normalized == "normalized:t:3"
    assert usage.status == "success"
    assert usage.input_tokens > 0
    assert usage.cache_hit is False


def test_pipeline_rejects_non_json_without_touching_domain(registry, clock):
    llm = MockLLMProvider(scripted={"test.sample": ["this is not json"]})
    pipeline = make_pipeline(llm, registry, clock, attempts=2)
    with pytest.raises(MorphoError) as excinfo:
        run_pipeline(pipeline)
    assert excinfo.value.code is ErrorCode.LLM_INVALID_JSON
    # After exhausting attempts the error is final (not retryable).
    assert excinfo.value.retryable is False
    assert excinfo.value.details["attempts"] == 2
    assert excinfo.value.details["last_error"]["details"]["phase"] == "parse"


def test_pipeline_rejects_schema_mismatch_with_phase_detail(registry, clock):
    llm = MockLLMProvider(scripted={"test.sample": [SCHEMA_INVALID_PAYLOAD]})
    pipeline = make_pipeline(llm, registry, clock, attempts=1)
    with pytest.raises(MorphoError) as excinfo:
        run_pipeline(pipeline)
    assert excinfo.value.details["last_error"]["details"]["phase"] == "schema_validation"
    assert excinfo.value.details["last_error"]["details"]["issues"]


def test_pipeline_retries_invalid_output_then_succeeds(registry, clock):
    llm = MockLLMProvider(
        scripted={
            "test.sample": [
                "garbage",
                SCHEMA_INVALID_PAYLOAD,
                VALID_PAYLOAD,
            ]
        }
    )
    usage = InMemoryUsageLedger()
    pipeline = make_pipeline(llm, registry, clock, usage=usage, attempts=3)
    normalized, usage_record = run_pipeline(pipeline)
    assert normalized == "normalized:t:3"
    assert usage_record.attempt == 3
    totals = usage.totals()
    assert totals["failures"] == 2
    assert totals["records"] == 3


def test_pipeline_provider_timeout_propagates_structured_error(registry, clock):
    llm = MockLLMProvider(
        scripted={
            "test.sample": [MorphoError(ErrorCode.PROVIDER_TIMEOUT, "The model timed out.")]
        }
    )
    pipeline = make_pipeline(llm, registry, clock, attempts=2)
    with pytest.raises(MorphoError) as excinfo:
        run_pipeline(pipeline)
    assert excinfo.value.code is ErrorCode.PROVIDER_TIMEOUT
    # Transport-level errors surface as-is; no final "invalid output" masking.
    assert excinfo.value.retryable is True


def test_pipeline_cache_hit_skips_provider(registry, clock):
    llm = MockLLMProvider(scripted={"test.sample": [VALID_PAYLOAD]})
    cache = InMemoryCache()
    usage = InMemoryUsageLedger()
    pipeline = make_pipeline(llm, registry, clock, cache=cache, usage=usage)
    first_normalized, first_usage = run_pipeline(pipeline)
    calls_after_first = len(llm.calls)
    second_normalized, second_usage = run_pipeline(pipeline)
    assert second_normalized == first_normalized
    assert len(llm.calls) == calls_after_first  # provider not consumed again
    assert second_usage.cache_hit is True
    assert second_usage.input_tokens == 0
    totals = usage.totals()
    assert totals["cache_hits"] == 1
    assert totals["input_tokens"] == first_usage.input_tokens


def test_pipeline_cache_key_changes_with_input_and_prompt(registry, clock):
    llm = MockLLMProvider(scripted={"test.sample": [VALID_PAYLOAD]})
    cache = InMemoryCache()
    pipeline = make_pipeline(llm, registry, clock, cache=cache)
    run_pipeline(pipeline)
    run_pipeline(pipeline, prompt_input={"topic": "other", "depth": 3})
    # A different normalized input is a cache miss: the provider is called again.
    assert len(llm.calls) == 2


def test_parse_llm_json_handles_fences_and_errors():
    assert parse_llm_json(VALID_PAYLOAD) == {"title": "t", "count": 3}
    assert parse_llm_json(FENCED_PAYLOAD) == {"title": "t", "count": 3}
    assert parse_llm_json("```json\n[1,2]\n```") == [1, 2]
    with pytest.raises(MorphoError) as excinfo:
        parse_llm_json("{broken", correlation_id="c1")
    assert excinfo.value.code is ErrorCode.LLM_INVALID_JSON
    assert excinfo.value.details["phase"] == "parse"
    assert excinfo.value.retryable is True


def test_validate_llm_payload_error_shape():
    with pytest.raises(MorphoError) as excinfo:
        validate_llm_payload({"nope": 1}, SampleOutput)
    assert excinfo.value.details["phase"] == "schema_validation"
    assert excinfo.value.retryable is True
