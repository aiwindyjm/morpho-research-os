import json
from pathlib import Path

import pytest

from morpho_worker.clock import FakeClock
from morpho_worker.domain.knowledge import KnowledgeType
from morpho_worker.domain.source import Source, SourceType
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.interfaces import StageContext
from morpho_worker.pipeline.prompts import PromptRegistry
from morpho_worker.pipeline.structured import StructuredOutputPipeline
from morpho_worker.providers.cache import InMemoryCache
from morpho_worker.providers.mock import MockLLMProvider
from morpho_worker.providers.retry import RetryPolicy
from morpho_worker.stages.extraction_stage import (
    ExtractionStage,
    SourceContentResolver,
    SourceEvaluator,
)

FIXTURES = Path(__file__).parent / "fixtures"
CONTENT = (
    "Quantum entanglement correlates distant particles. John Bell derived the "
    "Bell inequalities. The 2015 loophole-free experiments rejected local realism."
)


def make_source(content=CONTENT, **overrides):
    data = dict(
        source_id="src-1",
        url="https://example.test/bell",
        canonical_url="https://example.test/bell",
        url_dedup_key="dedup-1",
        title="Bell tests",
        source_type=SourceType.PAPER,
        published_at="2015-10-21",
        snippet=content,
        metadata={"content": content},
    )
    data.update(overrides)
    return Source.model_validate(data)


def context(**params):
    base = {"topic": "quantum entanglement"}
    base.update(params)
    return StageContext(run_id="run-1", task_id="task-1", dimension="history", params=base)


def fixture_text():
    return (FIXTURES / "extraction_output_quantum.json").read_text(encoding="utf-8")


def make_stage(script, cache=None, attempts=3):
    llm = MockLLMProvider(scripted={"extraction.source-extraction": list(script)})
    pipeline = StructuredOutputPipeline(
        llm,
        PromptRegistry(),
        cache=cache,
        retry=RetryPolicy(max_attempts=attempts, backoff_seconds=0.0),
        clock=FakeClock(),
    )
    stage = ExtractionStage(
        pipeline,
        provider_id="mock",
        model="mock-model",
        evaluator=SourceEvaluator(clock=FakeClock()),
        content_resolver=SourceContentResolver(cache=cache, clock=FakeClock()),
    )
    return stage, llm


def test_prompt_asset_renders_with_expected_variables():
    registry = PromptRegistry()
    asset, rendered = registry.render(
        "extraction.source-extraction",
        {
            "topic": "quantum entanglement",
            "dimension": "history",
            "content": "content text",
        },
    )
    assert asset.version == 1
    assert "content text" in rendered
    assert "verbatim quote" in asset.metadata["safety_constraints"]
    # Extraction is content-keyed: no title/url variables, so identical
    # content always produces an identical prompt (and cache key).
    assert "{{title}}" not in asset.template
    assert "{{url}}" not in asset.template


def test_content_resolver_caches_by_source_key():
    cache = InMemoryCache()
    resolver = SourceContentResolver(cache=cache, clock=FakeClock())
    first = resolver.resolve(make_source())
    second = resolver.resolve(make_source())
    assert first == second
    assert first.fingerprint


def test_content_level_dedup_same_content_one_extraction():
    cache = InMemoryCache()
    stage, llm = make_stage([fixture_text()], cache=cache)
    source_a = make_source()
    source_b = make_source(
        source_id="src-2",
        url="https://mirror.test/bell",
        canonical_url="https://mirror.test/bell",
        url_dedup_key="dedup-2",
    )
    result_a = stage.extract(source_a, stage.content_for(source_a), context())
    result_b = stage.extract(source_b, stage.content_for(source_b), context())
    # Identical content => identical extraction id => sink-level idempotency.
    assert result_a.extraction_id == result_b.extraction_id
    assert len(llm.calls) == 1  # LLM consumed once for the same content


def test_extraction_normalizes_and_dedups_within_result():
    cache = InMemoryCache()
    stage, _llm = make_stage([fixture_text()], cache=cache)
    source = make_source()
    result = stage.extract(source, stage.content_for(source), context())

    # The fixture contains a duplicate "John Bell" person entry.
    names = [(entity.name, entity.type) for entity in result.entities]
    assert len(names) == len(set(names))
    bell = [entity for entity in result.entities if entity.name == "John Bell"]
    assert len(bell) == 1
    assert bell[0].type is KnowledgeType.PERSON
    assert "J.S. Bell" in bell[0].aliases
    assert all(claim.quote for claim in result.claims)  # grounded quotes kept
    assert result.extraction_id


def test_extraction_is_idempotent_across_retries():
    cache = InMemoryCache()
    stage, llm = make_stage([fixture_text()], cache=cache)
    source = make_source()
    content = stage.content_for(source)
    first = stage.extract(source, content, context())
    second = stage.extract(source, content, context())
    assert first == second
    assert len(llm.calls) == 1  # cache absorbed the repeat


def test_blank_content_fails_deterministically():
    stage, _llm = make_stage([])
    source = make_source(content="   ")
    with pytest.raises(MorphoError) as excinfo:
        stage.extract(source, stage.content_for(source), context())
    assert excinfo.value.code is ErrorCode.SOURCE_PARSE_FAILED
    assert excinfo.value.retryable is False


def test_invalid_llm_output_is_retried_then_fails_without_partial_result():
    stage, llm = make_stage(["not json", "still not json"], attempts=2)
    source = make_source()
    with pytest.raises(MorphoError) as excinfo:
        stage.extract(source, stage.content_for(source), context())
    assert excinfo.value.code is ErrorCode.LLM_INVALID_JSON
    assert len(llm.calls) == 2


def test_source_quality_is_explainable_and_tiered():
    evaluator = SourceEvaluator(clock=FakeClock())
    content = stage_content(CONTENT)
    paper = evaluator.evaluate(
        make_source(), content, topic="quantum entanglement",
        dimension="history", requested_types=["paper"],
    )
    forum = evaluator.evaluate(
        make_source(
            source_id="s2",
            url="https://forum.test/t",
            canonical_url="https://forum.test/t",
            url_dedup_key="dedup-3",
            source_type=SourceType.FORUM,
            published_at=None,
        ),
        content,
        topic="quantum entanglement",
        dimension="history",
        requested_types=["paper"],
    )
    assert paper.tier in {"high", "medium", "low"}
    assert paper.overall > forum.overall
    assert len(paper.reasons) == 4
    # Every reason explains itself; quality never declares truth.
    assert "authority" in paper.reasons[0]
    assert "not a statement about the truth" in paper.note


def stage_content(text: str):
    from morpho_worker.domain.source import SourceContent
    from morpho_worker.ids import content_fingerprint

    return SourceContent(
        source_id="s", url_dedup_key="k", content=text,
        fingerprint=content_fingerprint(text),
    )


def test_freshness_decays_with_age():
    evaluator = SourceEvaluator(clock=FakeClock())
    content = stage_content(CONTENT)
    fresh = evaluator.evaluate(make_source(published_at="2025-06-01"), content)
    stale = evaluator.evaluate(make_source(published_at="2001-01-01"), content)
    unknown = evaluator.evaluate(make_source(published_at=None), content)
    assert fresh.freshness > stale.freshness
    assert stale.freshness >= 0.2  # bounded decay
    assert unknown.freshness == 0.5  # unknown is neutral


def test_extraction_stage_implements_port():
    from morpho_worker.interfaces import ExtractionStagePort

    stage, _llm = make_stage([])
    assert isinstance(stage, ExtractionStagePort)
