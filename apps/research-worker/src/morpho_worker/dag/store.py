"""Run/task state store (RES-02, worker-side draft).

The worker keeps run/task state through this injected port. The in-memory
implementation backs tests and offline mock mode; the durable authoritative
store is the Rust core's SQLite, bridged via the worker protocol later. The
worker therefore never writes SQLite directly, and the port boundary keeps
that swap mechanical.

The store is the ONLY writer of task state and enforces the documented
state machine (``dag/states.py``) on every mutation.
"""

from __future__ import annotations

import threading

from pydantic import BaseModel, ConfigDict, Field

from morpho_worker.clock import Clock
from morpho_worker.dag.states import (
    INTERRUPTIBLE_STATUSES,
    IllegalTransition,
    RunStatus,
    TaskStatus,
    validate_transition,
)
from morpho_worker.domain.research import RuntimeTaskType
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.providers.usage import utc_now_iso


class TaskRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str
    run_id: str
    task_type: RuntimeTaskType
    title: str = ""
    params: dict = Field(default_factory=dict)
    depends_on: list[str] = Field(default_factory=list)
    status: TaskStatus = TaskStatus.PENDING
    attempt: int = 0
    max_attempts: int = 3
    #: Stable dedup/identity key: re-creating a task with the same key is a
    #: no-op, and completed keys make re-runs idempotent.
    idempotency_key: str = ""
    checkpoint: dict | None = None
    result: dict | None = None
    error: dict | None = None
    #: Explicitly skipped tasks satisfy their dependents (PRD §7).
    skipped: bool = False
    created_at: str = ""
    updated_at: str = ""


class RunRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str
    plan_id: str
    project_id: str = ""
    config_fingerprint: str = ""
    status: RunStatus = RunStatus.PENDING
    #: Run-level result summary attached at run end (e.g. the incremental
    #: research report summary); task results stay on their task records.
    result: dict | None = None
    created_at: str = ""
    updated_at: str = ""


class StateStore:
    """Port. Subclass (or replace) to bridge durable storage."""

    # runs
    def create_run(self, run: RunRecord) -> RunRecord: ...
    def get_run(self, run_id: str) -> RunRecord | None: ...
    def update_run_status(self, run_id: str, status: RunStatus) -> RunRecord: ...
    def set_run_result(self, run_id: str, result: dict) -> RunRecord: ...

    # tasks
    def add_task(self, task: TaskRecord) -> TaskRecord: ...
    def get_task(self, task_id: str) -> TaskRecord | None: ...
    def list_tasks(self, run_id: str) -> list[TaskRecord]: ...
    def transition(self, task_id: str, to_status: TaskStatus) -> TaskRecord: ...
    def start_attempt(self, task_id: str) -> TaskRecord: ...
    def set_checkpoint(self, task_id: str, checkpoint: dict) -> TaskRecord: ...
    def set_result(self, task_id: str, result: dict) -> TaskRecord: ...
    def set_error(self, task_id: str, error: dict) -> TaskRecord: ...
    def mark_skipped(self, task_id: str) -> TaskRecord: ...

    # idempotency
    def find_by_idempotency_key(self, run_id: str, key: str) -> TaskRecord | None: ...

    # snapshot bridge (crash recovery tests / future Rust serialization)
    def snapshot(self) -> dict: ...
    def restore(self, snapshot: dict) -> None: ...


