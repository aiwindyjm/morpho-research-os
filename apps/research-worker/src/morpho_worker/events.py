"""Worker event primitives, aligned to the canonical event.v1 contract.

Wire format (emit side) follows the frozen ``packages/schemas/event.v1.json``
(ADR-015): every serialized envelope carries ``event_id``, ``sequence``,
``occurred_at`` (RFC 3339 UTC), ``run_id`` (nullable), ``project_id``,
``type`` from the canonical domain vocabulary, and an already-redacted
``payload``. Reading stays backward tolerant: the legacy draft names
(``job_id``/``timestamp``/``seq``/``id``/``event_type`` and the
``research.event.v1`` schema marker) are still accepted, so logs written by
older workers keep parsing. Emitters rename to canonical on emit.

Event types are canonicalized at append time through :data:`_CANONICAL_TYPES`
(the worker's older draft names map onto the closed event.v1 vocabulary; the
original name is preserved inside the payload when the rename alone would
lose the distinction). Transport-level ``job.*`` types are *not* domain
events: they belong to ``worker-event.v1.json`` and pass through unchanged.

The log itself is append-only and ordered with one sequence space per key
(run id, plan id, or - through the job-scoped view - job id), cursor-based
reconnect (``replay(key, after_sequence=...)``), duplicate identification via
the stable ``(key, sequence)`` identity, JSONL and SSE codecs, and redaction
of sensitive payload fields before storage. Raw LLM responses and secrets
must never be appended: the redaction layer is a safety net, not a license.
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from typing import Any

from morpho_worker.clock import Clock
from morpho_worker.ids import new_id

#: Canonical event.v1 schema marker (ADR-015).
EVENT_SCHEMA = "1.0"
#: Legacy draft marker accepted on read, never emitted.
LEGACY_EVENT_SCHEMA = "research.event.v1"

#: Substring markers that trigger masking. ``cache_key`` and similar
#: non-secret identifiers are intentionally left visible.
_SENSITIVE_MARKERS = (
    "api_key",
    "apikey",
    "authorization",
    "credential",
    "password",
    "passwd",
    "secret",
    "token",
    "raw_prompt",
    "raw_response",
)
_EXACT_SENSITIVE = {"key", "raw"}
_REDACTED = "***REDACTED***"


def _is_sensitive(name: str) -> bool:
    lowered = name.lower()
    if lowered in _EXACT_SENSITIVE:
        return True
    return any(marker in lowered for marker in _SENSITIVE_MARKERS)


def redact(value: Any) -> Any:
    """Deep-copy ``value`` masking sensitive fields. Lists and dicts are
    walked recursively; everything else is returned as-is."""

    if isinstance(value, dict):
        return {
            name: (_REDACTED if _is_sensitive(name) else redact(item))
            for name, item in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, tuple):
        return [redact(item) for item in value]
    return value


#: Legacy worker event type -> canonical event.v1 type (ADR-015 vocabulary).
#: ``job.*`` transport types (worker-event.v1.json) pass through untouched.
_CANONICAL_TYPES: dict[str, str] = {
    "plan.created": "plan.drafted",
    # A task ending in NEEDS_REVIEW is a review request in the domain
    # vocabulary; the job-level transport event keeps its own name.
    "task.needs_review": "review.requested",
    "run.review_resolved": "review.resolved",
    "task.cancelled": "task.skipped",
    "task.dependency_failed": "task.failed",
    "task.recovered": "task.progress",
    "task.requeued": "task.progress",
    "task.retry_requested": "task.progress",
}

#: Payload key added when a rename alone would lose the distinction between
#: two legacy types folded onto one canonical type.
_PHASE_PAYLOAD_KEY = "phase"
_OUTCOME_PAYLOAD_KEY = "outcome"


def canonicalize_event(event_type: str, payload: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Rename a legacy worker event type onto the event.v1 vocabulary.

    Returns the canonical type plus a payload copy that records the original
    name under ``phase``/``outcome`` when several legacy types fold onto one
    canonical type. Unknown types (including the ``job.*`` transport
    vocabulary and explicit extensions such as ``run.incremental_report``)
    pass through unchanged.
    """

    target = _CANONICAL_TYPES.get(event_type)
    if target is None:
        return event_type, dict(payload or {})
    updated = dict(payload or {})
    if event_type in ("task.recovered", "task.requeued", "task.retry_requested"):
        updated.setdefault(_PHASE_PAYLOAD_KEY, event_type.split(".", 1)[1])
    elif event_type == "task.cancelled":
        updated.setdefault(_OUTCOME_PAYLOAD_KEY, "cancelled")
    elif event_type == "task.dependency_failed":
        updated.setdefault(_OUTCOME_PAYLOAD_KEY, "dependency_failed")
    return target, updated


