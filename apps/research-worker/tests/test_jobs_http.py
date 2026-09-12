"""HTTP job-surface tests (PRD section 8 worker protocol, draft W2-02).

Covers the draft endpoints end to end over the loopback transport with
offline/mock providers only (same pattern as ``test_pipeline_offline.py``;
zero network, zero credentials):

- ``POST /jobs`` strict envelope validation and 201 job envelope,
- ``GET /jobs/{id}`` status/counts while the DAG runs and after it ends,
- ``POST /jobs/{id}/cancel`` cooperative cancel + idempotence,
- ``GET /jobs/{id}/events`` SSE stream: strict ordering, append-only replay
  via ``?after_sequence=`` and ``Last-Event-ID``, live delivery on an open
  stream, sentinel-terminated EOF, and no raw provider material,
- structured 404/401/400 error envelopes.
"""

from __future__ import annotations

import http.client
import json
import threading
import time
from contextlib import contextmanager
from pathlib import Path

from morpho_worker.clock import FakeClock
from morpho_worker.events import EventEnvelope, parse_sse
from morpho_worker.interfaces import InMemoryResultSink, MockPlanner
from morpho_worker.jobs import JobService
from morpho_worker.orchestrator import ResearchOrchestrator
from morpho_worker.pipeline.prompts import PromptRegistry
from morpho_worker.pipeline.structured import StructuredOutputPipeline
from morpho_worker.providers.cache import InMemoryCache
from morpho_worker.providers.mock import MockLLMProvider, MockSearchProvider
from morpho_worker.providers.ports import RawSearchResult
from morpho_worker.providers.retry import RetryPolicy
from morpho_worker.providers.usage import InMemoryUsageLedger
from morpho_worker.stages.extraction_stage import (
    ExtractionStage,
    SourceContentResolver,
    SourceEvaluator,
)
from morpho_worker.stages.search_stage import SearchStage
from morpho_worker.stores import PlanStore
from morpho_worker.transport import WorkerClient, WorkerService

FIXTURES = Path(__file__).parent / "fixtures"
SESSION_TOKEN = "draft-session-token"

DOCUMENTED_STATUSES = {
    "PENDING",
    "PLANNING",
    "RUNNING",
    "VALIDATING",
    "NEEDS_REVIEW",
    "PAUSED",
    "COMPLETED",
    "FAILED",
    "CANCELLED",
}
TERMINAL_STATUSES = {"COMPLETED", "NEEDS_REVIEW", "FAILED", "CANCELLED"}

CONTENT_CONCEPTS = (
    "Quantum entanglement correlates distant particles. No local hidden-variable "
    "model can reproduce the observed correlations. Entanglement requires "
    "nonclassical correlations between measurement outcomes."
)
CONTENT_HISTORY = (
    "John Bell derived his inequalities while working at CERN. Bell published "
    "the inequality in 1964. The 2015 loophole-free experiments rejected local realism."
)


def offline_search_results(*, include_conflict: bool = False) -> list[RawSearchResult]:
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
                    "superposition-based explanations entirely."
                ),
            )
        )
    return results


def merged_extraction_payload() -> str:
    """Content-agnostic superset payload (see test_pipeline_offline.py):
    whichever unique content pulls which scripted item, the payload is
    structurally correct for it."""

    concepts = json.loads(
        (FIXTURES / "extraction_output_quantum.json").read_text(encoding="utf-8")
    )
    history = json.loads(
        (FIXTURES / "extraction_output_history.json").read_text(encoding="utf-8")
    )
    merged = {
        "entities": concepts["entities"] + history["entities"],
        "relations": concepts["relations"] + history["relations"],
        "claims": concepts["claims"] + history["claims"],
        "summary": "Merged offline fixture payload for HTTP job tests.",
        "key_points": concepts["key_points"] + history["key_points"],
    }
    return json.dumps(merged)


