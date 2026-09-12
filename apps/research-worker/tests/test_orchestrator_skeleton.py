import pytest

from morpho_worker.domain.research import RuntimeTaskType
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.events import EventLog
from morpho_worker.clock import FakeClock
from morpho_worker.interfaces import (
    InMemoryResultSink,
    MockPlanner,
    MockSearchStage,
    StageContext,
)
from morpho_worker.orchestrator import Orchestrator


def test_orchestrator_dispatches_by_task_type():
    orchestrator = Orchestrator()
    seen = {}

    def search_handler(query, context):
        seen["query"] = query
        seen["context"] = context
        return ["source-a"]

    orchestrator.register(RuntimeTaskType.SEARCH, search_handler)
    context = StageContext(run_id="r1", task_id="t1")
    result = orchestrator.dispatch(RuntimeTaskType.SEARCH, "t1", query="q", context=context)
    assert result == ["source-a"]
    assert seen["query"] == "q"
    assert seen["context"] is context


def test_orchestrator_missing_handler_is_structured_error():
    orchestrator = Orchestrator()
    with pytest.raises(MorphoError) as excinfo:
        orchestrator.dispatch(RuntimeTaskType.EXTRACT, "t2")
    assert excinfo.value.code == "TASK_HANDLER_MISSING"
    assert excinfo.value.retryable is False


def test_orchestrator_records_events_and_structured_failures():
    clock = FakeClock()
    log = EventLog(clock)
    orchestrator = Orchestrator(event_log=log, job_id="job-1")

    def failing_handler(**kwargs):
        raise MorphoError(
            ErrorCode.SEARCH_FAILED, "The search provider is failing.", retryable=True
        )

    orchestrator.register(RuntimeTaskType.SEARCH, lambda **kw: ["ok"])
    orchestrator.register(RuntimeTaskType.EXTRACT, failing_handler)

    orchestrator.dispatch(RuntimeTaskType.SEARCH, "t1")
    with pytest.raises(MorphoError):
        orchestrator.dispatch(RuntimeTaskType.EXTRACT, "t2")

    events = log.replay("job-1")
    assert [event.type for event in events] == [
        "task.started",
        "task.completed",
        "task.started",
        "task.failed",
    ]
    failure = events[-1]
    assert failure.task_id == "t2"
    assert failure.payload["error_code"] == "SEARCH_FAILED"


def test_mock_planner_is_deterministic_and_pending_review():
    from morpho_worker.domain.research import ResearchConfig

    config = ResearchConfig.model_validate(
        {
            "domain": "neuroscience",
            "topic": "brain-computer interface",
            "purpose": "research",
            "depth": 4,
            "dimensions": ["concepts", "technology", "ethics"],
        }
    )
    clock = FakeClock()
    planner = MockPlanner(clock=clock)
    plan = planner.draft_plan(config, project_id="p1")
    again = planner.draft_plan(config, project_id="p1")

    assert plan.status.value == "pending_review"
    assert plan.plan_id == again.plan_id
    assert plan.config_fingerprint == again.config_fingerprint
    assert [section.dimension for section in plan.sections] == [
        "concepts", "technology", "ethics",
    ]
    assert plan.project_id == "p1"
    assert plan.created_at == clock.now_utc().isoformat()


def test_mock_search_stage_returns_fixture_sources():
    from morpho_worker.domain.source import Source

    source = Source(
        source_id="s1",
        url="https://example.test/a",
        canonical_url="https://example.test/a",
        url_dedup_key="k",
        title="Fixture",
    )
    stage = MockSearchStage(sources_by_query={"quantum": [source]})
    context = StageContext(run_id="r", task_id="t")
    assert stage.search("quantum", context) == [source]
    assert stage.search("nothing", context) == []


def test_sink_rejects_records_without_identity():
    from pydantic import BaseModel

    class NoIdentity(BaseModel):
        value: int

    sink = InMemoryResultSink()
    with pytest.raises(ValueError, match="identity"):
        sink.persist("thing", NoIdentity(value=1))
