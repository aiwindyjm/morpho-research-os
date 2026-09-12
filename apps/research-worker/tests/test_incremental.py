"""Incremental research tests (PRD section 14).

Covers the new/changed/conflicting classification matrix, the empty
baseline for a project's first run, fingerprint stability across identical
records, and the orchestrator wiring (report persisted via the sink,
``run.incremental_report`` event, summary on the run record's result).
"""

import json
from pathlib import Path

from morpho_worker.clock import FakeClock
from morpho_worker.domain.claims import Claim, ClaimConfidence, ClaimStatus
from morpho_worker.domain.source import Source, SourceContent
from morpho_worker.incremental import (
    IncrementalBaseline,
    claim_fingerprint,
    compute_incremental_report,
    source_fingerprint,
)
from morpho_worker.interfaces import InMemoryResultSink, MockPlanner
from morpho_worker.events import EventLog
from morpho_worker.orchestrator import ResearchOrchestrator
from morpho_worker.pipeline.prompts import PromptRegistry
from morpho_worker.pipeline.structured import StructuredOutputPipeline
from morpho_worker.providers.cache import InMemoryCache
from morpho_worker.providers.mock import MockLLMProvider, MockSearchProvider
from morpho_worker.providers.ports import RawSearchResult
from morpho_worker.providers.retry import RetryPolicy
from morpho_worker.providers.usage import InMemoryUsageLedger
from morpho_worker.stages.claims_stage import ClaimBuilder, ValidationStage
from morpho_worker.stages.extraction_stage import (
    ExtractionStage,
    SourceContentResolver,
    SourceEvaluator,
)
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


def make_source(source_id: str, key: str) -> Source:
    url = f"https://{source_id}.test/page"
    return Source(
        source_id=source_id,
        url=url,
        canonical_url=url,
        url_dedup_key=key,
        title=f"Source {source_id}",
    )


def make_content(source_id: str, key: str, text: str) -> SourceContent:
    import hashlib

    return SourceContent(
        source_id=source_id,
        url_dedup_key=key,
        content=text,
        fingerprint=hashlib.sha256(text.encode("utf-8")).hexdigest(),
    )


def make_claim(claim_id: str, subject: str, predicate: str, obj: str, **overrides):
    data = dict(
        claim_id=claim_id,
        subject_node_id=subject,
        predicate=predicate,
        object_value=obj,
    )
    data.update(overrides)
    return Claim.model_validate(data)


def test_classification_matrix_new_changed_conflicting():
    prior = IncrementalBaseline.from_run(
        "run-prior",
        sources=[make_source("s-a", "key-a"), make_source("s-b", "key-b")],
        contents=[
            make_content("s-a", "key-a", "content A v1"),
            make_content("s-b", "key-b", "content B v1"),
        ],
        claims=[
            make_claim("c-same", "n1", "has_property", "stable value"),
            make_claim("c-evolve", "n2", "publishes", "1964"),
        ],
    )

    current_sources = [
        make_source("s-a", "key-a"),          # unchanged content
        make_source("s-b2", "key-b"),         # same dedup key, new content
        make_source("s-c", "key-c"),          # brand new, backs a conflict
        make_source("s-d", "key-d"),          # brand new, no conflicts
    ]
    current_contents = [
        make_content("s-a", "key-a", "content A v1"),
        make_content("s-b2", "key-b", "content B v2"),
        make_content("s-c", "key-c", "content C v1"),
        make_content("s-d", "key-d", "content D v1"),
    ]
    current_claims = [
        # Same id, same fingerprint -> unchanged (not itemized).
        make_claim("c-same", "n1", "has_property", "stable value"),
        # Same id, different content (evidence grew) -> changed.
        make_claim(
            "c-evolve", "n2", "publishes", "1964",
            evidence_ids=["e1", "e2"],
        ),
        # New id contradicting c-same (same subject+predicate, different
        # object) -> conflicting, with the prior claim reference.
        make_claim("c-rival", "n1", "has_property", "rival value"),
        # Fresh subject/predicate -> new.
        make_claim("c-new", "n9", "requires", "superposition"),
    ]

    report = compute_incremental_report(
        run_id="run-now",
        project_id="proj-1",
        prior=prior,
        sources=current_sources,
        contents=current_contents,
        claims=current_claims,
        # s-c backs the contradicting claim c-rival.
        evidence_sources_by_claim={"c-rival": ["s-c"]},
        computed_at="2026-09-12T00:00:00+00:00",
    )

    # Sources: conflicting > new > changed precedence; unchanged counted.
    assert [entry.url_dedup_key for entry in report.sources_new] == ["key-d"]
    assert [entry.url_dedup_key for entry in report.sources_changed] == ["key-b"]
    assert [entry.url_dedup_key for entry in report.sources_conflicting] == ["key-c"]
    assert report.sources_changed[0].prior_fingerprint != report.sources_changed[0].fingerprint

    # Claims: the contradicting claim is conflicting (not new), the
    # same-id-different-content claim is changed, the rest is new.
    assert [entry.claim_id for entry in report.claims_conflicting] == ["c-rival"]
    assert report.claims_conflicting[0].prior_claim_id == "c-same"
    assert [entry.claim_id for entry in report.claims_changed] == ["c-evolve"]
    assert [entry.claim_id for entry in report.claims_new] == ["c-new"]

    assert report.prior_run_id == "run-prior"
    assert report.counts == {
        "sources_total": 4,
        "sources_new": 1,
        "sources_changed": 1,
        "sources_conflicting": 1,
        "sources_unchanged": 1,
        "claims_total": 4,
        "claims_new": 1,
        "claims_changed": 1,
        "claims_conflicting": 1,
        "claims_unchanged": 1,
    }


