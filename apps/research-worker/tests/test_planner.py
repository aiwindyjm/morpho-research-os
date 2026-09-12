import json
from pathlib import Path

import pytest

from morpho_worker.clock import FakeClock
from morpho_worker.domain.research import PlanStatus, ResearchConfig, RuntimeTaskType
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.interfaces import MockPlanner
from morpho_worker.pipeline.prompts import PromptRegistry
from morpho_worker.pipeline.structured import StructuredOutputPipeline
from morpho_worker.providers.cache import InMemoryCache
from morpho_worker.providers.mock import MockLLMProvider
from morpho_worker.providers.retry import RetryPolicy
from morpho_worker.providers.usage import InMemoryUsageLedger
from morpho_worker.stages.planner import LLMPlanner, normalize_plan_output
from morpho_worker.stores import PlanStore

FIXTURES = Path(__file__).parent / "fixtures"


def quantum_config(**overrides):
    data = {
        "domain": "physics",
        "topic": "quantum entanglement",
        "purpose": "learning",
        "depth": 3,
        "dimensions": ["concepts", "history", "experiments"],
        "languages": ["en"],
        "source_types": ["paper", "web_page"],
    }
    data.update(overrides)
    return ResearchConfig.model_validate(data)


def make_planner(script, cache=None, usage=None, attempts=3):
    llm = MockLLMProvider(scripted={"planner.plan-draft": list(script)})
    pipeline = StructuredOutputPipeline(
        llm,
        PromptRegistry(),
        usage=usage,
        cache=cache,
        retry=RetryPolicy(max_attempts=attempts, backoff_seconds=0.0),
        clock=FakeClock(),
    )
    return (
        LLMPlanner(pipeline, provider_id="mock", model="mock-model", clock=FakeClock()),
        llm,
    )


def fixture_payload():
    return (FIXTURES / "planner_output_quantum.json").read_text(encoding="utf-8")


def test_prompt_asset_exists_and_renders():
    registry = PromptRegistry()
    asset, rendered = registry.render(
        "planner.plan-draft",
        {
            "domain": "physics",
            "topic": "quantum entanglement",
            "purpose": "learning",
            "depth": 3,
            "dimensions": "concepts, history",
            "languages": "en",
            "source_types": "paper",
        },
    )
    assert asset.version == 1
    assert "quantum entanglement" in rendered
    assert asset.metadata["prompt_id"] == "planner.plan-draft"
    # The safety constraints are part of the frozen prompt, not an afterthought.
    assert "approval" in asset.metadata["safety_constraints"]


def test_llm_planner_produces_pending_review_plan_covering_dimensions():
    planner, _llm = make_planner([fixture_payload()])
    plan = planner.draft_plan(quantum_config(), project_id="proj-1")
    assert plan.status is PlanStatus.PENDING_REVIEW
    assert plan.project_id == "proj-1"
    dimensions = [section.dimension for section in plan.sections]
    # "Concepts" normalizes to the configured spelling; the missing
    # "experiments" dimension is backfilled deterministically.
    assert dimensions == ["concepts", "history", "experiments"]
    assert all(section.tasks for section in plan.sections)
    assert all(
        task.runtime_type is RuntimeTaskType.SEARCH
        for section in plan.sections
        for task in section.tasks
    )


def test_llm_planner_is_recoverable_after_invalid_output():
    usage = InMemoryUsageLedger()
    planner, llm = make_planner(["this is not json", fixture_payload()], usage=usage)
    plan = planner.draft_plan(quantum_config())
    assert plan.status is PlanStatus.PENDING_REVIEW
    assert len(llm.calls) == 2
    totals = usage.totals()
    assert totals["failures"] == 1
    assert totals["records"] == 2


def test_llm_planner_permanently_invalid_output_never_returns_partial_plan():
    planner, llm = make_planner(["still not json"], attempts=2)
    with pytest.raises(MorphoError) as excinfo:
        planner.draft_plan(quantum_config())
    assert excinfo.value.code is ErrorCode.LLM_INVALID_JSON
    assert excinfo.value.retryable is False
    assert len(llm.calls) == 2


