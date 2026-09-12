"""Durable DAG runner (RES-02).

Thread-pool scheduler over the state store with the documented semantics:

- parallel fan-out / fan-in honoring dependencies (dynamic task addition
  supported while running);
- pause (no new tasks start, in-flight tasks finish), resume, and
  cooperative cancel;
- bounded retries with exponential backoff; retryable failures requeue,
  exhausted retries fail the task and cascade ``TASK_DEPENDENCY_FAILED``
  to its dependents;
- checkpoints persisted through the state store, handed back to the handler
  on resume;
- idempotency: handlers are only invoked once per attempt; dynamic task
  creation deduplicates through ``find_by_idempotency_key``;
- crash recovery: tasks left in interruptible states requeue as PENDING
  with their checkpoint preserved;
- events are emitted only after state transitions are persisted.

The runner never touches SQLite or the Vault: state goes through the
injected StateStore port, results through the orchestrator's sink.
"""

from __future__ import annotations

import threading
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Callable, Protocol

from morpho_worker.clock import Clock, SystemClock
from morpho_worker.dag import graph
from morpho_worker.dag.states import (
    INTERRUPTIBLE_STATUSES,
    RunStatus,
    TaskStatus,
)
from morpho_worker.dag.store import StateStore, TaskRecord
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.events import EventLog
from morpho_worker.logsetup import get_logger
from morpho_worker.providers.retry import RetryPolicy, backoff_for_attempt


class TaskRunContext(Protocol):
    def checkpoint(self, state: dict) -> None: ...

    def should_cancel(self) -> bool: ...


@dataclass
class TaskOutcome:
    status: TaskStatus
    result: dict | None = None
    error: MorphoError | None = None


TaskHandler = Callable[[TaskRecord, TaskRunContext], TaskOutcome]
ReadinessHook = Callable[[TaskRecord, dict], bool]


@dataclass
class _RunControl:
    paused: bool = False
    cancelled: bool = False
    inflight: set[str] = field(default_factory=set)
    requeue_at: dict[str, float] = field(default_factory=dict)