def conflict_extraction_payload() -> str:
    return json.dumps(
        {
            "entities": [
                {
                    "name": "Quantum entanglement",
                    "type": "concept",
                    "aliases": [],
                    "description": "Correlated quantum state.",
                }
            ],
            "relations": [],
            "claims": [
                {
                    "subject": "Quantum entanglement",
                    "predicate": "produces correlations",
                    "object_value": "weaker than classical models predict",
                    "quote": "entanglement produces correlations weaker than classical models predict",
                    "section": "Claims",
                    "confidence": 0.7,
                }
            ],
            "summary": "A disagreeing interpretation of entanglement.",
            "key_points": [],
        }
    )


class BlockingSearchProvider:
    """Mock adapter that blocks every search call until released; holds the
    DAG mid-run so cancel and live-stream behavior is observable."""

    def __init__(self, inner: MockSearchProvider, release: threading.Event) -> None:
        self.inner = inner
        self.release = release
        self.entered = threading.Event()

    def search(self, request):
        self.entered.set()
        self.release.wait(timeout=15)
        return self.inner.search(request)


def orchestrator_factory(clock: FakeClock, search_provider, extraction_script):
    """Builds a fresh offline orchestrator per job, wired to the job's pinned
    event log (offline/mock providers exactly like test_pipeline_offline.py)."""

    def factory(event_log):
        cache = InMemoryCache()
        usage = InMemoryUsageLedger()
        llm = MockLLMProvider(
            scripted={"extraction.source-extraction": list(extraction_script)}
        )
        pipeline = StructuredOutputPipeline(
            llm,
            PromptRegistry(),
            usage=usage,
            cache=cache,
            retry=RetryPolicy(max_attempts=3, backoff_seconds=0.0),
            clock=clock,
        )
        search = SearchStage(
            search_provider, provider_id="mock", cache=cache, usage=usage, clock=clock
        )
        extraction = ExtractionStage(
            pipeline,
            provider_id="mock",
            model="mock-model",
            evaluator=SourceEvaluator(clock=clock),
            content_resolver=SourceContentResolver(cache=cache, clock=clock),
        )
        return ResearchOrchestrator(
            planner=MockPlanner(clock=clock),
            plan_store=PlanStore(clock=clock),
            search_stage=search,
            extraction_stage=extraction,
            sink=InMemoryResultSink(),
            event_log=event_log,
            clock=clock,
            max_workers=2,
        )

    return factory


@contextmanager
def running_worker(
    *,
    search_provider=None,
    extraction_script=None,
    heartbeat_seconds: float = 0.25,
):
    clock = FakeClock()
    provider = search_provider or MockSearchProvider(results=offline_search_results())
    script = list(extraction_script or [merged_extraction_payload()])
    jobs = JobService(
        orchestrator_factory=orchestrator_factory(clock, provider, script),
        clock=clock,
        heartbeat_seconds=heartbeat_seconds,
    )
    worker = WorkerService(session_token=SESSION_TOKEN, job_service=jobs)
    worker.start()
    try:
        yield worker.client(), jobs
    finally:
        jobs.shutdown()
        worker.stop()


def job_request(**overrides) -> dict:
    request = {
        "schema_version": "1",
        "kind": "research_run",
        "config": {
            "domain": "physics",
            "topic": "quantum entanglement",
            "purpose": "learning",
            "depth": 3,
            "dimensions": ["concepts", "history"],
            "languages": ["en"],
            "source_types": ["paper", "web_page"],
        },
        "approve_plan": True,
    }
    request.update(overrides)
    return request


def wait_for_terminal(client: WorkerClient, job_id: str, timeout: float = 20.0) -> dict:
    deadline = time.monotonic() + timeout
    job: dict | None = None
    while time.monotonic() < deadline:
        status, payload = client.get(f"/jobs/{job_id}")
        assert status == 200
        job = payload["job"]
        if job["status"] in TERMINAL_STATUSES:
            return job
        time.sleep(0.02)
    raise AssertionError(f"job {job_id} never reached a terminal state; last: {job}")