def test_no_prior_run_uses_empty_baseline_and_marks_everything_new():
    sources = [make_source("s-a", "key-a")]
    contents = [make_content("s-a", "key-a", "content A")]
    claims = [make_claim("c-1", "n1", "p", "v")]

    report = compute_incremental_report(
        run_id="run-first",
        prior=None,
        sources=sources,
        contents=contents,
        claims=claims,
        computed_at="2026-09-12T00:00:00+00:00",
    )

    assert report.prior_run_id is None
    assert [entry.source_id for entry in report.sources_new] == ["s-a"]
    assert [entry.claim_id for entry in report.claims_new] == ["c-1"]
    assert report.sources_changed == [] and report.sources_conflicting == []
    assert report.claims_changed == [] and report.claims_conflicting == []
    assert report.counts["sources_unchanged"] == 0
    assert report.counts["claims_unchanged"] == 0


def test_within_run_conflicting_claims_classify_without_prior():
    claims = [
        make_claim("c-a", "n1", "p", "value a"),
        make_claim(
            "c-b", "n1", "p", "value b",
            confidence=ClaimConfidence.CONFLICTING,
            status=ClaimStatus.NEEDS_REVIEW,
        ),
    ]
    report = compute_incremental_report(
        run_id="run-now",
        prior=IncrementalBaseline.from_run(
            "run-prior",
            sources=[],
            contents=[],
            claims=[make_claim("c-a", "n1", "p", "value a")],
        ),
        sources=[make_source("s-x", "key-x")],
        contents=[make_content("s-x", "key-x", "x")],
        claims=claims,
        evidence_sources_by_claim={"c-b": ["s-x"]},
        computed_at="",
    )
    assert [entry.claim_id for entry in report.claims_conflicting] == ["c-b"]
    assert report.claims_conflicting[0].prior_claim_id is None
    assert [entry.source_id for entry in report.sources_conflicting] == ["s-x"]


def test_fingerprints_are_stable_and_review_only_changes_do_not_count():
    claim = make_claim("c-1", "n1", "p", "v", evidence_ids=["e1", "e0"])
    same_material = make_claim("c-1", "n1", "p", "v", evidence_ids=["e0", "e1"])
    reviewed = same_material.model_copy(update={"status": ClaimStatus.CONFIRMED})
    assert claim_fingerprint(claim) == claim_fingerprint(same_material)
    # Review lifecycle transitions are not new research material.
    assert claim_fingerprint(claim) == claim_fingerprint(reviewed)
    # Any content change (evidence, confidence, object) moves the fingerprint.
    changed = claim.model_copy(update={"evidence_ids": ["e0", "e1", "e2"]})
    assert claim_fingerprint(claim) != claim_fingerprint(changed)
    other_object = claim.model_copy(update={"object_value": "different"})
    assert claim_fingerprint(claim) != claim_fingerprint(other_object)

    source = make_source("s-a", "key-a")
    contents_v1 = [make_content("s-a", "key-a", "text v1")]
    contents_v2 = [make_content("s-a", "key-a", "text v2")]
    assert source_fingerprint(source, contents_v1) == source_fingerprint(
        source, [make_content("s-a", "key-a", "text v1")]
    )
    assert source_fingerprint(source, contents_v1) != source_fingerprint(
        source, contents_v2
    )