@dataclass(frozen=True)
class EventEnvelope:
    """One serialized event, shaped per ``event.v1.json`` on the wire."""

    event_id: str
    #: Owning run (or, through the job-scoped log view, transport job id).
    #: ``None`` marks project-level events (plan lifecycle without a run).
    run_id: str | None
    sequence: int
    occurred_at: str
    project_id: str = ""
    type: str = ""
    task_id: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    summary: str = ""

    @property
    def identity(self) -> tuple[str, int]:
        """Stable identity used to detect duplicate delivery on reconnect."""

        return (self.run_id or "", self.sequence)

    def to_dict(self) -> dict[str, Any]:
        # Canonical event.v1 wire shape: run_id is emitted nullable, task_id
        # and summary are optional and therefore omitted when unset (the
        # schema does not allow null for them).
        data: dict[str, Any] = {
            "schema_version": EVENT_SCHEMA,
            "event_id": self.event_id,
            "sequence": self.sequence,
            "occurred_at": self.occurred_at,
            "run_id": self.run_id,
            "project_id": self.project_id,
            "type": self.type,
            "payload": self.payload,
        }
        if self.task_id is not None:
            data["task_id"] = self.task_id
        if self.summary:
            data["summary"] = self.summary
        return data

    def to_jsonl(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, separators=(",", ":"))

    def to_sse(self) -> str:
        data = json.dumps(self.to_dict(), ensure_ascii=False, separators=(",", ":"))
        lines = [f"id: {self.sequence}", f"event: {self.type}", f"data: {data}", ""]
        return "\n".join(lines) + "\n"


def event_from_dict(data: dict[str, Any]) -> EventEnvelope:
    """Parse an envelope, accepting both canonical event.v1 fields and the
    legacy draft names (``job_id``, ``timestamp``, ``seq``, ``id``,
    ``event_type``) plus the legacy ``research.event.v1`` schema marker."""

    schema = data.get("schema_version")
    if schema not in (EVENT_SCHEMA, LEGACY_EVENT_SCHEMA):
        raise ValueError(f"not a valid {EVENT_SCHEMA} envelope (schema_version={schema!r})")

    def _first(*names: str) -> Any:
        for name in names:
            if name in data and data[name] is not None:
                return data[name]
        return None

    event_id = _first("event_id", "id")
    sequence = _first("sequence", "seq")
    occurred = _first("occurred_at", "timestamp")
    run_id = _first("run_id", "job_id")
    event_type = _first("type", "event_type")
    missing = [
        name
        for name, value in (
            ("event_id", event_id),
            ("sequence", sequence),
            ("occurred_at", occurred),
            ("type", event_type),
        )
        if value is None
    ]
    if missing:
        raise ValueError(
            f"not a valid {EVENT_SCHEMA} envelope (missing: {', '.join(missing)})"
        )
    payload = data.get("payload")
    if payload is not None and not isinstance(payload, dict):
        raise ValueError("event payload must be an object")
    task_id = data.get("task_id")
    return EventEnvelope(
        event_id=str(event_id),
        run_id=str(run_id) if run_id is not None else None,
        sequence=int(sequence),  # type: ignore[arg-type]
        occurred_at=str(occurred),
        project_id=str(data.get("project_id") or ""),
        type=str(event_type),
        task_id=str(task_id) if task_id is not None else None,
        payload=dict(payload or {}),
        summary=str(data.get("summary") or ""),
    )


