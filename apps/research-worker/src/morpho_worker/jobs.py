"""Job HTTP surface wiring the transport to the orchestrator (draft W2-02).

Closes the PRD §8 worker protocol gap on top of the existing pieces (no new
dependencies, no protocol changes elsewhere):

- ``POST /jobs`` validates a job request envelope strictly (unknown fields
  rejected) and maps the ``research_run`` job kind onto the full pipeline:
  planner -> plan approval gate -> DAG run, executed with the injected
  providers (offline/mock by default in tests and mock mode);
- ``GET /jobs/{job_id}`` surfaces the mapped job status
  (PENDING/PLANNING/RUNNING/VALIDATING/NEEDS_REVIEW/PAUSED/COMPLETED/
  FAILED/CANCELLED) plus task counts;
- ``POST /jobs/{job_id}/cancel`` triggers the DAG runner's cooperative
  cancel and is idempotent: cancelling a terminal job returns the terminal
  state instead of an error;
- ``GET /jobs/{job_id}/events`` streams the per-job ``EventLog`` as SSE
  (``id: <sequence>`` framing), replaying from ``Last-Event-ID`` header or
  ``?after_sequence=`` cursor, keeping the stream open for new events with
  comment heartbeats, and ending cleanly (sentinel comment) once the job
  reaches a terminal state. Client disconnects abort the producer.

Each job owns a private ``EventLog`` pinned to the job id, so plan, run, and
task events land in one totally ordered, append-only sequence space. The job
thread follows the dag/runner threading pattern: the orchestrator blocks on
its own worker thread and appends events under the log lock, so sequences
stay monotonic under concurrency.

Decisions kept deliberately explicit (all draft until W2-02):

- ``approve_plan=true`` in the request envelope is the caller's plan review
  decision (the CLI ``--approve`` equivalent); without it the request fails
  with the documented ``PLAN_NOT_APPROVED`` code and no DAG is ever built.
- ``NEEDS_REVIEW`` ends the job thread and stream: this draft has no
  review-resolution endpoint, so the run is over even though claims await
  user review.
- Unknown job kinds fail with the draft transport code
  ``UNSUPPORTED_JOB_KIND`` (alongside UNAUTHORIZED/NOT_FOUND/BAD_REQUEST).
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from typing import Any, Callable

from pydantic import ValidationError

from morpho_worker.clock import Clock, SystemClock
from morpho_worker.dag.states import RunStatus, TaskStatus
from morpho_worker.domain.research import ResearchConfig
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.events import EventLog
from morpho_worker.ids import new_id
from morpho_worker.orchestrator import ResearchOrchestrator
from morpho_worker.transport import StreamResponse, error_envelope
from morpho_worker.version import WORKER_PROTOCOL_VERSION

JOB_SCHEMA_VERSION = "1"
JOB_KIND_RESEARCH_RUN = "research_run"
#: Job kinds this worker can execute; they map onto orchestrator pipelines.
JOB_KINDS = frozenset({JOB_KIND_RESEARCH_RUN})

_REQUEST_FIELDS = frozenset({"schema_version", "kind", "config", "approve_plan"})

#: Mapped terminal job status -> final event appended to the per-job log.
_TERMINAL_EVENTS = {
    "COMPLETED": "job.completed",
    "NEEDS_REVIEW": "job.needs_review",
    "FAILED": "job.failed",
    "CANCELLED": "job.cancelled",
}

#: Builds the orchestrator (with offline/mock or configured providers) for
#: one job; receives the job's pinned event log so all progress lands in the
#: job's single stream.
OrchestratorFactory = Callable[[EventLog], ResearchOrchestrator]


def _job_not_found(job_id: str) -> dict[str, Any]:
    return error_envelope(
        "NOT_FOUND",
        "The requested job does not exist.",
        developer_detail=f"job_id={job_id}",
    )


class _JobScopedEventLog(EventLog):
    """Per-job ``EventLog`` view pinning every operation to one job id.

    The orchestrator and DAG runner emit under run ids (and plan ids for the
    plan lifecycle); this subclass folds them into the job's single ordered
    sequence space so consumers reconnect on one cursor per job.
    """

    def __init__(self, job_id: str, clock: Clock | None, project_id: str = "") -> None:
        super().__init__(clock or SystemClock(), project_id=project_id)
        self._job_key = job_id

    def append(
        self,
        job_id: str,
        event_type: str,
        payload: dict | None = None,
        *,
        task_id: str | None = None,
        dedup_key: str | None = None,
        redact_payload: bool = True,
        project_id: str = "",
    ):
        return super().append(
            self._job_key,
            event_type,
            payload,
            task_id=task_id,
            dedup_key=dedup_key,
            redact_payload=redact_payload,
            project_id=project_id,
        )

    def replay(self, job_id: str, after_sequence: int = 0, limit: int | None = None):
        return super().replay(self._job_key, after_sequence, limit)

    def cursor(self, job_id: str = "") -> int:
        return super().cursor(self._job_key)

    def wait_for(
        self, job_id: str, after_sequence: int = 0, timeout: float | None = None
    ):
        return super().wait_for(self._job_key, after_sequence, timeout)


@dataclass
class JobRecord:
    """Worker-side job state; the HTTP envelope is a projection of this."""

    job_id: str
    kind: str
    config: ResearchConfig
    created_at: str
    orchestrator: ResearchOrchestrator
    event_log: _JobScopedEventLog
    updated_at: str = ""
    plan_id: str | None = None
    run_id: str | None = None
    #: Set only after the terminal event is appended (stream consumers that
    #: observe the flag always get the terminal event first).
    terminal_status: str | None = None
    cancel_requested: bool = False
    error: dict[str, Any] | None = None


def _validate_job_request(request: dict[str, Any]) -> ResearchConfig:
    """Strict validation of the draft job request envelope.

    Raises ``MorphoError`` with a stable code (BAD_REQUEST /
    UNSUPPORTED_JOB_KIND / PLAN_NOT_APPROVED); the transport maps it to the
    structured 400 error envelope.
    """

    unknown = sorted(set(request) - _REQUEST_FIELDS)
    if unknown:
        raise MorphoError(
            "BAD_REQUEST",
            "The job request contains unknown fields.",
            developer_detail=f"unknown fields: {', '.join(unknown)}",
            retryable=False,
        )
    missing = [name for name in ("schema_version", "kind", "config") if name not in request]
    if missing:
        raise MorphoError(
            "BAD_REQUEST",
            "The job request is missing required fields.",
            developer_detail=f"missing fields: {', '.join(missing)}",
            retryable=False,
        )
    if request["schema_version"] != JOB_SCHEMA_VERSION:
        raise MorphoError(
            "BAD_REQUEST",
            'The job request schema_version must be "1".',
            developer_detail=f"schema_version={request['schema_version']!r}",
            retryable=False,
        )
    kind = request["kind"]
    if not isinstance(kind, str) or kind not in JOB_KINDS:
        raise MorphoError(
            "UNSUPPORTED_JOB_KIND",
            "The requested job kind is not supported by this worker.",
            developer_detail=f"kind={kind!r} supported={sorted(JOB_KINDS)}",
            retryable=False,
        )
    approve = request.get("approve_plan", False)
    if not isinstance(approve, bool):
        raise MorphoError(
            "BAD_REQUEST",
            "approve_plan must be a boolean.",
            developer_detail=f"approve_plan={approve!r}",
            retryable=False,
        )
    config_data = request["config"]
    if not isinstance(config_data, dict):
        raise MorphoError(
            "BAD_REQUEST",
            "The job config must be a JSON object.",
            retryable=False,
        )
    try:
        config = ResearchConfig.model_validate(config_data)
    except ValidationError as exc:
        raise MorphoError(
            "BAD_REQUEST",
            "The research configuration is invalid.",
            developer_detail=f"config validation failed: {exc}",
            retryable=False,
        ) from exc
    if not approve:
        # Plan review gate (PRD: no DAG before approval): the caller must
        # carry the approval decision in the job request envelope.
        raise MorphoError(
            ErrorCode.PLAN_NOT_APPROVED,
            "The job request does not approve the research plan. "
            "Set approve_plan=true after review; no DAG runs before approval.",
            retryable=False,
        )
    return config


def _requested_cursor(request: dict[str, Any]) -> int:
    """Cursor from the ``Last-Event-ID`` header and/or ``?after_sequence=``.

    Both reconnect forms are supported; when both are present the larger
    (safer) cursor wins. Invalid values fail with BAD_REQUEST.
    """

    headers = {
        str(name).lower(): str(value)
        for name, value in request.get("headers", {}).items()
    }
    raw_values = (
        headers.get("last-event-id"),
        request.get("query", {}).get("after_sequence"),
    )
    cursor = 0
    for raw in raw_values:
        if raw is None or raw == "":
            continue
        try:
            value = int(str(raw), 10)
        except ValueError as exc:
            raise MorphoError(
                "BAD_REQUEST",
                "The event cursor must be a non-negative integer.",
                developer_detail=f"cursor={raw!r}",
                retryable=False,
            ) from exc
        if value < 0:
            raise MorphoError(
                "BAD_REQUEST",
                "The event cursor must be a non-negative integer.",
                developer_detail=f"cursor={raw!r}",
                retryable=False,
            )
        cursor = max(cursor, value)
    return cursor


class JobService:
    """Owns the job lifecycle behind the HTTP surface: request validation,
    the per-job worker thread, status envelopes, cooperative cancel, and the
    per-job SSE stream. Holds no persistence: run/task state lives in the
    orchestrator's state store, events in the per-job ``EventLog``.
    """

    def __init__(
        self,
        *,
        orchestrator_factory: OrchestratorFactory,
        clock: Clock | None = None,
        heartbeat_seconds: float = 15.0,
    ) -> None:
        self._factory = orchestrator_factory
        self._clock = clock or SystemClock()
        self._heartbeat_seconds = heartbeat_seconds
        self._lock = threading.Lock()
        self._jobs: dict[str, JobRecord] = {}
        self._threads: list[threading.Thread] = []

    # Route registration ------------------------------------------------------

    def routes(self) -> dict[tuple[str, str], Any]:
        """Exact-route entries for the transport's route table."""

        return {("POST", "/jobs"): self._http_create}

    def param_routes(self) -> list[tuple[str, str, Any]]:
        """``{param}`` pattern routes for the transport's param table."""

        return [
            ("GET", "/jobs/{job_id}", self._http_get),
            ("POST", "/jobs/{job_id}/cancel", self._http_cancel),
            ("GET", "/jobs/{job_id}/events", self._http_events),
        ]

    # HTTP adapters (thin: transport owns auth and error envelopes) ----------

    def _http_create(self, request: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        return self.create_job(request)

    def _http_get(
        self, request: dict[str, Any], params: dict[str, str]
    ) -> tuple[int, dict[str, Any]]:
        job_id = params["job_id"]
        envelope = self.job_envelope(job_id)
        if envelope is None:
            return 404, _job_not_found(job_id)
        return 200, envelope

    def _http_cancel(
        self, request: dict[str, Any], params: dict[str, str]
    ) -> tuple[int, dict[str, Any]]:
        job_id = params["job_id"]
        envelope = self.cancel_job(job_id)
        if envelope is None:
            return 404, _job_not_found(job_id)
        return 200, envelope

    def _http_events(
        self, request: dict[str, Any], params: dict[str, str]
    ) -> Any:
        job_id = params["job_id"]
        job = self._get_job(job_id)
        if job is None:
            return 404, _job_not_found(job_id)
        after = _requested_cursor(request)
        return StreamResponse(
            content_type="text/event-stream",
            chunks=self._sse_chunks(job_id, after),
        )

    # Job lifecycle -------------------------------------------------------------

    def create_job(self, request: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        """Validate the request envelope and start the job (201 + envelope).

        Invalid or unapproved requests raise ``MorphoError`` before anything
        is created; the transport maps it to the structured 400 envelope.
        """

        config = _validate_job_request(request)
        job_id = new_id()
        event_log = _JobScopedEventLog(
            job_id, self._clock, project_id=config.project_id
        )
        orchestrator = self._factory(event_log)
        job = JobRecord(
            job_id=job_id,
            kind=JOB_KIND_RESEARCH_RUN,
            config=config,
            created_at=self._now(),
            updated_at=self._now(),
            orchestrator=orchestrator,
            event_log=event_log,
        )
        thread = threading.Thread(
            target=self._execute_job,
            args=(job,),
            name=f"morpho-job-{job_id[:8]}",
            daemon=True,
        )
        with self._lock:
            self._jobs[job_id] = job
            self._threads.append(thread)
        thread.start()
        return 201, self.job_envelope(job_id)

    def job_envelope(self, job_id: str) -> dict[str, Any] | None:
        """Draft job envelope (fields stay draft until the W2-02 freeze)."""

        job = self._get_job(job_id)
        if job is None:
            return None
        with self._lock:
            snapshot = {
                "job_id": job.job_id,
                "kind": job.kind,
                "created_at": job.created_at,
                "updated_at": job.updated_at,
                "plan_id": job.plan_id,
                "run_id": job.run_id,
                "error": job.error,
            }
        return {
            "schema_version": JOB_SCHEMA_VERSION,
            "job": {
                **snapshot,
                "status": self._mapped_status(job),
                "protocol_version": WORKER_PROTOCOL_VERSION,
                "counts": self._counts(job),
            },
        }

    def cancel_job(self, job_id: str) -> dict[str, Any] | None:
        """Cooperative cancel through the runner; idempotent for terminal
        jobs (returns the terminal state, never an error).

        Cancel races with the run start are cooperative: a cancel that lands
        after the pre-run check but before the run exists is absorbed by the
        next runner loop iteration only if the run is already visible; the
        draft accepts this microsecond window.
        """

        job = self._get_job(job_id)
        if job is None:
            return None
        with self._lock:
            terminal = job.terminal_status
            run_id = job.run_id
            if terminal is None:
                job.cancel_requested = True
        if terminal is not None or run_id is None:
            return self.job_envelope(job_id)
        run = job.orchestrator.run_status(run_id)
        if run is not None and run.status not in (
            RunStatus.COMPLETED,
            RunStatus.CANCELLED,
            RunStatus.FAILED,
        ):
            job.orchestrator.cancel_run(run_id)
        return self.job_envelope(job_id)

    def shutdown(self, wait_seconds: float = 10.0) -> None:
        """Best-effort join of job threads (they are daemon threads)."""

        for thread in list(self._threads):
            thread.join(timeout=wait_seconds)

    # Job execution ---------------------------------------------------------------

    def _execute_job(self, job: JobRecord) -> None:
        """Job thread: plan -> approval -> run, mirroring the dag/runner
        threading pattern. Progress flows exclusively through the per-job
        event log; the job record only carries ids and terminal state."""

        orchestrator = job.orchestrator
        log = job.event_log
        try:
            plan = orchestrator.create_plan(
                job.config, project_id=job.config.project_id
            )
            with self._lock:
                job.plan_id = plan.plan_id
                job.updated_at = self._now()
            if self._is_cancel_requested(job):
                log.append(
                    job.job_id,
                    "job.cancelled",
                    {"reason": "cancelled before the run started"},
                )
                self._mark_terminal(job, "CANCELLED")
                return
            # The approval decision arrived in the job request envelope; the
            # plan store still gates start_run on it (PLAN_NOT_APPROVED).
            orchestrator.approve_plan(
                plan.plan_id, note="approved via job request envelope"
            )
            # start_run blocks until the run ends; on_run_created publishes
            # the run id immediately so cancel/status can reach the runner.
            orchestrator.start_run(
                plan.plan_id, on_run_created=lambda run_id: self._set_run_id(job, run_id)
            )
            status = self._mapped_status(job)
            log.append(
                job.job_id, _TERMINAL_EVENTS.get(status, "job.completed"),
                {"status": status},
            )
            self._mark_terminal(job, status)
        except MorphoError as exc:
            error = exc.to_dict()
            log.append(job.job_id, "job.failed", {"error_code": error["code"]})
            with self._lock:
                job.error = error
            self._mark_terminal(job, "FAILED")
        except Exception as exc:  # defensive: job bugs fail the job, not the worker
            error = MorphoError(
                ErrorCode.WORKER_NOT_AVAILABLE,
                "The worker failed while executing the job.",
                developer_detail=f"{type(exc).__name__}: {exc}",
                retryable=False,
            ).to_dict()
            log.append(job.job_id, "job.failed", {"error_code": error["code"]})
            with self._lock:
                job.error = error
            self._mark_terminal(job, "FAILED")
        finally:
            try:
                orchestrator.shutdown()
            except Exception:  # pragma: no cover - defensive cleanup
                pass

    def _mapped_status(self, job: JobRecord) -> str:
        """Map run/task state onto the documented job status set.

        Run COMPLETED with a NEEDS_REVIEW task maps to NEEDS_REVIEW; run
        RUNNING with the validate task in VALIDATING maps to VALIDATING
        (PLANNING covers the pre-run plan drafting phase).
        """

        with self._lock:
            terminal = job.terminal_status
            run_id = job.run_id
        if terminal is not None:
            return terminal
        if run_id is None:
            return "PLANNING"
        run = job.orchestrator.run_status(run_id)
        if run is None:  # pragma: no cover - a set run_id always exists
            return "PENDING"
        tasks = job.orchestrator.task_status(run_id)
        statuses = {task.status for task in tasks}
        if TaskStatus.NEEDS_REVIEW in statuses:
            return "NEEDS_REVIEW"
        if run.status is RunStatus.RUNNING:
            if TaskStatus.VALIDATING in statuses:
                return "VALIDATING"
            return "RUNNING"
        if run.status is RunStatus.COMPLETED:
            return "COMPLETED"
        return run.status.value  # PENDING / PAUSED / FAILED / CANCELLED

    def _counts(self, job: JobRecord) -> dict[str, int]:
        counts = {
            "tasks_total": 0,
            "tasks_pending": 0,
            "tasks_running": 0,
            "tasks_completed": 0,
            "tasks_failed": 0,
            "tasks_cancelled": 0,
            "tasks_needs_review": 0,
        }
        with self._lock:
            run_id = job.run_id
        if run_id is None:
            return counts
        for task in job.orchestrator.task_status(run_id):
            counts["tasks_total"] += 1
            if task.status in (TaskStatus.PENDING, TaskStatus.PLANNING, TaskStatus.PAUSED):
                counts["tasks_pending"] += 1
            elif task.status in (TaskStatus.RUNNING, TaskStatus.VALIDATING):
                counts["tasks_running"] += 1
            elif task.status is TaskStatus.COMPLETED:
                counts["tasks_completed"] += 1
            elif task.status is TaskStatus.FAILED:
                counts["tasks_failed"] += 1
            elif task.status is TaskStatus.CANCELLED:
                counts["tasks_cancelled"] += 1
            elif task.status is TaskStatus.NEEDS_REVIEW:
                counts["tasks_needs_review"] += 1
        return counts

    # SSE stream -----------------------------------------------------------------

    def _sse_chunks(self, job_id: str, after_sequence: int):
        """SSE frames: backlog replay, then live events until the job is
        terminal and fully delivered, then a sentinel comment and clean EOF.

        Frames use the ``EventLog`` SSE codec, so every event carries
        ``id: <sequence>`` (the reconnect cursor) and the stored — already
        redacted — envelope. Comment frames carry heartbeats and the end
        sentinel; they are invisible to event consumers by SSE rules.
        """

        job = self._get_job(job_id)
        if job is None:  # pragma: no cover - the HTTP adapter checked first
            return
        log = job.event_log
        cursor = after_sequence
        for event in log.replay(job_id, after_sequence=cursor):
            yield event.to_sse()
            cursor = event.sequence
        while True:
            with self._lock:
                terminal = job.terminal_status
            if terminal is not None and log.cursor(job_id) <= cursor:
                yield f": morpho stream end (job_id={job_id}, status={terminal})\n\n"
                return
            events = log.wait_for(job_id, cursor, timeout=self._heartbeat_seconds)
            if not events:
                yield ": morpho keep-alive\n\n"
                continue
            for event in events:
                yield event.to_sse()
                cursor = event.sequence

    # internals ----------------------------------------------------------------

    def _get_job(self, job_id: str) -> JobRecord | None:
        with self._lock:
            return self._jobs.get(job_id)

    def _set_run_id(self, job: JobRecord, run_id: str) -> None:
        with self._lock:
            if job.run_id is None:
                job.run_id = run_id
                job.updated_at = self._now()

    def _is_cancel_requested(self, job: JobRecord) -> bool:
        with self._lock:
            return job.cancel_requested

    def _mark_terminal(self, job: JobRecord, status: str) -> None:
        # Only called after the terminal event is appended, so a stream that
        # observes the flag has necessarily received the terminal event.
        with self._lock:
            job.terminal_status = status
            job.updated_at = self._now()

    def _now(self) -> str:
        return self._clock.now_utc().isoformat()
