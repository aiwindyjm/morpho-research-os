import threading
import time

import pytest

from morpho_worker.clock import FakeClock
from morpho_worker.dag import (
    InMemoryStateStore,
    RunRecord,
    RunStatus,
    TaskRecord,
    TaskStatus,
    topological_levels,
    validate_dag,
    validate_transition,
)
from morpho_worker.dag.runner import DagRunner, TaskOutcome
from morpho_worker.dag.graph import ready_tasks
from morpho_worker.domain.research import RuntimeTaskType
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.events import EventLog


def make_task(run_id="run-1", task_id="t1", task_type=RuntimeTaskType.SEARCH, **overrides):
    data = dict(
        task_id=task_id,
        run_id=run_id,
        task_type=task_type,
        idempotency_key=f"{run_id}:{task_id}",
        max_attempts=3,
    )
    data.update(overrides)
    return TaskRecord.model_validate(data)


def make_store(*tasks):
    store = InMemoryStateStore(clock=FakeClock())
    store.create_run(RunRecord(run_id="run-1", plan_id="plan-1"))
    for task in tasks:
        store.add_task(task)
    return store


def make_runner(store, handler, clock=None, event_log=None, **kwargs):
    return DagRunner(
        store,
        handler=handler,
        event_log=event_log,
        clock=clock or FakeClock(),
        **kwargs,
    )


# State machine -----------------------------------------------------------


def test_documented_transitions_are_allowed_and_others_rejected():
    validate_transition(TaskStatus.PENDING, TaskStatus.PLANNING)
    validate_transition(TaskStatus.RUNNING, TaskStatus.VALIDATING)
    validate_transition(TaskStatus.VALIDATING, TaskStatus.COMPLETED)
    validate_transition(TaskStatus.RUNNING, TaskStatus.NEEDS_REVIEW)
    validate_transition(TaskStatus.PAUSED, TaskStatus.RUNNING)
    validate_transition(TaskStatus.FAILED, TaskStatus.PENDING)  # draft requeue
    with pytest.raises(ValueError, match="illegal task transition"):
        validate_transition(TaskStatus.COMPLETED, TaskStatus.RUNNING)
    with pytest.raises(ValueError, match="illegal task transition"):
        validate_transition(TaskStatus.PENDING, TaskStatus.COMPLETED)


def test_store_enforces_state_machine():
    store = make_store(make_task())
    store.transition("t1", TaskStatus.PLANNING)
    with pytest.raises(MorphoError) as excinfo:
        store.transition("t1", TaskStatus.COMPLETED)
    assert excinfo.value.code is ErrorCode.TASK_DEPENDENCY_FAILED


# Graph validation ---------------------------------------------------------


def test_cycle_is_rejected_up_front():
    tasks = [
        make_task(task_id="a", depends_on=["b"]),
        make_task(task_id="b", depends_on=["a"]),
    ]
    with pytest.raises(MorphoError) as excinfo:
        validate_dag(tasks)
    assert excinfo.value.code is ErrorCode.TASK_DEPENDENCY_FAILED
    assert "cycle" in excinfo.value.developer_detail


def test_unknown_and_self_dependencies_are_rejected():
    with pytest.raises(MorphoError) as unknown:
        validate_dag([make_task(task_id="a", depends_on=["ghost"])])
    assert "unknown task" in unknown.value.developer_detail
    with pytest.raises(MorphoError) as self_dep:
        validate_dag([make_task(task_id="a", depends_on=["a"])])
    assert "depends on itself" in self_dep.value.developer_detail


def test_topological_levels_show_parallel_fan_out_fan_in():
    tasks = [
        make_task(task_id="search"),
        make_task(task_id="extract-1", depends_on=["search"]),
        make_task(task_id="extract-2", depends_on=["search"]),
        make_task(task_id="normalize", depends_on=["extract-1", "extract-2"]),
    ]
    levels = topological_levels(tasks)
    assert levels == [["search"], ["extract-1", "extract-2"], ["normalize"]]


def test_skipped_dependency_satisfies_dependent():
    store = make_store(
        make_task(task_id="a"),
        make_task(task_id="b", depends_on=["a"]),
    )
    store.transition("a", TaskStatus.PLANNING)
    store.transition("a", TaskStatus.RUNNING)
    store.transition("a", TaskStatus.CANCELLED)
    store.mark_skipped("a")
    tasks = store.list_tasks("run-1")
    ready = ready_tasks(tasks)
    assert [task.task_id for task in ready] == ["b"]


# Runner -------------------------------------------------------------------