class InMemoryStateStore(StateStore):
    def __init__(self, clock: Clock | None = None) -> None:
        self._clock = clock
        self._lock = threading.Lock()
        self._runs: dict[str, RunRecord] = {}
        self._tasks: dict[str, TaskRecord] = {}

    # helpers -------------------------------------------------------------

    def _now(self) -> str:
        return self._clock.now_utc().isoformat() if self._clock else utc_now_iso()

    # runs -----------------------------------------------------------------

    def create_run(self, run: RunRecord) -> RunRecord:
        with self._lock:
            if run.run_id in self._runs:
                raise MorphoError(
                    ErrorCode.DATABASE_ERROR,
                    "A run with this id already exists.",
                    developer_detail=f"run_id={run.run_id}",
                    retryable=False,
                )
            stored = run.model_copy(deep=True)
            stored.created_at = stored.created_at or self._now()
            stored.updated_at = self._now()
            self._runs[run.run_id] = stored
            return stored.model_copy(deep=True)

    def get_run(self, run_id: str) -> RunRecord | None:
        with self._lock:
            run = self._runs.get(run_id)
            return run.model_copy(deep=True) if run else None

    def update_run_status(self, run_id: str, status: RunStatus) -> RunRecord:
        with self._lock:
            run = self._runs.get(run_id)
            if run is None:
                raise MorphoError(
                    ErrorCode.DATABASE_ERROR,
                    "The run does not exist.",
                    developer_detail=f"run_id={run_id}",
                    retryable=False,
                )
            run.status = status
            run.updated_at = self._now()
            return run.model_copy(deep=True)

    def set_run_result(self, run_id: str, result: dict) -> RunRecord:
        with self._lock:
            run = self._runs.get(run_id)
            if run is None:
                raise MorphoError(
                    ErrorCode.DATABASE_ERROR,
                    "The run does not exist.",
                    developer_detail=f"run_id={run_id}",
                    retryable=False,
                )
            run.result = dict(result)
            run.updated_at = self._now()
            return run.model_copy(deep=True)

    # tasks ----------------------------------------------------------------

    def add_task(self, task: TaskRecord) -> TaskRecord:
        with self._lock:
            if task.task_id in self._tasks:
                raise MorphoError(
                    ErrorCode.DATABASE_ERROR,
                    "A task with this id already exists.",
                    developer_detail=f"task_id={task.task_id}",
                    retryable=False,
                )
            stored = task.model_copy(deep=True)
            stored.created_at = self._now()
            stored.updated_at = self._now()
            self._tasks[task.task_id] = stored
            return stored.model_copy(deep=True)

    def get_task(self, task_id: str) -> TaskRecord | None:
        with self._lock:
            task = self._tasks.get(task_id)
            return task.model_copy(deep=True) if task else None

    def list_tasks(self, run_id: str) -> list[TaskRecord]:
        with self._lock:
            return [
                task.model_copy(deep=True)
                for task in self._tasks.values()
                if task.run_id == run_id
            ]

    def transition(self, task_id: str, to_status: TaskStatus) -> TaskRecord:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                raise MorphoError(
                    ErrorCode.DATABASE_ERROR,
                    "The task does not exist.",
                    developer_detail=f"task_id={task_id}",
                    retryable=False,
                )
            try:
                validate_transition(task.status, to_status)
            except IllegalTransition as exc:
                raise MorphoError(
                    ErrorCode.TASK_DEPENDENCY_FAILED,
                    "The task state transition is not allowed.",
                    developer_detail=str(exc),
                    retryable=False,
                ) from exc
            task.status = to_status
            task.updated_at = self._now()
            return task.model_copy(deep=True)

    def start_attempt(self, task_id: str) -> TaskRecord:
        with self._lock:
            task = self._tasks[task_id]
            task.attempt += 1
            task.updated_at = self._now()
            return task.model_copy(deep=True)

    def set_checkpoint(self, task_id: str, checkpoint: dict) -> TaskRecord:
        with self._lock:
            task = self._tasks[task_id]
            task.checkpoint = dict(checkpoint)
            task.updated_at = self._now()
            return task.model_copy(deep=True)

    def set_result(self, task_id: str, result: dict) -> TaskRecord:
        with self._lock:
            task = self._tasks[task_id]
            task.result = dict(result)
            task.updated_at = self._now()
            return task.model_copy(deep=True)

    def set_error(self, task_id: str, error: dict) -> TaskRecord:
        with self._lock:
            task = self._tasks[task_id]
            task.error = dict(error)
            task.updated_at = self._now()
            return task.model_copy(deep=True)

    def mark_skipped(self, task_id: str) -> TaskRecord:
        with self._lock:
            task = self._tasks[task_id]
            task.skipped = True
            task.updated_at = self._now()
            return task.model_copy(deep=True)

    # idempotency -----------------------------------------------------------

    def find_by_idempotency_key(self, run_id: str, key: str) -> TaskRecord | None:
        with self._lock:
            for task in self._tasks.values():
                if task.run_id == run_id and task.idempotency_key == key:
                    return task.model_copy(deep=True)
            return None

    # snapshot ---------------------------------------------------------------

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "runs": {key: run.model_dump(mode="json") for key, run in self._runs.items()},
                "tasks": {
                    key: task.model_dump(mode="json") for key, task in self._tasks.items()
                },
            }

    def restore(self, snapshot: dict) -> None:
        with self._lock:
            self._runs = {
                key: RunRecord.model_validate(value) for key, value in snapshot["runs"].items()
            }
            self._tasks = {
                key: TaskRecord.model_validate(value)
                for key, value in snapshot["tasks"].items()
            }

    def interrupted_tasks(self, run_id: str) -> list[TaskRecord]:
        with self._lock:
            return [
                task.model_copy(deep=True)
                for task in self._tasks.values()
                if task.run_id == run_id and task.status in INTERRUPTIBLE_STATUSES
            ]