def _offline_orchestrator():
    """Minimal offline pipeline (mock planner/search/extraction) shared by
    the orchestrator-level incremental tests."""

    clock = FakeClock()
    cache = InMemoryCache()
    usage = InMemoryUsageLedger()
    event_log = EventLog(clock)
    sink = InMemoryResultSink()

    concepts = json.loads(
        (FIXTURES / "extraction_output_quantum.json").read_text(encoding="utf-8")
    )
    history = json.loads(
        (FIXTURES / "extraction_output_history.json").read_text(encoding="utf-8")
    )
    merged = json.dumps(
        {
            "entities": concepts["entities"] + history["entities"],
            "relations": concepts["relations"] + history["relations"],
            "claims": concepts["claims"] + history["claims"],
            "summary": "Merged offline payload for incremental tests.",
            "key_points": [],
        }
    )
    llm = MockLLMProvider(scripted={"extraction.source-extraction": [merged]})
    pipeline = StructuredOutputPipeline(
        llm,
        PromptRegistry(),
        usage=usage,
        cache=cache,
        retry=RetryPolicy(max_attempts=3, backoff_seconds=0.0),
        clock=clock,
    )
    search = SearchStage(
        MockSearchProvider(
            results=[
                RawSearchResult(
                    title="Entanglement concepts",
                    url="https://concepts.test/page",
                    source_type="paper",
                    content=CONTENT_CONCEPTS,
                ),
                RawSearchResult(
                    title="Bell history",
                    url="https://history.test/bell",
                    source_type="web_page",
                    content=CONTENT_HISTORY,
                ),
            ]
        ),
        provider_id="mock",
        cache=cache,
        usage=usage,
        clock=clock,
    )
    extraction = ExtractionStage(
        pipeline,
        provider_id="mock",
        model="mock-model",
        evaluator=SourceEvaluator(clock=clock),
        content_resolver=SourceContentResolver(cache=cache, clock=clock),
    )
    from morpho_worker.domain.research import ResearchConfig

    orchestrator = ResearchOrchestrator(
        planner=MockPlanner(clock=clock),
        plan_store=PlanStore(clock=clock),
        search_stage=search,
        extraction_stage=extraction,
        claim_builder=ClaimBuilder(),
        validation_stage=ValidationStage(clock=clock),
        sink=sink,
        event_log=event_log,
        clock=clock,
        max_workers=2,
    )
    config = ResearchConfig.model_validate(
        {
            "domain": "physics",
            "topic": "quantum entanglement",
            "purpose": "learning",
            "depth": 3,
            "dimensions": ["concepts", "history"],
            "project_id": "proj-inc",
        }
    )
    return orchestrator, sink, event_log, config


def test_orchestrator_records_incremental_report_between_runs():
    orchestrator, sink, event_log, config = _offline_orchestrator()
    try:
        plan = orchestrator.create_plan(config, project_id="proj-inc")
        orchestrator.approve_plan(plan.plan_id)

        # First run: empty baseline, everything is new.
        run_one = orchestrator.start_run(plan.plan_id)
        reports = sink.all("incremental-report")
        assert len(reports) == 1
        assert reports[0].run_id == run_one
        assert reports[0].prior_run_id is None
        assert reports[0].counts["sources_new"] == reports[0].counts["sources_total"]
        assert reports[0].counts["claims_new"] == reports[0].counts["claims_total"]
        assert orchestrator.run_status(run_one).result["incremental"]["prior_run_id"] is None
        types = [event.type for event in event_log.replay(run_one)]
        assert "run.incremental_report" in types

        # Second run of the same project: identical material (caches make
        # the run deterministic) classifies as unchanged against run one.
        run_two = orchestrator.start_run(plan.plan_id)
        reports = sink.all("incremental-report")
        assert len(reports) == 2
        second = [r for r in reports if r.run_id == run_two][0]
        assert second.prior_run_id == run_one
        assert second.counts["sources_unchanged"] == second.counts["sources_total"]
        assert second.counts["claims_unchanged"] == second.counts["claims_total"]
        assert second.claims_conflicting == [] and second.sources_conflicting == []
        summary = orchestrator.run_status(run_two).result["incremental"]
        assert summary["prior_run_id"] == run_one
        assert summary["sources_unchanged"] == second.counts["sources_total"]
        types = [event.type for event in event_log.replay(run_two)]
        assert "run.incremental_report" in types
    finally:
        orchestrator.shutdown()
