"""Offline end-to-end pipeline test (workgroup D acceptance).

Runs the full chain with deterministic mocks and no network::

    ResearchConfig -> Planner -> Plan review -> approved plan
    -> Task DAG (search -> dynamic extract fan-out -> normalize -> claims
       -> validate fan-in)
    -> validated records in the result sink

Covers: plan gating, DAG execution, canonical/URL dedup, content-level
extraction dedup, strict Source/Evidence/Claim/Knowledge layering,
parse->validate->normalize for every LLM call, usage traceability with
cache hits, and redacted events.
"""

import json
from pathlib import Path

import pytest

from morpho_worker.clock import FakeClock
from morpho_worker.config import default_worker_config
from morpho_worker.dag.states import RunStatus, TaskStatus
from morpho_worker.domain.research import PlanStatus, ResearchConfig, RuntimeTaskType
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.events import EventLog
from morpho_worker.interfaces import InMemoryResultSink, MockPlanner
from morpho_worker.orchestrator import ResearchOrchestrator
from morpho_worker.pipeline.prompts import PromptRegistry
from morpho_worker.pipeline.structured import StructuredOutputPipeline
from morpho_worker.providers.cache import InMemoryCache
from morpho_worker.providers.factory import ProviderFactory
from morpho_worker.providers.mock import MockLLMProvider, MockSearchProvider
from morpho_worker.providers.ports import RawSearchResult
from morpho_worker.providers.openai_compat import OpenAICompatibleLLM
from morpho_worker.providers.retry import RetryPolicy
from morpho_worker.providers.usage import InMemoryUsageLedger
from morpho_worker.stages.claims_stage import ClaimBuilder, ValidationStage
from morpho_worker.stages.extraction_stage import (
    ExtractionStage,
    SourceContentResolver,
    SourceEvaluator,
)
from morpho_worker.stages.normalization_stage import (
    EntityNormalizer,
    RelationNormalizer,
)
from morpho_worker.stages.planner import LLMPlanner
from morpho_worker.stages.search_stage import SearchStage
from morpho_worker.stores import PlanStore

FIXTURES = Path(__file__).parent / "fixtures"

CONTENT_CONCEPTS = (
    "Quantum entanglement correlates distant particles. No local hidden-variable "
    "model can reproduce the observed correlations. Entanglement requires "
    "nonclassical correlations between measurement outcomes."
)
CONTENT_HISTORY = (
    "John Bell derived his inequalities while working at CERN. Bell published "
    "the inequality in 1964. The 2015 loophole-free experiments rejected local realism."
)


def quantum_config():
    return ResearchConfig.model_validate(
        {
            "domain": "physics",
            "topic": "quantum entanglement",
            "purpose": "learning",
            "depth": 3,
            "dimensions": ["concepts", "history"],
            "languages": ["en"],
            "source_types": ["paper", "web_page"],
        }
    )


def search_results(*, include_conflict: bool = False):
    results = [
        RawSearchResult(
            title="Entanglement concepts",
            url="https://concepts.test/page?utm_source=x",
            source_type="paper",
            published_at="2024-05-01",
            content=CONTENT_CONCEPTS,
        ),
        RawSearchResult(
            # Canonical duplicate of the first URL (tracking param + case).
            title="Entanglement concepts (mirror listing)",
            url="HTTPS://CONCEPTS.TEST/page",
            source_type="paper",
            published_at="2024-05-01",
            content=CONTENT_CONCEPTS,
        ),
        RawSearchResult(
            title="Bell history",
            url="https://history.test/bell",
            source_type="web_page",
            published_at="2023-01-15",
            content=CONTENT_HISTORY,
        ),
    ]
    if include_conflict:
        results.append(
            RawSearchResult(
                title="A disagreeing interpretation",
                url="https://rival.test/interpretation",
                source_type="blog",
                published_at="2024-11-02",
                content=(
                    "This interpretation argues quantum entanglement excludes "
                    "superposition-based explanations entirely. The author "
                    "claims entanglement excludes superposition-based theories."
                ),
            )
        )
    return results