class DagRunner:
    def __init__(
        self,
        store: StateStore,
        *,
        handler: TaskHandler,
        event_log: EventLog | None = None,
        clock: Clock | None = None,
        max_workers: int = 2,
        retry: RetryPolicy | None = None,
        readiness_hook: ReadinessHook | None = None,
    ) -> None:
        self._store = store
        self._handler = handler
        self._event_log = event_log
        self._clock = clock or SystemClock()
        self._retry = retry or RetryPolicy(max_attempts=3, backoff_seconds=0.0)
        self._readiness_hook = readiness_hook
        self._max_workers = max(1, max_workers)
        self._executor = ThreadPoolExecutor(
            max_workers=self._max_workers, thread_name_prefix="morpho-dag"
        )
        self._condition = threading.Condition()
        self._controls: dict[str, _RunControl] = {}

    # Public controls -------------------------------------------------------

    def pause(self, run_id: str) -> None:
        with self._condition:
            self._control(run_id).paused = True

    def resume(self, run_id: str) -> None:
        with self._condition:
            control = self._control(run_id)
            control.paused = False
            self._condition.notify_all()

    def cancel(self, run_id: str) -> None:
        with self._condition:
            control = self._control(run_id)
            control.cancelled = True
            control.paused = False
            self._condition.notify_all()

    def is_cancelled(self, run_id: str) -> bool:
        with self._condition:
            return self._controls.get(run_id, _RunControl()).cancelled

    # Scheduling ------------------------------------------------------------

    def run(self, run_id: str) -> RunStatus:
        """Drive the DAG until it completes, is cancelled, or is paused.

        Blocks the calling thread. Safe to call again after a pause: state
        lives in the store, not in this loop.
        """

        run = self._require_run(run_id)
        if run.status in (RunStatus.COMPLETED, RunStatus.CANCELLED):
            return run.status
        with self._condition:
            control = self._control(run_id)
            control.paused = False
        self._store.update_run_status(run_id, RunStatus.RUNNING)
        self._recover_interrupted(run_id)
        self._emit(run_id, "run.started", {})

        while True:
            with self._condition:
                if control.cancelled:
                    break
                if control.paused:
                    self._store.update_run_status(run_id, RunStatus.PAUSED)
                    self._emit(run_id, "run.paused", {})
                    return RunStatus.PAUSED
                tasks = self._store.list_tasks(run_id)
                by_id = {task.task_id: task for task in tasks}
                self._submit_ready(run_id, tasks, by_id, control)
                due = self._collect_due_requeues(control)
                quiescent = not control.inflight and not self._has_ready(tasks) and not due
                if quiescent:
                    break
                self._condition.wait(timeout=0.05)

        status = self._finalize(run_id)
        return status

    def recover_interrupted(self, run_id: str) -> list[str]:
        """Public recovery entry point (crash of a previous worker process)."""

        return self._recover_interrupted(run_id)

    def retry_task(self, task_id: str) -> TaskRecord:
        """Manual requeue of a failed task (respects the state machine)."""

        task = self._require_task(task_id)
        if task.status is not TaskStatus.FAILED:
            raise MorphoError(
                ErrorCode.TASK_DEPENDENCY_FAILED,
                "Only failed tasks can be retried manually.",
                developer_detail=f"task_id={task_id} status={task.status.value}",
                retryable=False,
            )
        with self._condition:
            control = self._control(task.run_id)
            control.requeue_at.pop(task_id, None)
        updated = self._store.transition(task_id, TaskStatus.PENDING)
        with self._condition:
            self._condition.notify_all()
        self._emit(task.run_id, "task.retry_requested", {"task_id": task_id}, task_id)
        return updated

    def shutdown(self) -> None:
        self._executor.shutdown(wait=True)

    # internals -------------------------------------------------------------

    def _control(self, run_id: str) -> _RunControl:
        return self._controls.setdefault(run_id, _RunControl())

    def _require_run(self, run_id: str):
        run = self._store.get_run(run_id)
        if run is None:
            raise MorphoError(
                ErrorCode.DATABASE_ERROR,
                "The run does not exist.",
                developer_detail=f"run_id={run_id}",
                retryable=False,
            )
        return run

    def _require_task(self, task_id: str) -> TaskRecord:
        task = self._store.get_task(task_id)
        if task is None:
            raise MorphoError(
                ErrorCode.DATABASE_ERROR,
                "The task does not exist.",
                developer_detail=f"task_id={task_id}",
                retryable=False,
            )
        return task

    def _recover_interrupted(self, run_id: str) -> list[str]:
        recovered: list[str] = []
        for task in self._store.interrupted_tasks(run_id):
            # Preserve the checkpoint so work resumes where it stopped.
            self._store.transition(task.task_id, TaskStatus.PENDING)
            recovered.append(task.task_id)
            self._emit(
                run_id,
                "task.recovered",
                {"checkpointed": task.checkpoint is not None},
                task.task_id,
            )
        return recovered

    def _has_ready(self, tasks: list[TaskRecord]) -> bool:
        return bool(graph.ready_tasks(tasks))

    def _submit_ready(
        self, run_id: str, tasks: list[TaskRecord], by_id: dict, control: _RunControl
    ) -> None:
        # Only occupy free worker slots: queued-but-unstarted work would
        # otherwise keep running after a pause.
        capacity = self._max_workers - len(control.inflight)
        if capacity <= 0:
            return
        for task in graph.ready_tasks(tasks):
            if self._readiness_hook is not None and not self._readiness_hook(task, by_id):
                continue
            control.inflight.add(task.task_id)
            self._store.transition(task.task_id, TaskStatus.PLANNING)
            self._store.start_attempt(task.task_id)
            self._emit(run_id, "task.started", {"task_type": task.task_type.value}, task.task_id)
            self._executor.submit(self._execute, task.task_id)
            capacity -= 1
            if capacity <= 0:
                return

    def _collect_due_requeues(self, control: _RunControl) -> list[str]:
        now = self._clock.monotonic()
        due = [task_id for task_id, at in control.requeue_at.items() if at <= now]
        for task_id in due:
            control.requeue_at.pop(task_id)
            try:
                self._store.transition(task_id, TaskStatus.PENDING)
                self._emit(
                    self._store.get_task(task_id).run_id,
                    "task.requeued",
                    {},
                    task_id,
                )
            except MorphoError:
                continue
        return due

    def _execute(self, task_id: str) -> None:
        task = self._store.get_task(task_id)
        if task is None:  # pragma: no cover - defensive
            return
        run_id = task.run_id
        # PLANNING -> RUNNING when work actually starts.
        self._store.transition(task_id, TaskStatus.RUNNING)
        current = self._store.get_task(task_id)

        context = _RunContext(self, task_id)
        try:
            outcome = self._handler(current, context)
        except MorphoError as exc:
            outcome = TaskOutcome(status=TaskStatus.FAILED, error=exc)
        except Exception as exc:  # defensive: handler bugs must fail, not hang
            outcome = TaskOutcome(
                status=TaskStatus.FAILED,
                error=MorphoError(
                    ErrorCode.WORKER_NOT_AVAILABLE,
                    "The worker failed while executing this task.",
                    developer_detail=f"{type(exc).__name__}: {exc}",
                    retryable=False,
                ),
            )
        try:
            self._complete(task_id, outcome)
        except Exception:
            # Guarantee the run loop can never hang on a bookkeeping error.
            with self._condition:
                self._control(run_id).inflight.discard(task_id)
                self._condition.notify_all()
            get_logger("dag").exception("task completion bookkeeping failed for %s", task_id)
            raise

    def _complete(self, task_id: str, outcome: TaskOutcome) -> None:
        task = self._store.get_task(task_id)
        run_id = task.run_id
        with self._condition:
            control = self._control(run_id)
            control.inflight.discard(task_id)
            cancelled = control.cancelled
        current = self._store.get_task(task_id)
        if cancelled:
            # The run was cancelled: nothing runs to completion anymore.
            if current.status is not TaskStatus.CANCELLED:
                self._store.transition(task_id, TaskStatus.CANCELLED)
            self._emit(run_id, "task.cancelled", {}, task_id)
            with self._condition:
                self._condition.notify_all()
            return
        if outcome.status is TaskStatus.FAILED:
            error = outcome.error or MorphoError(
                ErrorCode.WORKER_NOT_AVAILABLE,
                "The task failed without a structured error.",
                retryable=False,
            )
            self._store.transition(task_id, TaskStatus.FAILED)
            self._store.set_error(task_id, error.to_dict())
            self._emit(
                run_id,
                "task.failed",
                {"error_code": error.to_dict()["code"], "attempt": current.attempt},
                task_id,
            )
            if error.retryable and current.attempt < current.max_attempts:
                delay = backoff_for_attempt(self._retry, current.attempt)
                with self._condition:
                    control.requeue_at[task_id] = self._clock.monotonic() + delay
            else:
                self._cascade_dependency_failure(task)
        elif outcome.status is TaskStatus.COMPLETED:
            self._store.transition(task_id, TaskStatus.COMPLETED)
            if outcome.result is not None:
                self._store.set_result(task_id, outcome.result)
            self._emit(run_id, "task.completed", {}, task_id)
        elif outcome.status is TaskStatus.NEEDS_REVIEW:
            self._store.transition(task_id, TaskStatus.NEEDS_REVIEW)
            if outcome.result is not None:
                self._store.set_result(task_id, outcome.result)
            self._emit(run_id, "task.needs_review", {}, task_id)
        else:  # pragma: no cover - handler returned an unsupported status
            self._store.transition(task_id, TaskStatus.FAILED)
            self._store.set_error(
                task_id,
                {"code": "WORKER_NOT_AVAILABLE", "user_message": "Unsupported task outcome."},
            )
        with self._condition:
            self._condition.notify_all()

    def _cascade_dependency_failure(self, failed_task: TaskRecord) -> None:
        """A finally-failed or cancelled task fails its pending dependents."""

        tasks = self._store.list_tasks(failed_task.run_id)
        downstream = graph.downstream_ids(tasks, [failed_task.task_id])
        for task_id in sorted(downstream):
            task = self._store.get_task(task_id)
            if task.status is TaskStatus.PENDING:
                self._store.transition(task_id, TaskStatus.FAILED)
                self._store.set_error(
                    task_id,
                    MorphoError(
                        ErrorCode.TASK_DEPENDENCY_FAILED,
                        "This task cannot run because an upstream task failed.",
                        developer_detail=f"upstream={failed_task.task_id}",
                        retryable=False,
                    ).to_dict(),
                )
                self._emit(
                    failed_task.run_id,
                    "task.dependency_failed",
                    {"upstream": failed_task.task_id},
                    task_id,
                )

    def _finalize(self, run_id: str) -> RunStatus:
        tasks = self._store.list_tasks(run_id)
        with self._condition:
            cancelled = self._control(run_id).cancelled
        if cancelled:
            for task in tasks:
                if task.status in (TaskStatus.PENDING, TaskStatus.PAUSED):
                    self._store.transition(task.task_id, TaskStatus.CANCELLED)
                elif task.status in INTERRUPTIBLE_STATUSES:
                    self._store.transition(task.task_id, TaskStatus.CANCELLED)
            self._store.update_run_status(run_id, RunStatus.CANCELLED)
            self._emit(run_id, "run.cancelled", {})
            return RunStatus.CANCELLED
        statuses = {task.status for task in tasks}
        if TaskStatus.FAILED in statuses:
            self._store.update_run_status(run_id, RunStatus.FAILED)
            self._emit(run_id, "run.failed", {})
            return RunStatus.FAILED
        if any(task.status in INTERRUPTIBLE_STATUSES or task.status is TaskStatus.PENDING for task in tasks):
            return RunStatus.RUNNING  # keep the loop honest: not quiescent yet
        self._store.update_run_status(run_id, RunStatus.COMPLETED)
        self._emit(run_id, "run.completed", {})
        return RunStatus.COMPLETED

    def _emit(self, run_id: str, event_type: str, payload: dict, task_id: str | None = None) -> None:
        if self._event_log is None:
            return
        self._event_log.append(run_id, event_type, payload, task_id=task_id)


class _RunContext:
    def __init__(self, runner: DagRunner, task_id: str) -> None:
        self._runner = runner
        self._task_id = task_id

    def checkpoint(self, state: dict) -> None:
        self._runner._store.set_checkpoint(self._task_id, dict(state))

    def should_cancel(self) -> bool:
        task = self._runner._store.get_task(self._task_id)
        if task is None:  # pragma: no cover - defensive
            return False
        return self._runner.is_cancelled(task.run_id)
