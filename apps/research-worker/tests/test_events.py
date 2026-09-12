import json
import threading
import time

import pytest

from morpho_worker.clock import FakeClock
from morpho_worker.events import (
    EVENT_SCHEMA,
    EventEnvelope,
    EventLog,
    EventLogClosed,
    event_from_jsonl,
    parse_sse,
    redact,
)


@pytest.fixture()
def clock():
    return FakeClock()


@pytest.fixture()
def log(clock):
    return EventLog(clock)


def test_append_assigns_ordered_sequences_and_utc_timestamps(log, clock):
    first = log.append("job-1", "run.started", {"plan": "p1"})
    second = log.append("job-1", "task.status_changed", {"task_id": "t1"})
    assert first.sequence == 1 and second.sequence == 2
    # Timestamps are non-decreasing; strict ordering comes from the sequence.
    assert first.timestamp <= second.timestamp
    assert clock.now_utc().isoformat() == second.timestamp
    assert first.event_id != second.event_id


def test_sequences_are_per_job(log):
    log.append("job-1", "run.started")
    event = log.append("job-2", "run.started")
    assert event.sequence == 1


def test_replay_from_cursor_for_reconnect(log):
    for index in range(5):
        log.append("job-1", f"step.{index}")
    assert [event.sequence for event in log.replay("job-1")] == [1, 2, 3, 4, 5]
    resumed = log.replay("job-1", after_sequence=3)
    assert [event.sequence for event in resumed] == [4, 5]
    assert log.replay("job-1", after_sequence=3, limit=1)[0].sequence == 4
    assert log.cursor("job-1") == 5


def test_duplicate_delivery_is_identifiable(log):
    event = log.append("job-1", "run.started")
    replayed = log.replay("job-1")
    assert replayed[0].identity == event.identity == ("job-1", 1)
    assert replayed[0].event_id == event.event_id


def test_dedup_key_makes_emission_idempotent(log):
    first = log.append("job-1", "search.completed", dedup_key="search:t1")
    again = log.append("job-1", "search.completed", dedup_key="search:t1")
    assert again.identity == first.identity
    assert len(log.replay("job-1")) == 1


def test_payloads_are_redacted_on_append(log):
    provider_env_name = "GLM_API_KEY"
    log.append(
        "job-1",
        "provider.call",
        {
            provider_env_name: "must-not-escape",
            "session_token": "must-not-escape",
            "raw_response": {"text": "raw model output"},
            "model": "qwen3:8b",
            "counts": {"sources": 3},
        },
    )
    payload = log.replay("job-1")[0].payload
    assert payload[provider_env_name] == "***REDACTED***"
    assert payload["session_token"] == "***REDACTED***"
    assert payload["raw_response"] == "***REDACTED***"
    assert payload["model"] == "qwen3:8b"
    assert payload["counts"] == {"sources": 3}


def test_redact_walks_nested_structures():
    value = {
        "cache_key": "visible-on-purpose",
        "nested": {"authorization": "mask", "items": [{"secret_value": "mask"}]},
    }
    result = redact(value)
    assert result["cache_key"] == "visible-on-purpose"
    assert result["nested"]["authorization"] == "***REDACTED***"
    assert result["nested"]["items"][0]["secret_value"] == "***REDACTED***"
    # Original is untouched.
    assert value["nested"]["authorization"] == "mask"


def test_jsonl_round_trip(log):
    log.append("job-1", "run.started", {"plan": "p1"}, task_id=None)
    log.append("job-1", "task.status_changed", {"to": "RUNNING"}, task_id="t1")
    text = log.to_jsonl("job-1")
    lines = [line for line in text.splitlines() if line]
    assert len(lines) == 2
    decoded = [event_from_jsonl(line) for line in lines]
    assert [event.type for event in decoded] == ["run.started", "task.status_changed"]
    assert decoded[1].task_id == "t1"
    assert decoded[0].to_dict()["schema_version"] == EVENT_SCHEMA


def test_malformed_jsonl_is_rejected():
    with pytest.raises(ValueError, match="malformed event JSONL"):
        event_from_jsonl("{not json")
    with pytest.raises(ValueError, match="must decode to an object"):
        event_from_jsonl("[1,2]")
    with pytest.raises(ValueError, match="not a valid"):
        event_from_jsonl(json.dumps({"schema_version": "other.v1"}))


def test_sse_format_and_round_trip(log):
    log.append("job-1", "task.status_changed", {"to": "RUNNING"}, task_id="t1")
    event = log.replay("job-1")[0]
    chunk = event.to_sse()
    assert chunk.startswith("id: 1\nevent: task.status_changed\ndata: ")
    assert chunk.endswith("\n\n")
    parsed = parse_sse(chunk)
    assert len(parsed) == 1
    assert parsed[0].identity == event.identity
    assert parsed[0].payload == {"to": "RUNNING"}


def test_closed_job_rejects_appends_but_keeps_replay(log):
    log.append("job-1", "run.completed")
    log.close("job-1")
    with pytest.raises(EventLogClosed):
        log.append("job-1", "late.event")
    assert [event.sequence for event in log.replay("job-1")] == [1]
    # A consumer reconnecting after a cursor still gets history.
    assert log.replay("job-1", after_sequence=0)[0].type == "run.completed"


def test_wait_for_returns_new_events(log):
    def producer():
        log.append("job-1", "later.event", {"n": 1})

    thread = threading.Thread(target=producer)
    thread.start()
    events = log.wait_for("job-1", after_sequence=0, timeout=5)
    thread.join(timeout=5)
    assert [event.type for event in events] == ["later.event"]


def test_wait_for_blocks_until_event_after_cursor_when_earlier_events_exist(log):
    # A streaming consumer reconnecting on a cursor must wait for the NEXT
    # event, not return an empty list just because the log is non-empty.
    log.append("job-1", "one")
    log.append("job-1", "two")

    def late_producer():
        time.sleep(0.05)
        log.append("job-1", "three")

    thread = threading.Thread(target=late_producer)
    thread.start()
    events = log.wait_for("job-1", after_sequence=2, timeout=5)
    thread.join(timeout=5)
    assert [event.sequence for event in events] == [3]


def test_concurrent_appends_keep_total_order(log):
    def emit(index: int):
        log.append("job-1", f"parallel.{index}")

    threads = [threading.Thread(target=emit, args=(index,)) for index in range(20)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=10)
    sequences = [event.sequence for event in log.replay("job-1")]
    assert sequences == list(range(1, 21))


def test_envelope_to_dict_shape():
    envelope = EventEnvelope(
        event_id="e1",
        job_id="job-1",
        sequence=1,
        timestamp="2026-01-01T00:00:00+00:00",
        type="run.started",
        task_id=None,
        payload={},
    )
    assert envelope.to_dict() == {
        "schema_version": EVENT_SCHEMA,
        "event_id": "e1",
        "job_id": "job-1",
        "sequence": 1,
        "timestamp": "2026-01-01T00:00:00+00:00",
        "type": "run.started",
        "task_id": None,
        "payload": {},
    }