def test_planner_output_is_cached_per_config():
    cache = InMemoryCache()
    planner, llm = make_planner([fixture_payload()], cache=cache)
    config = quantum_config()
    first = planner.draft_plan(config)
    second = planner.draft_plan(config)
    assert first.plan_id == second.plan_id
    assert len(llm.calls) == 1  # second draft came from the cache


def test_normalize_backfills_missing_dimensions_and_defaults():
    payload = json.loads(fixture_payload())
    payload["sections"] = [
        {"dimension": "HISTORY", "title": "  ", "objective": "", "tasks": []}
    ]
    plan = normalize_plan_output(
        __import__("morpho_worker.stages.planner", fromlist=["PlannerOutput"]).PlannerOutput.model_validate(
            payload
        ),
        config=quantum_config(),
    )
    assert [section.dimension for section in plan.sections] == [
        "history",
        "concepts",
        "experiments",
    ]
    history = plan.sections[0]
    assert history.title  # default title filled
    assert history.tasks  # default search task filled


def test_plan_store_lifecycle_and_execution_gate():
    clock = FakeClock()
    store = PlanStore(clock=clock)
    planner = MockPlanner(clock=clock)
    config = quantum_config()
    plan = planner.draft_plan(config, project_id="p1")
    store.save(plan)

    with pytest.raises(MorphoError) as excinfo:
        store.require_approved(plan.plan_id)
    assert excinfo.value.code is ErrorCode.PLAN_NOT_APPROVED

    approved = store.approve(plan.plan_id, note="looks good")
    assert approved.status is PlanStatus.APPROVED
    assert store.require_approved(plan.plan_id).status is PlanStatus.APPROVED

    revised = store.revise(plan.plan_id, planner.draft_plan(config))
    assert revised.plan_version == 2
    assert revised.status is PlanStatus.PENDING_REVIEW
    # A revision restarts review: execution stays gated on the latest
    # version even though v1 was approved earlier.
    with pytest.raises(MorphoError) as excinfo:
        store.require_approved(plan.plan_id)
    assert excinfo.value.code is ErrorCode.PLAN_NOT_APPROVED
    # v1's approval is kept as history; the gate always reads the latest.
    assert store.get(plan.plan_id, version=1).status is PlanStatus.APPROVED


def test_plan_store_supersedes_pending_draft_on_revision():
    clock = FakeClock()
    store = PlanStore(clock=clock)
    planner = MockPlanner(clock=clock)
    config = quantum_config()
    plan = planner.draft_plan(config)
    store.save(plan)
    store.revise(plan.plan_id, planner.draft_plan(config))
    # A superseded pending draft keeps its history but is marked replaced.
    assert store.get(plan.plan_id, version=1).status is PlanStatus.SUPERSEDED
    assert store.get(plan.plan_id).status is PlanStatus.PENDING_REVIEW


def test_plan_store_reject_then_approve_roundtrip():
    clock = FakeClock()
    store = PlanStore(clock=clock)
    plan = MockPlanner(clock=clock).draft_plan(quantum_config())
    store.save(plan)
    rejected = store.reject(plan.plan_id, note="wrong focus")
    assert rejected.status is PlanStatus.REJECTED
    assert store.get(plan.plan_id).reviewer_note == "wrong focus"
    reapproved = store.approve(plan.plan_id, note="fixed focus")
    assert reapproved.status is PlanStatus.APPROVED


def test_offline_mock_planner_flows_through_the_same_gate():
    clock = FakeClock()
    store = PlanStore(clock=clock)
    plan = MockPlanner(clock=clock).draft_plan(quantum_config())
    store.save(plan)
    store.approve(plan.plan_id)
    assert store.require_approved(plan.plan_id).config.topic == "quantum entanglement"