def build_orchestrator(extraction_payloads, *, include_conflict=False):
    clock = FakeClock()
    cache = InMemoryCache()
    usage = InMemoryUsageLedger()
    event_log = EventLog(clock)
    sink = InMemoryResultSink()

    script = {"extraction.source-extraction": list(extraction_payloads)}
    if any('"sections"' in payload for payload in extraction_payloads):
        # Planner payload supplied alongside: planner uses its own prompt id.
        planner_payloads = [p for p in extraction_payloads if '"sections"' in p]
        extraction_only = [p for p in extraction_payloads if '"sections"' not in p]
        script = {
            "planner.plan-draft": planner_payloads,
            "extraction.source-extraction": extraction_only,
        }
    llm = MockLLMProvider(scripted=script)

    pipeline = StructuredOutputPipeline(
        llm, PromptRegistry(), usage=usage, cache=cache,
        retry=RetryPolicy(max_attempts=3, backoff_seconds=0.0), clock=clock,
    )
    planner = LLMPlanner(pipeline, provider_id="mock", model="mock-model", clock=clock)

    search_provider = MockSearchProvider(
        results=search_results(include_conflict=include_conflict)
    )
    search = SearchStage(
        search_provider,
        provider_id="mock", cache=cache, usage=usage, clock=clock,
    )
    extraction = ExtractionStage(
        pipeline, provider_id="mock", model="mock-model",
        evaluator=SourceEvaluator(clock=clock),
        content_resolver=SourceContentResolver(cache=cache, clock=clock),
    )
    plan_store = PlanStore(clock=clock)
    orchestrator = ResearchOrchestrator(
        planner=planner,
        plan_store=plan_store,
        search_stage=search,
        extraction_stage=extraction,
        claim_builder=ClaimBuilder(),
        validation_stage=ValidationStage(clock=clock),
        sink=sink,
        event_log=event_log,
        clock=clock,
        max_workers=2,
    )
    return orchestrator, sink, usage, event_log, plan_store, cache, llm, search_provider


PLANNER_PAYLOAD = (FIXTURES / "planner_output_quantum.json").read_text(encoding="utf-8")
EXTRACTION_CONCEPTS = (FIXTURES / "extraction_output_quantum.json").read_text(encoding="utf-8")
EXTRACTION_HISTORY = (FIXTURES / "extraction_output_history.json").read_text(encoding="utf-8")


def merged_extraction_payload():
    """One content-agnostic superset payload.

    Extraction calls are keyed by content, but which content pulls which
    scripted payload is scheduling-dependent; the main e2e asserts on
    deterministic structure, so it merges both fixtures into a single
    payload that is correct for any content.
    """

    concepts = json.loads(EXTRACTION_CONCEPTS)
    history = json.loads(EXTRACTION_HISTORY)
    merged = {
        "entities": concepts["entities"] + history["entities"],
        "relations": concepts["relations"] + history["relations"],
        "claims": concepts["claims"] + history["claims"],
        "summary": "Merged offline fixture payload for deterministic e2e.",
        "key_points": concepts["key_points"] + history["key_points"],
    }
    return json.dumps(merged)


