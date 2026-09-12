"""Research orchestrator (RES-01/RES-02 integration).

Wires the reviewed plan into the durable DAG and drives the full pipeline::

    ResearchConfig -> Planner -> Plan review (store gate)
    -> Task DAG (search -> dynamic extract fan-out -> normalize -> claims
       -> validate fan-in)
    -> validated records handed to the injected ResultSink

Hard rules enforced here:

- ``start_run`` consults the plan store first: an unapproved plan raises
  ``PLAN_NOT_APPROVED`` and nothing executes;
- only this orchestrator transitions task state (through the DAG runner
  and state store);
- the worker never persists directly - every validated record goes to the
  injected sink (Rust-backed via the worker protocol later);
- dynamic extract tasks are created through idempotency keys, so search
  retries or crash recoveries never duplicate work.
"""

from __future__ import annotations

from typing import Any, Callable

from morpho_worker.clock import Clock
from morpho_worker.dag import validate_dag
from morpho_worker.dag.graph import dependency_error
from morpho_worker.dag.runner import DagRunner, TaskOutcome
from morpho_worker.dag.states import RunStatus, TaskStatus
from morpho_worker.dag.store import InMemoryStateStore, RunRecord, StateStore, TaskRecord
from morpho_worker.domain.research import (
    ResearchConfig,
    ResearchPlan,
    RuntimeTaskType,
)
from morpho_worker.errors import ErrorCode, MorphoError
from morpho_worker.events import EventLog
from morpho_worker.ids import new_id, stable_id
from morpho_worker.interfaces import (
    PlannerPort,
    ResultSink,
    StageContext,
)
from morpho_worker.providers.retry import RetryPolicy
from morpho_worker.stages.claims_stage import ClaimBuilder, ValidationStage
from morpho_worker.stages.normalization_stage import EntityNormalizer, RelationNormalizer