def test_runner_completes_parallel_fan_out_fan_in():
    active = 0
    peak = 0
    lock = threading.Lock()

    def handler(task, context):
        nonlocal active, peak
        with lock:
            active += 1
            peak = max(peak, active)
        time.sleep(0.02)
        with lock:
            active -= 1
        return TaskOutcome(status=TaskStatus.COMPLETED, result={"done": task.task_id})

    tasks = [
        make_task(task_id="s1"),
        make_task(task_id="s2"),
        make_task(task_id="s3"),
        make_task(task_id="fan-in", task_type=RuntimeTaskType.VALIDATE,
                  depends_on=["s1", "s2", "s3"]),
    ]
    store = make_store(*tasks)
    runner = make_runner(store, handler, max_workers=3)
    status = runner.run("run-1")
    runner.shutdown()

    assert status is RunStatus.COMPLETED
    assert peak >= 2  # tasks actually ran in parallel
    for task in store.list_tasks("run-1"):
        assert task.status is TaskStatus.COMPLETED
        assert task.result == {"done": task.task_id}


def test_runner_retries_retryable_failures_then_succeeds():
    calls = {"count": 0}

    def handler(task, context):
        calls["count"] += 1
        if calls["count"] < 3:
            raise MorphoError(
                ErrorCode.SOURCE_PARSE_FAILED, "Extraction failed.", retryable=True
            )
        return TaskOutcome(status=TaskStatus.COMPLETED, result={"ok": True})

    store = make_store(make_task(task_id="t", max_attempts=3))
    runner = make_runner(store, handler)
    status = runner.run("run-1")
    runner.shutdown()

    assert status is RunStatus.COMPLETED
    assert calls["count"] == 3
    task = store.get_task("t")
    assert task.attempt == 3
    assert task.status is TaskStatus.COMPLETED


def test_runner_exhausted_retry_fails_and_cascades_to_dependents():
    def handler(task, context):
        raise MorphoError(ErrorCode.SOURCE_PARSE_FAILED, "Broken source.", retryable=True)

    store = make_store(
        make_task(task_id="bad", max_attempts=2),
        make_task(task_id="child", task_type=RuntimeTaskType.NORMALIZE,
                  depends_on=["bad"], max_attempts=2),
    )
    runner = make_runner(store, handler)
    status = runner.run("run-1")
    runner.shutdown()

    assert status is RunStatus.FAILED
    bad = store.get_task("bad")
    assert bad.status is TaskStatus.FAILED
    assert bad.attempt == bad.max_attempts
    child = store.get_task("child")
    assert child.status is TaskStatus.FAILED
    assert child.error["code"] == ErrorCode.TASK_DEPENDENCY_FAILED.value
    assert child.attempt == 0  # never started


def test_runner_non_retryable_failure_fails_fast():
    calls = {"count": 0}

    def handler(task, context):
        calls["count"] += 1
        raise MorphoError(ErrorCode.PROVIDER_AUTH_FAILED, "auth", retryable=False)

    store = make_store(make_task(task_id="t", max_attempts=3))
    runner = make_runner(store, handler)
    status = runner.run("run-1")
    runner.shutdown()
    assert status is RunStatus.FAILED
    assert calls["count"] == 1


def test_manual_retry_requeues_failed_task():
    attempts = {"count": 0}

    def handler(task, context):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise MorphoError(ErrorCode.SEARCH_FAILED, "flaky", retryable=False)
        return TaskOutcome(status=TaskStatus.COMPLETED, result={})

    store = make_store(make_task(task_id="t", max_attempts=2))
    runner = make_runner(store, handler)
    assert runner.run("run-1") is RunStatus.FAILED
    runner.retry_task("t")
    status = runner.run("run-1")
    runner.shutdown()
    assert status is RunStatus.COMPLETED
    assert attempts["count"] == 2


def test_checkpoint_survives_simulated_crash_and_resume_is_idempotent():
    """A crashed worker leaves its tasks in an interruptible state with the
    last persisted checkpoint. Recovery requeues them; work resumes without
    redoing checkpointed items."""

    processed = []

    def handler(task, context):
        checkpoint = task.checkpoint or {"processed": []}
        for item in ["a", "b", "c", "d"]:
            if item in checkpoint["processed"]:
                continue
            processed.append(item)
            checkpoint["processed"].append(item)
            context.checkpoint({"processed": list(checkpoint["processed"])})
        return TaskOutcome(
            status=TaskStatus.COMPLETED,
            result={"processed": len(checkpoint["processed"])},
        )

    store = InMemoryStateStore(clock=FakeClock())
    store.create_run(RunRecord(run_id="run-1", plan_id="plan-1"))
    store.add_task(make_task(task_id="t", task_type=RuntimeTaskType.NORMALIZE))
    # Simulate the crashed process: the task died mid-execution after
    # persisting its checkpoint through a and b.
    store.transition("t", TaskStatus.PLANNING)
    store.transition("t", TaskStatus.RUNNING)
    store.start_attempt("t")
    store.set_checkpoint("t", {"processed": ["a", "b"]})

    runner = make_runner(store, handler)
    # Recovery requeues the interrupted task with its checkpoint intact.
    recovered = runner.recover_interrupted("run-1")
    assert recovered == ["t"]
    stored = store.get_task("t")
    assert stored.status is TaskStatus.PENDING
    assert stored.checkpoint == {"processed": ["a", "b"]}

    status = runner.run("run-1")
    runner.shutdown()
    assert status is RunStatus.COMPLETED
    # Items a and b are NOT re-processed: the checkpoint made the work
    # idempotent.
    assert processed == ["c", "d"]
    assert store.get_task("t").result == {"processed": 4}