def event_from_jsonl(line: str) -> EventEnvelope:
    try:
        data = json.loads(line)
    except json.JSONDecodeError as exc:
        raise ValueError(f"malformed event JSONL: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("event JSONL line must decode to an object")
    return event_from_dict(data)


def parse_sse(chunk: str) -> list[EventEnvelope]:
    """Parse a finite SSE chunk back into envelopes (protocol tests)."""

    events: list[EventEnvelope] = []
    for block in chunk.split("\n\n"):
        block = block.strip("\n")
        if not block.strip():
            continue
        data_lines: list[str] = []
        for line in block.split("\n"):
            if line.startswith("data:"):
                data_lines.append(line[len("data:") :].lstrip())
        if not data_lines:
            raise ValueError("SSE block without data line")
        events.append(event_from_jsonl("\n".join(data_lines)))
    return events


class EventLogClosed(RuntimeError):
    """Raised when appending to a closed job event log."""


class EventLog:
    """Ordered, append-only, reconnectable event log.

    One sequence space per key (run id, plan id, or job id through the
    job-scoped view). Appends assign the sequence under a lock, so events
    emitted from worker threads are totally ordered. Consumers reconnect by
    asking for everything after their last seen sequence. Types are
    canonicalized onto the event.v1 vocabulary at append time; the log-level
    ``project_id`` is the fallback attribution when an emitter does not know
    the project (draft tolerance: the canonical schema wants a non-empty
    ``project_id``, emitters that can should pass it explicitly).
    """

    def __init__(self, clock: Clock, project_id: str = "") -> None:
        self._clock = clock
        self._default_project_id = project_id
        self._lock = threading.Lock()
        self._condition = threading.Condition(self._lock)
        self._events: dict[str, list[EventEnvelope]] = {}
        self._dedup: dict[tuple[str, str], EventEnvelope] = {}
        self._closed: set[str] = set()

    def append(
        self,
        job_id: str,
        event_type: str,
        payload: dict[str, Any] | None = None,
        *,
        task_id: str | None = None,
        dedup_key: str | None = None,
        redact_payload: bool = True,
        project_id: str = "",
    ) -> EventEnvelope:
        canonical_type, enriched = canonicalize_event(event_type, payload or {})
        stored_payload = redact(enriched) if redact_payload else enriched
        with self._condition:
            if job_id in self._closed:
                raise EventLogClosed(f"event log for job {job_id} is closed")
            if dedup_key is not None:
                existing = self._dedup.get((job_id, dedup_key))
                if existing is not None:
                    return existing
            sequence = len(self._events.get(job_id, [])) + 1
            envelope = EventEnvelope(
                event_id=new_id(),
                run_id=job_id,
                sequence=sequence,
                occurred_at=self._clock.now_utc().isoformat(),
                project_id=project_id or self._default_project_id,
                type=canonical_type,
                task_id=task_id,
                payload=stored_payload,
            )
            self._events.setdefault(job_id, []).append(envelope)
            if dedup_key is not None:
                self._dedup[(job_id, dedup_key)] = envelope
            self._condition.notify_all()
            return envelope

    def replay(
        self, job_id: str, after_sequence: int = 0, limit: int | None = None
    ) -> list[EventEnvelope]:
        """Events strictly after ``after_sequence`` (cursor reconnect)."""

        with self._lock:
            events = self._events.get(job_id, [])
            selected = [event for event in events if event.sequence > after_sequence]
            return selected[:limit] if limit is not None else list(selected)

    def cursor(self, job_id: str) -> int:
        """Last assigned sequence for the job (0 when no events exist)."""

        with self._lock:
            events = self._events.get(job_id, [])
            return events[-1].sequence if events else 0

    def wait_for(
        self, job_id: str, after_sequence: int, timeout: float | None = None
    ) -> list[EventEnvelope]:
        """Block until at least one event after the cursor exists.

        Waits whenever there is nothing new after ``after_sequence`` (whether
        the log is empty or only holds events at/before the cursor), which is
        what streaming consumers reconnecting on a cursor need.
        """

        with self._condition:
            events = self._events.get(job_id, [])
            if not [event for event in events if event.sequence > after_sequence]:
                self._condition.wait(timeout=timeout)
                events = self._events.get(job_id, [])
            return [event for event in events if event.sequence > after_sequence]

    def close(self, job_id: str) -> None:
        """Close a finished job's log: appends fail, replay keeps working so
        late reconnects still resume from their cursor."""

        with self._lock:
            self._closed.add(job_id)

    def to_jsonl(self, job_id: str, after_sequence: int = 0) -> str:
        return "".join(event.to_jsonl() + "\n" for event in self.replay(job_id, after_sequence))