def test_full_offline_pipeline_end_to_end():
    orchestrator, sink, usage, event_log, plan_store, cache, llm, search_provider = (
        build_orchestrator([PLANNER_PAYLOAD, merged_extraction_payload()])
    )
    try:
        plan = orchestrator.create_plan(quantum_config(), project_id="proj-1")
        assert plan.status is PlanStatus.PENDING_REVIEW
        orchestrator.approve_plan(plan.plan_id, note="approved for e2e")

        run_id = orchestrator.start_run(plan.plan_id)
        run = orchestrator.run_status(run_id)
        assert run.status is RunStatus.COMPLETED

        # Task DAG executed every documented stage type.
        types = {task.task_type for task in orchestrator.task_status(run_id)}
        assert {
            RuntimeTaskType.SEARCH,
            RuntimeTaskType.EXTRACT,
            RuntimeTaskType.NORMALIZE,
            RuntimeTaskType.CLAIMS,
            RuntimeTaskType.VALIDATE,
        } <= types
        assert all(
            task.status is TaskStatus.COMPLETED
            for task in orchestrator.task_status(run_id)
        )

        # Canonical URL dedup: three raw hits -> two sources.
        sources = sink.all("source")
        assert len(sources) == 2
        assert all(source.quality is not None for source in sources)
        assert all(source.quality.reasons for source in sources)  # explainable

        # Layered records: source -> extraction -> node/relation -> claim/evidence.
        assert len(sink.all("extraction")) == 2  # content-keyed, one per unique content
        nodes = sink.all("node")
        assert {node.type.value for node in nodes} >= {"concept", "person", "experiment"}
        relations = sink.all("relation")
        assert relations
        claims = sink.all("claim")
        assert claims
        evidence = sink.all("evidence")
        assert len(evidence) >= len(claims)
        claim_ids = {claim.claim_id for claim in claims}
        assert all(ev.claim_id in claim_ids for ev in evidence)
        # Every claim has located evidence and its subject resolves to a node.
        node_ids = {node.node_id for node in nodes}
        for claim in claims:
            assert claim.subject_node_id in node_ids
            backing = [e for e in evidence if e.evidence_id in claim.evidence_ids]
            assert backing and any(e.locator.has_locator for e in backing)

        # Validation report persisted and coherent.
        reports = sink.all("validation-report")
        assert len(reports) == 1
        assert reports[0].run_id == run_id
        assert reports[0].status == "passed"

        # Usage records are traceable; the run itself consumed providers.
        totals = usage.totals()
        assert totals["records"] > 0

        # Re-running the same plan hits caches end to end: neither the
        # search provider nor the LLM is consumed again.
        calls_before = (len(llm.calls), len(search_provider.calls))
        run_id_2 = orchestrator.start_run(plan.plan_id)
        assert orchestrator.run_status(run_id_2).status is RunStatus.COMPLETED
        assert (len(llm.calls), len(search_provider.calls)) == calls_before
        assert usage.totals()["cache_hits"] > 0

        # Events are ordered, task-scoped, and contain no raw LLM text.
        events = event_log.replay(run_id)
        assert events[0].type == "run.created"
        assert events[-1].type == "run.completed"
        assert "run.started" in [event.type for event in events]
        for event in events:
            assert "raw_response" not in event.payload
            serialized = json.dumps(event.to_dict())
            assert "Quantum entanglement correlates" not in serialized
    finally:
        orchestrator.shutdown()


def test_unapproved_plan_never_executes():
    orchestrator, *_rest = build_orchestrator(
        [PLANNER_PAYLOAD, EXTRACTION_CONCEPTS, EXTRACTION_HISTORY]
    )
    try:
        plan = orchestrator.create_plan(quantum_config())
        with pytest.raises(MorphoError) as excinfo:
            orchestrator.start_run(plan.plan_id)
        assert excinfo.value.code is ErrorCode.PLAN_NOT_APPROVED
        assert orchestrator.run_status("nonexistent") is None
    finally:
        orchestrator.shutdown()


def test_conflicting_claims_coexist_and_run_waits_for_review():
    """A third source asserting a contradicting claim (same subject and
    predicate, different object) must coexist with the original claim and
    land in review - never overwrite it."""

    conflict_payload = json.dumps(
        {
            "entities": [
                {"name": "Quantum entanglement", "type": "concept", "aliases": [],
                 "description": "Correlated quantum state."}
            ],
            "relations": [],
            "claims": [
                {"subject": "Quantum entanglement", "predicate": "produces correlations",
                 "object_value": "weaker than classical models predict",
                 "quote": "entanglement produces correlations weaker than classical models predict",
                 "section": "Claims", "confidence": 0.7}
            ],
            "summary": "A disagreeing interpretation of entanglement.",
            "key_points": [],
        }
    )
    orchestrator, sink, _usage, _events, _plan_store, _cache, _llm, _search = (
        build_orchestrator(
            [PLANNER_PAYLOAD, EXTRACTION_CONCEPTS, EXTRACTION_HISTORY, conflict_payload],
            include_conflict=True,
        )
    )
    try:
        plan = orchestrator.create_plan(quantum_config())
        orchestrator.approve_plan(plan.plan_id)
        run_id = orchestrator.start_run(plan.plan_id)

        # The validate task ended in NEEDS_REVIEW; the run itself completes
        # with the review pending for the user.
        validate_task = [
            task for task in orchestrator.task_status(run_id)
            if task.task_type is RuntimeTaskType.VALIDATE
        ][0]
        assert validate_task.status is TaskStatus.NEEDS_REVIEW

        claims = sink.all("claim")
        by_key = {}
        for claim in claims:
            if claim.predicate.casefold() == "produces correlations":
                by_key[claim.object_value.casefold()] = claim
        assert len(by_key) >= 2  # BOTH sides coexist
        assert all(claim.status.value == "conflicting" for claim in by_key.values())
        assert all(
            claim.review_state.value == "needs_review" for claim in by_key.values()
        )

        reports = sink.all("validation-report")
        assert reports[-1].status == "passed_with_conflicts"
        assert len(reports[-1].needs_review_claim_ids) >= 2
        # Conflict records keep both claim ids.
        for conflict in reports[-1].conflicts:
            assert conflict.claim_a_id in {c.claim_id for c in by_key.values()}
            assert conflict.claim_b_id in {c.claim_id for c in by_key.values()}

        # User approves the review: the run closes, claims keep coexisting.
        status = orchestrator.resolve_review(run_id, approve=True)
        assert status is RunStatus.COMPLETED
        assert {c.object_value for c in by_key.values()} == {
            c.object_value
            for c in sink.all("claim")
            if c.predicate.casefold() == "produces correlations"
        }
    finally:
        orchestrator.shutdown()