def stream_text(client: WorkerClient, path: str, *, headers: dict | None = None) -> str:
    with client.stream(path, headers=headers) as stream:
        assert stream.status == 200
        assert stream.content_type.startswith("text/event-stream")
        return stream.read_all()


def parse_stream(text: str) -> list[EventEnvelope]:
    """Parse complete SSE frames: comment lines (heartbeats, sentinel) are
    ignored and a trailing partial frame (read against an open stream) is
    dropped."""

    blocks = text.split("\n\n")
    if not text.endswith("\n\n"):
        blocks = blocks[:-1]
    events: list[EventEnvelope] = []
    for block in blocks:
        lines = [line for line in block.split("\n") if not line.startswith(":")]
        if not any(line.startswith("data:") for line in lines):
            continue
        events.extend(parse_sse("\n".join(lines)))
    return events


def _accumulate_stream(
    client: WorkerClient, path: str, received: list[str], failures: list
) -> None:
    try:
        with client.stream(path) as stream:
            for line in stream.lines():
                received.append(line)
    except BaseException as exc:  # surface reader-thread failures to the test
        failures.append(exc)


# POST /jobs + GET /jobs/{id} -------------------------------------------------


def test_create_job_returns_envelope_and_runs_offline_pipeline_to_completion():
    with running_worker() as (client, _jobs):
        status, payload = client.post("/jobs", job_request())
        assert status == 201
        assert payload["schema_version"] == "1"
        job = payload["job"]
        assert job["job_id"]
        assert job["kind"] == "research_run"
        assert job["status"] in DOCUMENTED_STATUSES
        assert job["created_at"]
        assert job["protocol_version"] == "1"

        finished = wait_for_terminal(client, job["job_id"])
        assert finished["status"] == "COMPLETED"
        assert finished["plan_id"] and finished["run_id"]
        assert finished["error"] is None
        counts = finished["counts"]
        # 2 sections x (search + dynamic extracts + normalize + claims) + validate
        assert counts["tasks_total"] >= 5
        assert counts["tasks_completed"] == counts["tasks_total"]

        # Cancelling a terminal job is idempotent: the terminal state comes
        # back, never an error.
        cancel_status, again = client.post(f"/jobs/{job['job_id']}/cancel", {})
        assert cancel_status == 200
        assert again["job"]["status"] == "COMPLETED"


def test_conflicting_claims_surface_as_needs_review():
    provider = MockSearchProvider(results=offline_search_results(include_conflict=True))
    script = [merged_extraction_payload(), conflict_extraction_payload()]
    with running_worker(search_provider=provider, extraction_script=script) as (
        client,
        _jobs,
    ):
        _status, payload = client.post("/jobs", job_request())
        job_id = payload["job"]["job_id"]
        job = wait_for_terminal(client, job_id)
        assert job["status"] == "NEEDS_REVIEW"
        assert job["counts"]["tasks_needs_review"] >= 1

        events = parse_stream(stream_text(client, f"/jobs/{job_id}/events"))
        types = [event.type for event in events]
        assert "task.needs_review" in types
        assert types[-1] == "job.needs_review"


# GET /jobs/{id}/events (SSE) ---------------------------------------------------


def test_job_events_stream_is_ordered_and_ends_with_sentinel():
    with running_worker() as (client, _jobs):
        _status, payload = client.post("/jobs", job_request())
        job_id = payload["job"]["job_id"]
        assert wait_for_terminal(client, job_id)["status"] == "COMPLETED"

        raw = stream_text(client, f"/jobs/{job_id}/events")
        events = parse_stream(raw)
        sequences = [event.sequence for event in events]
        assert sequences == list(range(1, len(events) + 1))
        assert all(event.job_id == job_id for event in events)
        types = [event.type for event in events]
        assert types[0] == "plan.created"
        for expected in (
            "run.created",
            "run.started",
            "task.started",
            "task.completed",
            "run.completed",
        ):
            assert expected in types
        assert types[-1] == "job.completed"
        # The stream ends cleanly with the sentinel comment after the
        # terminal event.
        assert any(line.startswith(": morpho stream end") for line in raw.split("\n"))