class ResearchOrchestrator:
    def __init__(
        self,
        *,
        planner: PlannerPort,
        plan_store,
        state_store: StateStore | None = None,
        search_stage,
        extraction_stage,
        entity_normalizer: EntityNormalizer | None = None,
        relation_normalizer: RelationNormalizer | None = None,
        claim_builder: ClaimBuilder | None = None,
        validation_stage: ValidationStage | None = None,
        sink: ResultSink,
        event_log: EventLog | None = None,
        clock: Clock | None = None,
        max_workers: int = 2,
        retry: RetryPolicy | None = None,
    ) -> None:
        self._planner = planner
        self._plan_store = plan_store
        self._store = state_store or InMemoryStateStore(clock=clock)
        self._search_stage = search_stage
        self._extraction_stage = extraction_stage
        self._entities = entity_normalizer or EntityNormalizer()
        self._relations = relation_normalizer or RelationNormalizer()
        self._claims = claim_builder or ClaimBuilder()
        self._validation = validation_stage or ValidationStage(clock=clock)
        self._sink = sink
        self._event_log = event_log
        self._clock = clock
        self._runner = DagRunner(
            self._store,
            handler=self._handle_task,
            event_log=event_log,
            clock=clock,
            max_workers=max_workers,
            retry=retry or RetryPolicy(max_attempts=3, backoff_seconds=0.0),
            readiness_hook=self._readiness,
        )

    # Plan lifecycle (RES-01) ------------------------------------------------

    def create_plan(self, config: ResearchConfig, *, project_id: str = "") -> ResearchPlan:
        plan = self._planner.draft_plan(config, project_id=project_id)
        saved = self._plan_store.save(plan)
        self._emit(f"plan:{saved.plan_id}", "plan.created", {"status": saved.status.value})
        return saved

    def approve_plan(self, plan_id: str, note: str = "") -> ResearchPlan:
        return self._plan_store.approve(plan_id, note)

    def reject_plan(self, plan_id: str, note: str = "") -> ResearchPlan:
        return self._plan_store.reject(plan_id, note)

    def regenerate_plan(self, plan_id: str) -> ResearchPlan:
        """Re-run the planner over the stored config; restarts review."""

        latest = self._plan_store.get(plan_id)
        if latest is None:
            raise MorphoError(
                ErrorCode.PLAN_NOT_APPROVED,
                "The plan does not exist and cannot be regenerated.",
                retryable=False,
            )
        draft = self._planner.draft_plan(latest.config, project_id=latest.project_id)
        return self._plan_store.revise(plan_id, draft)

    def get_plan(self, plan_id: str) -> ResearchPlan | None:
        return self._plan_store.get(plan_id)

    # Run lifecycle (RES-02) ---------------------------------------------------

    def start_run(self, plan_id: str) -> str:
        """Build the DAG for an APPROVED plan and drive it to completion.

        Returns the run id; run/task state lives in the state store.
        """

        plan = self._plan_store.require_approved(plan_id)
        run_id = new_id()
        self._store.create_run(
            RunRecord(
                run_id=run_id,
                plan_id=plan.plan_id,
                project_id=plan.project_id,
                config_fingerprint=plan.config_fingerprint,
            )
        )
        for task in self._static_tasks(run_id, plan):
            self._store.add_task(task)
        self._emit(run_id, "run.created", {"plan_id": plan.plan_id})
        self._runner.run(run_id)
        return run_id

    def resume_run(self, run_id: str) -> str:
        """Resume a paused run (crash recovery requeues first)."""

        run = self._store.get_run(run_id)
        if run is None:
            raise MorphoError(
                ErrorCode.DATABASE_ERROR,
                "The run does not exist.",
                developer_detail=f"run_id={run_id}",
                retryable=False,
            )
        self._runner.run(run_id)
        return run_id

    def pause_run(self, run_id: str) -> None:
        self._runner.pause(run_id)

    def cancel_run(self, run_id: str) -> None:
        self._runner.cancel(run_id)

    def retry_task(self, task_id: str) -> None:
        self._runner.retry_task(task_id)

    def resolve_review(self, run_id: str, *, approve: bool = True) -> RunStatus:
        """User review decision on a run that finished with NEEDS_REVIEW.

        Approving completes the run (conflicting claims keep coexisting);
        rejecting reopens the validate task for rework.
        """

        validate_task = None
        for task in self._store.list_tasks(run_id):
            if task.task_type is RuntimeTaskType.VALIDATE:
                validate_task = task
        if validate_task is None or validate_task.status is not TaskStatus.NEEDS_REVIEW:
            raise MorphoError(
                ErrorCode.TASK_DEPENDENCY_FAILED,
                "This run has no pending review to resolve.",
                developer_detail=f"run_id={run_id}",
                retryable=False,
            )
        self._store.transition(
            validate_task.task_id,
            TaskStatus.RUNNING if not approve else TaskStatus.COMPLETED,
        )
        status = self._store.update_run_status(
            run_id, RunStatus.RUNNING if not approve else RunStatus.COMPLETED
        )
        self._emit(run_id, "run.review_resolved", {"approved": approve})
        return status.status

    def run_status(self, run_id: str):
        return self._store.get_run(run_id)

    def task_status(self, run_id: str):
        return self._store.list_tasks(run_id)

    def shutdown(self) -> None:
        self._runner.shutdown()

    # DAG construction ---------------------------------------------------------

    def _static_tasks(self, run_id: str, plan: ResearchPlan) -> list[TaskRecord]:
        tasks: list[TaskRecord] = []
        claim_ids: list[str] = []
        params_base = {
            "topic": plan.config.topic,
            "source_types": list(plan.config.source_types),
            "languages": list(plan.config.languages),
            "source_domains": list(plan.config.source_domains),
        }
        for section in plan.sections:
            search_id = self._task_id(run_id, "search", section.section_id)
            normalize_id = self._task_id(run_id, "normalize", section.section_id)
            claims_id = self._task_id(run_id, "claims", section.section_id)
            tasks.append(
                TaskRecord(
                    task_id=search_id,
                    run_id=run_id,
                    task_type=RuntimeTaskType.SEARCH,
                    title=f"Search: {section.dimension}",
                    params={
                        **params_base,
                        "section_id": section.section_id,
                        "dimension": section.dimension,
                        "query": f"{plan.config.topic} {section.dimension}".strip(),
                    },
                    idempotency_key=f"{run_id}:search:{section.section_id}",
                )
            )
            tasks.append(
                TaskRecord(
                    task_id=normalize_id,
                    run_id=run_id,
                    task_type=RuntimeTaskType.NORMALIZE,
                    title=f"Normalize: {section.dimension}",
                    params={**params_base, "section_id": section.section_id,
                            "dimension": section.dimension},
                    depends_on=[search_id],
                    idempotency_key=f"{run_id}:normalize:{section.section_id}",
                )
            )
            tasks.append(
                TaskRecord(
                    task_id=claims_id,
                    run_id=run_id,
                    task_type=RuntimeTaskType.CLAIMS,
                    title=f"Claims: {section.dimension}",
                    params={**params_base, "section_id": section.section_id,
                            "dimension": section.dimension},
                    depends_on=[normalize_id],
                    idempotency_key=f"{run_id}:claims:{section.section_id}",
                )
            )
            claim_ids.append(claims_id)
        tasks.append(
            TaskRecord(
                task_id=self._task_id(run_id, "validate", "run"),
                run_id=run_id,
                task_type=RuntimeTaskType.VALIDATE,
                title="Validate run",
                params=dict(params_base),
                depends_on=claim_ids,
                idempotency_key=f"{run_id}:validate",
            )
        )
        validate_dag(tasks)  # reject bad plans up front
        return tasks

    @staticmethod
    def _task_id(run_id: str, kind: str, scope: str) -> str:
        return stable_id("task", f"{run_id}:{kind}:{scope}")

    # Scheduling hooks ---------------------------------------------------------

    def _readiness(self, task: TaskRecord, tasks_by_id: dict) -> bool:
        if task.task_type is not RuntimeTaskType.NORMALIZE:
            return True
        section_id = task.params.get("section_id")
        for other in tasks_by_id.values():
            if (
                other.task_type is RuntimeTaskType.EXTRACT
                and other.params.get("section_id") == section_id
                and other.status
                not in (TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.FAILED)
            ):
                return False
        return True

    # Task handlers --------------------------------------------------------------

    def _handle_task(self, task: TaskRecord, ctx) -> TaskOutcome:
        context = StageContext(
            run_id=task.run_id,
            task_id=task.task_id,
            section_id=str(task.params.get("section_id", "")),
            dimension=str(task.params.get("dimension", "")),
            correlation_id=task.run_id,
            params=dict(task.params),
        )
        if task.task_type is RuntimeTaskType.SEARCH:
            return self._run_search(task, context, ctx)
        if task.task_type is RuntimeTaskType.EXTRACT:
            return self._run_extract(task, context, ctx)
        if task.task_type is RuntimeTaskType.NORMALIZE:
            return self._run_normalize(task, context, ctx)
        if task.task_type is RuntimeTaskType.CLAIMS:
            return self._run_claims(task, context, ctx)
        if task.task_type is RuntimeTaskType.VALIDATE:
            return self._run_validate(task, context)
        raise dependency_error(f"unknown task type {task.task_type}")  # pragma: no cover

    def _run_search(self, task: TaskRecord, context: StageContext, ctx) -> TaskOutcome:
        sources = self._search_stage.search(str(task.params["query"]), context)
        created = 0
        for source in sources:
            if ctx.should_cancel():
                return TaskOutcome(status=TaskStatus.COMPLETED)
            self._sink.persist("source", source)
            content = self._extraction_stage.content_for(source)
            self._sink.persist("source-content", content)
            quality = self._extraction_stage.evaluate(source, content, context)
            self._sink.persist(
                "source", source.model_copy(update={"quality": quality})
            )
            key = (
                f"{task.run_id}:extract:{context.section_id}:{source.url_dedup_key}"
            )
            if self._store.find_by_idempotency_key(task.run_id, key) is None:
                self._store.add_task(
                    TaskRecord(
                        task_id=stable_id("task", key),
                        run_id=task.run_id,
                        task_type=RuntimeTaskType.EXTRACT,
                        title=f"Extract: {source.title}",
                        params={
                            **{k: v for k, v in task.params.items() if k != "query"},
                            "source_id": source.source_id,
                            "url_dedup_key": source.url_dedup_key,
                        },
                        depends_on=[task.task_id],
                        idempotency_key=key,
                    )
                )
                created += 1
        return TaskOutcome(
            status=TaskStatus.COMPLETED,
            result={"source_count": len(sources), "extract_tasks_created": created},
        )

    def _run_extract(self, task: TaskRecord, context: StageContext, ctx) -> TaskOutcome:
        source = self._sink.get("source", str(task.params["source_id"]))
        content = self._extraction_stage.content_for(source)
        extraction = self._extraction_stage.extract(source, content, context)
        self._sink.persist("extraction", extraction)
        return TaskOutcome(
            status=TaskStatus.COMPLETED,
            result={"extraction_id": extraction.extraction_id},
        )

    def _run_normalize(self, task: TaskRecord, context: StageContext, ctx) -> TaskOutcome:
        extractions, processed = self._section_extractions(task, context, ctx)
        nodes = self._entities.normalize_entities(extractions, context, clock=self._clock)
        relations = self._relations.normalize_relations(
            extractions, nodes, context, clock=self._clock
        )
        node_ids = []
        for node in nodes:
            if node.node_id in processed:
                continue
            self._sink.persist("node", node)
            node_ids.append(node.node_id)
            processed.append(node.node_id)
            ctx.checkpoint({"processed_nodes": list(processed)})
        for relation in relations:
            self._sink.persist("relation", relation)
        return TaskOutcome(
            status=TaskStatus.COMPLETED,
            result={"node_ids": node_ids, "relation_ids": [r.relation_id for r in relations]},
        )

    def _run_claims(self, task: TaskRecord, context: StageContext, ctx) -> TaskOutcome:
        extractions, _processed = self._section_extractions(task, context, ctx)
        nodes = self._run_nodes(task.run_id)
        bundle = self._claims.build_claims(extractions, nodes, context, clock=self._clock)
        for claim in bundle.claims:
            self._sink.persist("claim", claim)
        for evidence in bundle.evidence:
            self._sink.persist("evidence", evidence)
        for dropped in bundle.dropped:
            self._sink.persist("dropped", dropped)
        return TaskOutcome(
            status=TaskStatus.COMPLETED,
            result={
                "claim_ids": [claim.claim_id for claim in bundle.claims],
                "evidence_ids": [item.evidence_id for item in bundle.evidence],
                "dropped_count": len(bundle.dropped),
            },
        )

    def _run_validate(self, task: TaskRecord, context: StageContext) -> TaskOutcome:
        # Orchestration-only transition into the documented validating state.
        self._store.transition(task.task_id, TaskStatus.VALIDATING)
        claims = self._run_records(task.run_id, RuntimeTaskType.CLAIMS, "claim_ids", "claim")
        nodes = self._run_nodes(task.run_id)
        dropped = self._all_records(task.run_id, "dropped")
        report = self._validation.validate(
            claims=claims, nodes=nodes, context=context, dropped=dropped
        )
        for flagged in apply_review_flags_if_needed(claims, report):
            self._sink.persist("claim", flagged)
        self._sink.persist("validation-report", report)
        status = (
            TaskStatus.NEEDS_REVIEW if report.needs_review_claim_ids else TaskStatus.COMPLETED
        )
        return TaskOutcome(
            status=status,
            result={
                "validation_status": report.status,
                "conflicts": len(report.conflicts),
                "needs_review": len(report.needs_review_claim_ids),
            },
        )

    # Cross-task record gathering ------------------------------------------------

    def _section_extractions(self, task: TaskRecord, context: StageContext, ctx):
        tasks = {t.task_id: t for t in self._store.list_tasks(task.run_id)}
        extraction_ids: list[str] = []
        for other in tasks.values():
            if (
                other.task_type is RuntimeTaskType.EXTRACT
                and other.params.get("section_id") == task.params.get("section_id")
                and other.status is TaskStatus.COMPLETED
                and other.result
            ):
                extraction_ids.append(other.result["extraction_id"])
        processed: list[str] = []
        record = self._store.get_task(task.task_id)
        if record and record.checkpoint:
            processed = list(record.checkpoint.get("processed_nodes", []))
        extractions = []
        for extraction_id in sorted(set(extraction_ids)):
            found = self._sink.get("extraction", extraction_id)
            if found is not None:
                extractions.append(found)
        return extractions, processed

    def _run_nodes(self, run_id: str):
        nodes = []
        for node_id in self._collect_ids(run_id, RuntimeTaskType.NORMALIZE, "node_ids"):
            found = self._sink.get("node", node_id)
            if found is not None:
                nodes.append(found)
        return nodes

    def _run_records(self, run_id: str, task_type: RuntimeTaskType, result_key: str, sink_kind: str):
        records = []
        for record_id in self._collect_ids(run_id, task_type, result_key):
            found = self._sink.get(sink_kind, record_id)
            if found is not None:
                records.append(found)
        return records

    def _all_records(self, run_id: str, sink_kind: str):
        return [r for r in self._sink.all(sink_kind)]

    def _collect_ids(
        self, run_id: str, task_type: RuntimeTaskType, result_key: str
    ) -> list[str]:
        ids: list[str] = []
        for task in self._store.list_tasks(run_id):
            if task.task_type is task_type and task.status is TaskStatus.COMPLETED and task.result:
                ids.extend(task.result.get(result_key, []))
        return sorted(set(ids))

    def _emit(self, job_id: str, event_type: str, payload: dict) -> None:
        if self._event_log is None:
            return
        self._event_log.append(job_id, event_type, payload)