def test_offline_mock_factory_needs_no_network_or_credentials():
    """Configured models may be unreachable: offline mock mode completes the
    pipeline with zero network and zero credentials, while the real adapter
    path fails loudly instead of silently falling back."""

    from morpho_worker.config import ProviderRole
    from morpho_worker.providers.mock import MockLLMProvider

    config = default_worker_config()
    offline_factory = ProviderFactory(config.model_copy(update={"offline_mock": True}))
    provider_cfg, planner = offline_factory.llm_for(ProviderRole.PLANNER)
    assert provider_cfg is None
    assert isinstance(planner, MockLLMProvider)

    def refused_transport(payload, headers):
        raise OSError("connection refused")

    # Credential resolves (fixture value) so the failure comes from the
    # unreachable provider, not from the auth precheck.
    fixture_env_name = "GLM_API_KEY"
    real = OpenAICompatibleLLM(
        config.providers["glm"], env={fixture_env_name: "fixture-value"}, transport=refused_transport
    )
    with pytest.raises(MorphoError) as excinfo:
        real.complete(LLMRequestFactory())
    assert excinfo.value.code is ErrorCode.PROVIDER_UNAVAILABLE
    assert "could not be reached" in excinfo.value.user_message


def LLMRequestFactory():
    from morpho_worker.providers.ports import LLMRequest

    return LLMRequest(model="glm-4.6", prompt="p", prompt_id="p", correlation_id="c")


def test_offline_planner_mock_runs_same_pipeline():
    """The MockPlanner (no LLM at all) drives the identical pipeline."""

    clock = FakeClock()
    cache = InMemoryCache()
    sink = InMemoryResultSink()
    usage = InMemoryUsageLedger()
    llm = MockLLMProvider(
        scripted={"extraction.source-extraction": [merged_extraction_payload()]}
    )
    from morpho_worker.pipeline.structured import StructuredOutputPipeline as Pipeline

    pipeline = Pipeline(
        llm, PromptRegistry(), usage=usage, cache=cache,
        retry=RetryPolicy(max_attempts=3, backoff_seconds=0.0), clock=clock,
    )
    search = SearchStage(
        MockSearchProvider(results=search_results()),
        provider_id="mock", cache=cache, usage=usage, clock=clock,
    )
    extraction = ExtractionStage(
        pipeline, provider_id="mock", model="mock-model",
        evaluator=SourceEvaluator(clock=clock),
        content_resolver=SourceContentResolver(cache=cache, clock=clock),
    )
    orchestrator = ResearchOrchestrator(
        planner=MockPlanner(clock=clock),
        plan_store=PlanStore(clock=clock),
        search_stage=search,
        extraction_stage=extraction,
        sink=sink,
        clock=clock,
        max_workers=2,
    )
    try:
        plan = orchestrator.create_plan(quantum_config(), project_id="proj-mock")
        orchestrator.approve_plan(plan.plan_id)
        run_id = orchestrator.start_run(plan.plan_id)
        assert orchestrator.run_status(run_id).status is RunStatus.COMPLETED
        assert len(sink.all("source")) == 2
        assert sink.all("claim")
        assert sink.all("validation-report")
    finally:
        orchestrator.shutdown()