def test_events_replay_after_sequence_and_last_event_id_header():
    with running_worker() as (client, _jobs):
        _status, payload = client.post("/jobs", job_request())
        job_id = payload["job"]["job_id"]
        wait_for_terminal(client, job_id)

        full = parse_stream(stream_text(client, f"/jobs/{job_id}/events"))
        assert len(full) >= 4
        cut = 2
        expected_tail = [event.sequence for event in full[cut:]]

        via_query = parse_stream(
            stream_text(client, f"/jobs/{job_id}/events?after_sequence={cut}")
        )
        assert [event.sequence for event in via_query] == expected_tail
        assert [event.type for event in via_query] == [
            event.type for event in full[cut:]
        ]

        via_header = parse_stream(
            stream_text(
                client, f"/jobs/{job_id}/events", headers={"Last-Event-ID": str(cut)}
            )
        )
        assert [event.sequence for event in via_header] == expected_tail

        # Append-only across reconnects: full == head + replayed tail.
        assert (
            [event.sequence for event in full[:cut]] + expected_tail
            == [event.sequence for event in full]
        )

        # A cursor at the end replays nothing and still ends cleanly.
        exhausted = parse_stream(
            stream_text(client, f"/jobs/{job_id}/events?after_sequence={len(full)}")
        )
        assert exhausted == []

        # Invalid cursors fail with the structured envelope, before streaming.
        status, error_payload = client.get(
            f"/jobs/{job_id}/events?after_sequence=not-a-number"
        )
        assert status == 400
        assert error_payload["error"]["code"] == "BAD_REQUEST"


def test_events_stream_stays_open_and_delivers_later_events():
    release = threading.Event()
    provider = BlockingSearchProvider(
        MockSearchProvider(results=offline_search_results()), release
    )
    with running_worker(search_provider=provider) as (client, _jobs):
        _status, payload = client.post("/jobs", job_request())
        job_id = payload["job"]["job_id"]

        received: list[str] = []
        failures: list = []
        reader = threading.Thread(
            target=_accumulate_stream,
            args=(client, f"/jobs/{job_id}/events", received, failures),
            daemon=True,
        )
        reader.start()
        try:
            deadline = time.monotonic() + 10
            observed: list[EventEnvelope] = []
            while time.monotonic() < deadline:
                observed = parse_stream("".join(received))
                if any(event.type == "task.started" for event in observed):
                    break
                time.sleep(0.02)
            # Events arrived while the stream was open and the job was held
            # mid-run (not terminal yet).
            assert any(event.type == "task.started" for event in observed)
        finally:
            release.set()
        reader.join(timeout=15)
        assert not failures

        # The same connection later delivered the remaining events and the
        # sentinel; sequences stay strictly ordered without gaps or repeats.
        raw = "".join(received)
        events = parse_stream(raw)
        sequences = [event.sequence for event in events]
        assert sequences == sorted(sequences)
        assert len(set(sequences)) == len(sequences)
        assert sequences[0] == 1
        assert events[-1].type == "job.completed"
        assert any(line.startswith(": morpho stream end") for line in raw.split("\n"))


def test_event_stream_carries_no_raw_provider_material():
    with running_worker() as (client, _jobs):
        _status, payload = client.post("/jobs", job_request())
        job_id = payload["job"]["job_id"]
        wait_for_terminal(client, job_id)
        raw = stream_text(client, f"/jobs/{job_id}/events")
        for event in parse_stream(raw):
            assert "raw_prompt" not in event.payload
            assert "raw_response" not in event.payload
        # Neither source content nor credential-shaped keys ever leak.
        assert CONTENT_CONCEPTS.split(".")[0] not in raw
        assert "api_key" not in raw.lower()


# POST /jobs/{id}/cancel --------------------------------------------------------