def apply_review_flags_if_needed(claims, report):
    from morpho_worker.stages.claims_stage import apply_review_flags

    if not report.needs_review_claim_ids:
        return []
    return apply_review_flags(claims, report)


class Orchestrator:
    """Generic task-type dispatch registry (PY-04 skeleton).

    ``ResearchOrchestrator`` is the full research pipeline; this lightweight
    dispatcher stays available for protocol tests and non-research jobs.
    """

    def __init__(self, event_log: EventLog | None = None, job_id: str = "") -> None:
        self._handlers: dict[RuntimeTaskType, Callable[..., Any]] = {}
        self._event_log = event_log
        self._job_id = job_id

    def register(self, task_type: RuntimeTaskType, handler: Callable[..., Any]) -> None:
        self._handlers[task_type] = handler

    def dispatch(self, task_type: RuntimeTaskType, task_id: str, /, **kwargs: Any) -> Any:
        if task_type not in RuntimeTaskType:
            raise MorphoError(
                "UNSUPPORTED_TASK_TYPE",
                "The requested task type is not supported by this worker.",
                developer_detail=f"task_type={task_type!r}",
                retryable=False,
            )
        handler = self._handlers.get(task_type)
        if handler is None:
            raise MorphoError(
                "TASK_HANDLER_MISSING",
                "No stage is registered for this task type.",
                developer_detail=f"task_type={task_type.value}",
                retryable=False,
            )
        self._emit(task_id, "task.started", {"task_type": task_type.value})
        try:
            result = handler(**kwargs)
        except MorphoError as exc:
            self._emit(
                task_id,
                "task.failed",
                {"task_type": task_type.value, "error_code": exc.to_dict()["code"]},
            )
            raise
        self._emit(task_id, "task.completed", {"task_type": task_type.value})
        return result

    def _emit(self, task_id: str, event_type: str, payload: dict) -> None:
        if self._event_log is None:
            return
        self._event_log.append(
            self._job_id or "orchestrator", event_type, payload, task_id=task_id
        )