def test_runner_pause_stops_new_tasks_and_resume_finishes():
    gate = threading.Event()
    release = threading.Event()

    def handler(task, context):
        gate.set()
        release.wait(timeout=5)
        return TaskOutcome(status=TaskStatus.COMPLETED, result={})

    store = make_store(
        make_task(task_id="first"),
        make_task(task_id="second"),
    )
    runner = make_runner(store, handler, max_workers=1)
    result: dict = {}

    def run_thread():
        result["first"] = runner.run("run-1")

    thread = threading.Thread(target=run_thread)
    thread.start()
    assert gate.wait(timeout=5)
    runner.pause("run-1")
    release.set()
    thread.join(timeout=10)
    runner.shutdown()

    assert result["first"] is RunStatus.PAUSED
    statuses = {task.task_id: task.status for task in store.list_tasks("run-1")}
    assert statuses["first"] is TaskStatus.COMPLETED
    assert statuses["second"] is TaskStatus.PENDING
    assert store.get_run("run-1").status is RunStatus.PAUSED

    # Resume drives the remaining work to completion.
    runner2 = make_runner(store, handler, max_workers=1)
    assert runner2.run("run-1") is RunStatus.COMPLETED
    runner2.shutdown()
    assert store.get_task("second").status is TaskStatus.COMPLETED


def test_runner_cancel_stops_pending_and_running_work():
    def handler(task, context):
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            if context.should_cancel():
                return TaskOutcome(status=TaskStatus.COMPLETED)  # ignored; cancel wins
            time.sleep(0.01)
        return TaskOutcome(status=TaskStatus.COMPLETED, result={})

    store = make_store(make_task(task_id="long"), make_task(task_id="pending2"))
    runner = make_runner(store, handler, max_workers=1)
    result: dict = {}

    def run_thread():
        result["status"] = runner.run("run-1")

    thread = threading.Thread(target=run_thread)
    thread.start()
    time.sleep(0.1)  # let the first task start
    runner.cancel("run-1")
    thread.join(timeout=10)
    runner.shutdown()

    assert result["status"] is RunStatus.CANCELLED
    statuses = {task.task_id: task.status for task in store.list_tasks("run-1")}
    assert statuses["pending2"] is TaskStatus.CANCELLED
    assert store.get_run("run-1").status is RunStatus.CANCELLED


def test_dynamic_task_addition_and_idempotency_key_dedup():
    def handler(task, context):
        if task.task_type is RuntimeTaskType.SEARCH:
            for suffix in ("x", "x", "y"):  # duplicate key must not double-create
                key = f"run-1:extract:{suffix}"
                if store.find_by_idempotency_key("run-1", key) is None:
                    store.add_task(
                        make_task(
                            run_id="run-1",
                            task_id=f"extract-{suffix}",
                            task_type=RuntimeTaskType.EXTRACT,
                            depends_on=[task.task_id],
                            idempotency_key=key,
                        )
                    )
        return TaskOutcome(status=TaskStatus.COMPLETED, result={})

    store = make_store(make_task(task_id="search"))
    runner = make_runner(store, handler, max_workers=2)
    status = runner.run("run-1")
    runner.shutdown()

    assert status is RunStatus.COMPLETED
    extract_tasks = [
        task for task in store.list_tasks("run-1") if task.task_type is RuntimeTaskType.EXTRACT
    ]
    assert sorted(task.task_id for task in extract_tasks) == ["extract-x", "extract-y"]
    assert all(task.status is TaskStatus.COMPLETED for task in extract_tasks)


def test_events_are_emitted_after_persisted_transitions():
    log = EventLog(FakeClock())

    def handler(task, context):
        return TaskOutcome(status=TaskStatus.COMPLETED, result={})

    store = make_store(make_task(task_id="t"))
    runner = make_runner(store, handler, event_log=log)
    runner.run("run-1")
    runner.shutdown()

    types = [event.type for event in log.replay("run-1")]
    assert "run.started" in types
    assert "task.started" in types
    assert "task.completed" in types
    assert "run.completed" in types
    started = [event for event in log.replay("run-1") if event.type == "task.started"][0]
    assert store.get_task("t").status is TaskStatus.COMPLETED  # state first
    assert started.sequence < log.replay("run-1")[-1].sequence