def test_cancel_running_job_is_cooperative_and_idempotent():
    release = threading.Event()
    provider = BlockingSearchProvider(
        MockSearchProvider(results=offline_search_results()), release
    )
    with running_worker(search_provider=provider) as (client, _jobs):
        _status, payload = client.post("/jobs", job_request())
        job_id = payload["job"]["job_id"]
        assert provider.entered.wait(timeout=10)  # the DAG is inside search

        status, cancel_payload = client.post(f"/jobs/{job_id}/cancel", {})
        assert status == 200
        job = wait_for_terminal(client, job_id)
        assert job["status"] == "CANCELLED"
        assert job["counts"]["tasks_cancelled"] == job["counts"]["tasks_total"]

        # Idempotent: cancelling again returns the same terminal state.
        status, again = client.post(f"/jobs/{job_id}/cancel", {})
        assert status == 200
        assert again["job"]["status"] == "CANCELLED"

        try:
            raw = stream_text(client, f"/jobs/{job_id}/events")
        finally:
            release.set()  # let the in-flight handler return so threads wind down
        events = parse_stream(raw)
        types = [event.type for event in events]
        assert "run.cancelled" in types
        assert types[-1] == "job.cancelled"
        sequences = [event.sequence for event in events]
        assert sequences == sorted(sequences)
        assert len(set(sequences)) == len(sequences)


# Error envelopes ---------------------------------------------------------------


def test_unknown_job_id_returns_structured_404_on_every_job_route():
    with running_worker() as (client, _jobs):
        for method, path in (
            ("GET", "/jobs/no-such-job"),
            ("POST", "/jobs/no-such-job/cancel"),
            ("GET", "/jobs/no-such-job/events"),
        ):
            if method == "GET":
                status, payload = client.get(path)
            else:
                status, payload = client.post(path, {})
            assert status == 404, (method, path)
            assert payload["error"]["code"] == "NOT_FOUND"
            assert "no-such-job" in payload["error"]["developer_detail"]


def test_job_routes_require_the_session_token():
    with running_worker() as (client, _jobs):
        anonymous = WorkerClient(client.host, client.port, session_token=None)
        status, payload = anonymous.post("/jobs", job_request())
        assert status == 401
        assert payload["error"]["code"] == "UNAUTHORIZED"
        status, _payload = anonymous.get("/jobs/any/events")
        assert status == 401


def test_malformed_json_body_returns_bad_request():
    with running_worker() as (client, _jobs):
        connection = http.client.HTTPConnection(client.host, client.port, timeout=5)
        try:
            connection.request(
                "POST",
                "/jobs",
                body=b"{not json",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {SESSION_TOKEN}",
                },
            )
            response = connection.getresponse()
            payload = json.loads(response.read().decode("utf-8"))
        finally:
            connection.close()
        assert response.status == 400
        assert payload["error"]["code"] == "BAD_REQUEST"


def test_job_request_envelope_is_validated_strictly():
    with running_worker() as (client, _jobs):
        cases = [
            job_request(unexpected_field="x"),
            job_request(schema_version="2"),
            job_request(approve_plan="yes"),
            {**job_request(), "config": "not-an-object"},
            {k: v for k, v in job_request().items() if k != "config"},
        ]
        for request in cases:
            status, payload = client.post("/jobs", request)
            assert status == 400, request
            assert payload["error"]["code"] == "BAD_REQUEST"
        # The unknown-field rejection names the offender.
        status, payload = client.post("/jobs", job_request(unexpected_field="x"))
        assert "unexpected_field" in payload["error"]["developer_detail"]


def test_unknown_job_kind_is_rejected_with_stable_code():
    with running_worker() as (client, _jobs):
        status, payload = client.post("/jobs", job_request(kind="summarize_vault"))
        assert status == 400
        assert payload["error"]["code"] == "UNSUPPORTED_JOB_KIND"
        assert "summarize_vault" in payload["error"]["developer_detail"]


def test_job_without_plan_approval_never_creates_a_job():
    with running_worker() as (client, _jobs):
        status, payload = client.post("/jobs", job_request(approve_plan=False))
        assert status == 400
        assert payload["error"]["code"] == "PLAN_NOT_APPROVED"
        assert payload["error"]["retryable"] is False
