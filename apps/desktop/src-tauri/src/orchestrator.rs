//! Task orchestrator: the Rust core's projection authority over the worker
//! event stream (PRD §7, ADR-019).
//!
//! The Python worker executes research work and emits canonical event.v1
//! events; this module is the single authority for what those events mean
//! for persisted task state. Every event is validated against the current
//! persisted state (never against memory), applied inside one write
//! transaction together with its side effects (reference columns, dependency
//! gating, run rollup), and illegal, duplicate, or out-of-order events are
//! rejected with structured errors that leave SQLite untouched. Replaying an
//! already-applied transition is a no-op success, so redelivered events after
//! a worker reconnect never corrupt state (DO_NOT_BREAK #6).
//!
//! Phase 1 (this module) is projection-only: the worker remains the executor
//! and the core never dispatches individual tasks. Phase 2 (Rust-driven
//! per-task dispatch) reuses the same transition table and gating rules; see
//! ADR-019 for the boundary.

use crate::error::{CoreError, ErrorCode};
use crate::ipc::ResearchEvent;
use crate::repositories::plans::TaskRecord;
use crate::repositories::runs::Runs;
use crate::repositories::tasks::Tasks;
use crate::repositories::with_write_tx;
use rusqlite::{Connection, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};

// ---------------------------------------------------------------------------
// Task state machine (PRD §7)
// ---------------------------------------------------------------------------

/// Persisted task states (schema CHECK values, migration 002 adds SKIPPED).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum TaskStatus {
    Pending,
    Planning,
    Running,
    Validating,
    NeedsReview,
    Completed,
    Failed,
    Paused,
    Cancelled,
    Skipped,
}

impl TaskStatus {
    pub const ALL: [TaskStatus; 10] = [
        TaskStatus::Pending,
        TaskStatus::Planning,
        TaskStatus::Running,
        TaskStatus::Validating,
        TaskStatus::NeedsReview,
        TaskStatus::Completed,
        TaskStatus::Failed,
        TaskStatus::Paused,
        TaskStatus::Cancelled,
        TaskStatus::Skipped,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            TaskStatus::Pending => "PENDING",
            TaskStatus::Planning => "PLANNING",
            TaskStatus::Running => "RUNNING",
            TaskStatus::Validating => "VALIDATING",
            TaskStatus::NeedsReview => "NEEDS_REVIEW",
            TaskStatus::Completed => "COMPLETED",
            TaskStatus::Failed => "FAILED",
            TaskStatus::Paused => "PAUSED",
            TaskStatus::Cancelled => "CANCELLED",
            TaskStatus::Skipped => "SKIPPED",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        TaskStatus::ALL
            .iter()
            .copied()
            .find(|s| s.as_str() == value)
    }

    /// States a task never leaves. `FAILED` is deliberately not terminal: a
    /// failed task can retry (`FAILED -> RUNNING`) or be closed out.
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            TaskStatus::Completed | TaskStatus::Cancelled | TaskStatus::Skipped
        )
    }

    /// States after which the run rollup stops waiting for a task: the
    /// terminal states plus FAILED (a failed task settles the run as failed;
    /// if it later retries, the rollup reopens the run).
    fn is_run_settled(self) -> bool {
        self.is_terminal() || self == TaskStatus::Failed
    }
}

/// PRD §7 transition table, extended with the explicit-skip edges ratified
/// in ADR-019:
///
/// ```text
/// PENDING -> PLANNING -> RUNNING -> VALIDATING -> COMPLETED
/// RUNNING  -> NEEDS_REVIEW | PAUSED -> RUNNING | FAILED -> RUNNING (retry) | CANCELLED
/// PENDING/PLANNING/RUNNING -> SKIPPED          (explicit skip, never after completion)
/// any non-terminal -> CANCELLED                (run cancellation closure)
/// FAILED   -> CANCELLED | COMPLETED            (terminal closure)
/// ```
///
/// `from == to` is always allowed: replaying the current status is an
/// idempotent no-op, not an error.
pub fn can_transition(from: TaskStatus, to: TaskStatus) -> Result<(), CoreError> {
    if from == to {
        return Ok(());
    }
    let legal = matches!(
        (from, to),
        (TaskStatus::Pending, TaskStatus::Planning)
            | (TaskStatus::Pending, TaskStatus::Running)
            | (TaskStatus::Pending, TaskStatus::Failed)
            | (TaskStatus::Pending, TaskStatus::Cancelled)
            | (TaskStatus::Pending, TaskStatus::Skipped)
            | (TaskStatus::Planning, TaskStatus::Running)
            | (TaskStatus::Planning, TaskStatus::Failed)
            | (TaskStatus::Planning, TaskStatus::Cancelled)
            | (TaskStatus::Planning, TaskStatus::Skipped)
            | (TaskStatus::Running, TaskStatus::Validating)
            | (TaskStatus::Running, TaskStatus::Completed)
            | (TaskStatus::Running, TaskStatus::NeedsReview)
            | (TaskStatus::Running, TaskStatus::Paused)
            | (TaskStatus::Running, TaskStatus::Failed)
            | (TaskStatus::Running, TaskStatus::Cancelled)
            | (TaskStatus::Running, TaskStatus::Skipped)
            | (TaskStatus::Validating, TaskStatus::Completed)
            | (TaskStatus::Validating, TaskStatus::NeedsReview)
            | (TaskStatus::Validating, TaskStatus::Failed)
            | (TaskStatus::Validating, TaskStatus::Cancelled)
            | (TaskStatus::NeedsReview, TaskStatus::Completed)
            | (TaskStatus::NeedsReview, TaskStatus::Running)
            | (TaskStatus::NeedsReview, TaskStatus::Cancelled)
            | (TaskStatus::Paused, TaskStatus::Running)
            | (TaskStatus::Paused, TaskStatus::Cancelled)
            | (TaskStatus::Failed, TaskStatus::Running)
            | (TaskStatus::Failed, TaskStatus::Cancelled)
            | (TaskStatus::Failed, TaskStatus::Completed)
    );
    if legal {
        Ok(())
    } else {
        Err(CoreError::new(
            ErrorCode::DatabaseError,
            "Illegal task state transition.",
            format!(
                "illegal task transition {} -> {}",
                from.as_str(),
                to.as_str()
            ),
            false,
        ))
    }
}

/// Persisted run states (schema CHECK values, migration 002 adds
/// `needs_review`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Running,
    Paused,
    NeedsReview,
    Completed,
    Failed,
    Cancelled,
}

impl RunStatus {
    pub const ALL: [RunStatus; 6] = [
        RunStatus::Running,
        RunStatus::Paused,
        RunStatus::NeedsReview,
        RunStatus::Completed,
        RunStatus::Failed,
        RunStatus::Cancelled,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            RunStatus::Running => "running",
            RunStatus::Paused => "paused",
            RunStatus::NeedsReview => "needs_review",
            RunStatus::Completed => "completed",
            RunStatus::Failed => "failed",
            RunStatus::Cancelled => "cancelled",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        RunStatus::ALL.iter().copied().find(|s| s.as_str() == value)
    }

    /// Terminal run statuses stamp `finished_at`. `needs_review` parks the
    /// run instead of finishing it.
    pub fn is_terminal(self) -> bool {
        matches!(
            self,
            RunStatus::Completed | RunStatus::Failed | RunStatus::Cancelled
        )
    }
}

/// Run-level legality: same-status is an idempotent no-op, any non-terminal
/// state may move anywhere, terminal states are closed — except
/// `failed -> running`, which reopens a failed run when a task retries
/// (the rollup marks a run failed as soon as a task fails finally, so the
/// retry path must be able to take it back).
pub fn can_transition_run(from: RunStatus, to: RunStatus) -> Result<(), CoreError> {
    if from == to {
        return Ok(());
    }
    let legal = !from.is_terminal() || (from == RunStatus::Failed && to == RunStatus::Running);
    if legal {
        Ok(())
    } else {
        Err(CoreError::new(
            ErrorCode::DatabaseError,
            "Illegal run state transition.",
            format!(
                "illegal run transition {} -> {}",
                from.as_str(),
                to.as_str()
            ),
            false,
        ))
    }
}

// ---------------------------------------------------------------------------
// Canonical event input
// ---------------------------------------------------------------------------

/// One canonical event.v1 event entering the orchestrator. Field names and
/// the closed type vocabulary follow `packages/schemas/event.v1.json`
/// (ADR-015); payloads arrive already redacted.
#[derive(Debug, Clone, PartialEq)]
pub struct CanonicalEvent {
    pub run_id: String,
    pub task_id: Option<String>,
    pub event_type: String,
    pub payload: Value,
}

impl CanonicalEvent {
    pub fn new(
        run_id: impl Into<String>,
        task_id: Option<String>,
        event_type: impl Into<String>,
        payload: Value,
    ) -> Self {
        Self {
            run_id: run_id.into(),
            task_id,
            event_type: event_type.into(),
            payload,
        }
    }

    /// The event's task reference: the envelope field wins, with the payload
    /// placement (`payload.task_id`) accepted as fallback — event.v1 allows
    /// both.
    fn resolve_task_id(&self) -> Option<&str> {
        self.task_id
            .as_deref()
            .or_else(|| self.payload.get("task_id").and_then(Value::as_str))
    }

    fn payload_str(&self, key: &str) -> Option<&str> {
        self.payload.get(key).and_then(Value::as_str)
    }
}

impl From<&ResearchEvent> for CanonicalEvent {
    fn from(event: &ResearchEvent) -> Self {
        CanonicalEvent::new(
            event.run_id.clone(),
            event.task_id.clone(),
            event.event_type.clone(),
            event.payload.clone(),
        )
    }
}

// ---------------------------------------------------------------------------
// Apply outcome
// ---------------------------------------------------------------------------

/// What applying one event changed. Purely descriptive: persisted state is
/// the truth; this feeds logs, tests, and later the phase-2 dispatcher.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct ApplyOutcome {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_status: Option<TaskStatus>,
    /// `None` when the event applied no transition (progress/checkpoint
    /// events, or an idempotent replay of the current status).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_status: Option<TaskStatus>,
    /// PENDING dependents whose dependencies are now all satisfied and are
    /// therefore ready for dispatch.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub unblocked_dependents: Vec<String>,
    /// Dependents failed by a `TASK_DEPENDENCY_FAILED` cascade.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub failed_dependents: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub run_rollup: Option<RunRollup>,
}

/// Run status rollup computed from the run's persisted tasks.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunRollup {
    pub run_id: String,
    pub previous_status: String,
    pub status: String,
    /// Non-zero task-status counts behind the rollup.
    pub counts: BTreeMap<String, usize>,
}

// ---------------------------------------------------------------------------
// Orchestrator service
// ---------------------------------------------------------------------------

pub struct OrchestratorService;

impl OrchestratorService {
    /// Applies one canonical event to persisted state inside a single write
    /// transaction: transition validation, status persistence, reference
    /// columns, dependency gating, and run rollup commit or roll back
    /// together. Replaying an already-applied transition is an idempotent
    /// no-op success.
    pub fn apply_event(
        conn: &mut Connection,
        event: &CanonicalEvent,
    ) -> Result<ApplyOutcome, CoreError> {
        with_write_tx(conn, |tx| apply_in_tx(tx, event))
    }

    /// The same projection inside a CALLER-OWNED transaction: the event pump
    /// composes event persistence and projection into one atomic unit
    /// (review R5) — a failed projection rolls the event back with it, so
    /// the persisted log never claims a projection that did not land.
    pub fn apply_event_tx(
        tx: &Transaction<'_>,
        event: &CanonicalEvent,
    ) -> Result<ApplyOutcome, CoreError> {
        apply_in_tx(tx, event)
    }

    /// Commits one CORE-originated event atomically (round-2 review P1):
    /// the log row and its projection land in ONE write transaction or not
    /// at all. This is the single path every core-originated state event
    /// must take (`run_cancel`'s worker-gone convergence, startup recovery)
    /// — the pump's worker-event path enforces the same atomicity inline.
    /// Errors propagate: callers must never acknowledge or report success
    /// on top of a failed projection.
    pub fn commit_local_event(
        conn: &mut Connection,
        event: &ResearchEvent,
    ) -> Result<(), CoreError> {
        with_write_tx(conn, |tx| {
            crate::repositories::events::Events::append(
                tx,
                &crate::repositories::events::NewEvent {
                    run_id: event.run_id.clone(),
                    task_id: event.task_id.clone(),
                    event_type: event.event_type.clone(),
                    payload: serde_json::to_string(&event.payload).map_err(|err| {
                        CoreError::database(format!("serialize event payload failed: {err}"))
                    })?,
                },
            )?;
            apply_in_tx(tx, &CanonicalEvent::from(event))?;
            Ok(())
        })
    }
}

fn apply_in_tx(tx: &Transaction<'_>, event: &CanonicalEvent) -> Result<ApplyOutcome, CoreError> {
    match event.event_type.as_str() {
        "task.created" => {
            let id = require_task_id(event)?;
            let (from, to) = transition_task(tx, id, TaskStatus::Pending)?;
            Ok(task_outcome(id, from, to))
        }
        "task.started" => {
            let id = require_task_id(event)?;
            ensure_startable(tx, id)?;
            let (from, to) = transition_task(tx, id, TaskStatus::Running)?;
            let mut outcome = task_outcome(id, from, to);
            if outcome.to_status.is_some() {
                if from == TaskStatus::Failed {
                    // FAILED -> RUNNING is a retry: count it and drop the
                    // stale error reference.
                    Tasks::record_retry(tx, id)?;
                    Tasks::clear_error(tx, id)?;
                }
                outcome.run_rollup = rollup_run(tx, &event.run_id)?;
            }
            Ok(outcome)
        }
        "task.progress" | "task.checkpoint" => {
            let id = require_task_id(event)?;
            let task = load_task(tx, id)?;
            let from = parse_task_status(&task.status)?;
            if let Some(checkpoint) = event.payload.get("checkpoint").filter(|v| !v.is_null()) {
                Tasks::set_checkpoint(tx, id, &json_to_string(checkpoint)?)?;
            }
            Ok(task_outcome(id, from, None))
        }
        "task.completed" | "review.resolved" => {
            let id = require_task_id(event)?;
            let (from, to) = transition_task(tx, id, TaskStatus::Completed)?;
            let mut outcome = task_outcome(id, from, to);
            if outcome.to_status.is_some() {
                persist_result_ref(tx, event, id)?;
                // Nothing left to resume once the task is completed.
                Tasks::clear_checkpoint(tx, id)?;
                outcome.unblocked_dependents = unblock_dependents(tx, id)?;
                outcome.run_rollup = rollup_run(tx, &event.run_id)?;
            }
            Ok(outcome)
        }
        "task.failed" => {
            let id = require_task_id(event)?;
            let (from, to) = transition_task(tx, id, TaskStatus::Failed)?;
            let mut outcome = task_outcome(id, from, to);
            if outcome.to_status.is_some() {
                persist_error_ref(tx, event, id)?;
                outcome.failed_dependents = cascade_dependency_failure(tx, id)?;
                outcome.run_rollup = rollup_run(tx, &event.run_id)?;
            }
            Ok(outcome)
        }
        "task.skipped" => {
            let id = require_task_id(event)?;
            // The worker's legacy `task.cancelled` canonicalizes onto
            // `task.skipped` with `outcome=cancelled` (ADR-015): project it
            // as CANCELLED, not as an explicit skip.
            if event.payload_str("outcome") == Some("cancelled") {
                return cancel_task(tx, event, id);
            }
            let (from, to) = transition_task(tx, id, TaskStatus::Skipped)?;
            let mut outcome = task_outcome(id, from, to);
            if outcome.to_status.is_some() {
                if let Some(reason) = event
                    .payload_str("reason")
                    .or_else(|| event.payload_str("skip_reason"))
                {
                    Tasks::set_skip_reason(tx, id, reason)?;
                }
                outcome.unblocked_dependents = unblock_dependents(tx, id)?;
                outcome.run_rollup = rollup_run(tx, &event.run_id)?;
            }
            Ok(outcome)
        }
        "task.cancelled" => {
            let id = require_task_id(event)?;
            cancel_task(tx, event, id)
        }
        "review.requested" => {
            let id = require_task_id(event)?;
            let (from, to) = transition_task(tx, id, TaskStatus::NeedsReview)?;
            let mut outcome = task_outcome(id, from, to);
            if outcome.to_status.is_some() {
                persist_result_ref(tx, event, id)?;
                outcome.run_rollup = rollup_run(tx, &event.run_id)?;
            }
            Ok(outcome)
        }
        "run.started" => run_event(tx, event, RunStatus::Running),
        "run.paused" => run_event(tx, event, RunStatus::Paused),
        "run.completed" => run_event(tx, event, RunStatus::Completed),
        "run.failed" => run_event(tx, event, RunStatus::Failed),
        "run.cancelled" => run_event(tx, event, RunStatus::Cancelled),
        // plan.*/source.*/claim.* and any future vocabulary carry no task or
        // run projection; the pump persists them regardless.
        _ => Ok(ApplyOutcome::default()),
    }
}

// ---------------------------------------------------------------------------
// Task-side helpers
// ---------------------------------------------------------------------------

fn require_task_id(event: &CanonicalEvent) -> Result<&str, CoreError> {
    event.resolve_task_id().ok_or_else(|| {
        CoreError::database(format!(
            "event '{}' carries no task_id (envelope or payload)",
            event.event_type
        ))
    })
}

fn load_task(conn: &Connection, id: &str) -> Result<TaskRecord, CoreError> {
    Tasks::get(conn, id)?.ok_or_else(|| CoreError::database(format!("task '{id}' not found")))
}

fn parse_task_status(value: &str) -> Result<TaskStatus, CoreError> {
    TaskStatus::parse(value)
        .ok_or_else(|| CoreError::database(format!("unknown task status '{value}'")))
}

fn parse_run_status(value: &str) -> Result<RunStatus, CoreError> {
    RunStatus::parse(value)
        .ok_or_else(|| CoreError::database(format!("unknown run status '{value}'")))
}

fn json_to_string(value: &Value) -> Result<String, CoreError> {
    serde_json::to_string(value)
        .map_err(|err| CoreError::database(format!("serializing event payload failed: {err}")))
}

fn task_outcome(id: &str, from: TaskStatus, to: Option<TaskStatus>) -> ApplyOutcome {
    ApplyOutcome {
        task_id: Some(id.to_string()),
        from_status: Some(from),
        to_status: to,
        ..ApplyOutcome::default()
    }
}

/// Loads the task, validates the requested transition against the persisted
/// status, and persists it. Returns `(status_before, Some(new_status))`, or
/// `(status, None)` when the event replays the current status (idempotent
/// no-op, no write).
fn transition_task(
    tx: &Transaction<'_>,
    id: &str,
    target: TaskStatus,
) -> Result<(TaskStatus, Option<TaskStatus>), CoreError> {
    let task = load_task(tx, id)?;
    let from = parse_task_status(&task.status)?;
    can_transition(from, target)?;
    if from == target {
        return Ok((from, None));
    }
    Tasks::update_status(tx, id, target.as_str())?;
    Ok((from, Some(target)))
}

fn persist_result_ref(
    tx: &Transaction<'_>,
    event: &CanonicalEvent,
    id: &str,
) -> Result<(), CoreError> {
    if let Some(result_ref) = event.payload_str("result_ref") {
        Tasks::set_result(tx, id, result_ref)?;
    }
    Ok(())
}

fn persist_error_ref(
    tx: &Transaction<'_>,
    event: &CanonicalEvent,
    id: &str,
) -> Result<(), CoreError> {
    if let Some(error_ref) = event.payload_str("error_ref") {
        Tasks::set_error(tx, id, error_ref)?;
    } else if let Some(error) = event.payload.get("error").filter(|v| !v.is_null()) {
        Tasks::set_error(tx, id, &json_to_string(error)?)?;
    }
    Ok(())
}

/// Cancels one task: any non-terminal state closes into CANCELLED. A
/// cancelled dependency does not satisfy any condition, so dependents are
/// left untouched (they are cancelled by the run-level event).
fn cancel_task(
    tx: &Transaction<'_>,
    event: &CanonicalEvent,
    id: &str,
) -> Result<ApplyOutcome, CoreError> {
    let (from, to) = transition_task(tx, id, TaskStatus::Cancelled)?;
    let mut outcome = task_outcome(id, from, to);
    if outcome.to_status.is_some() {
        outcome.run_rollup = rollup_run(tx, &event.run_id)?;
    }
    Ok(outcome)
}

// ---------------------------------------------------------------------------
// Dependency gating
// ---------------------------------------------------------------------------

/// Whether `upstream_status` satisfies the given dependency condition.
fn condition_satisfied(condition: &str, upstream_status: TaskStatus) -> Result<bool, CoreError> {
    match condition {
        "completed" => Ok(upstream_status == TaskStatus::Completed),
        "completed-or-skipped" => Ok(matches!(
            upstream_status,
            TaskStatus::Completed | TaskStatus::Skipped
        )),
        other => Err(CoreError::database(format!(
            "unknown dependency condition '{other}'"
        ))),
    }
}

/// Rejects `task.started` for a task whose dependencies are not all
/// satisfied — dependents wait for predecessors (PRD §7).
fn ensure_startable(tx: &Transaction<'_>, task_id: &str) -> Result<(), CoreError> {
    let mut blocking = Vec::new();
    for dep in Tasks::dependencies_of(tx, task_id)? {
        let upstream = load_task(tx, &dep.depends_on_task_id)?;
        let status = parse_task_status(&upstream.status)?;
        if !condition_satisfied(&dep.condition, status)? {
            blocking.push(format!("{}={}", dep.depends_on_task_id, status.as_str()));
        }
    }
    if blocking.is_empty() {
        Ok(())
    } else {
        Err(CoreError::new(
            ErrorCode::TaskDependencyFailed,
            "This task cannot run because an upstream task has not finished.",
            format!(
                "task '{task_id}' blocked by unsatisfied dependencies: {}",
                blocking.join(", ")
            ),
            false,
        ))
    }
}

/// After a task completes or is explicitly skipped, reports PENDING direct
/// dependents whose dependencies are now all satisfied. PENDING is the
/// ready-for-dispatch state in this phase, so "unblocked" is descriptive
/// (persisted state already says everything); the phase-2 dispatcher will
/// consume it to schedule work.
fn unblock_dependents(tx: &Transaction<'_>, task_id: &str) -> Result<Vec<String>, CoreError> {
    let mut unblocked = Vec::new();
    for dep in Tasks::dependents_of(tx, task_id)? {
        let dependent = load_task(tx, &dep.task_id)?;
        if parse_task_status(&dependent.status)? != TaskStatus::Pending {
            continue;
        }
        if dependencies_satisfied(tx, &dep.task_id)? {
            unblocked.push(dep.task_id);
        }
    }
    Ok(unblocked)
}

fn dependencies_satisfied(tx: &Transaction<'_>, task_id: &str) -> Result<bool, CoreError> {
    for dep in Tasks::dependencies_of(tx, task_id)? {
        let upstream = load_task(tx, &dep.depends_on_task_id)?;
        let status = parse_task_status(&upstream.status)?;
        if !condition_satisfied(&dep.condition, status)? {
            return Ok(false);
        }
    }
    Ok(true)
}

/// A finally-failed task fails its waiting dependents transitively: every
/// PENDING task downstream (directly or through other failed tasks) moves to
/// FAILED with a structured `TASK_DEPENDENCY_FAILED` error reference.
/// Non-PENDING dependents keep their state, matching the worker's cascade.
fn cascade_dependency_failure(
    tx: &Transaction<'_>,
    failed_task_id: &str,
) -> Result<Vec<String>, CoreError> {
    let mut failed = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut queue: Vec<String> = vec![failed_task_id.to_string()];
    while let Some(current) = queue.pop() {
        for dep in Tasks::dependents_of(tx, &current)? {
            if !seen.insert(dep.task_id.clone()) {
                continue;
            }
            let dependent = load_task(tx, &dep.task_id)?;
            if parse_task_status(&dependent.status)? == TaskStatus::Pending {
                Tasks::update_status(tx, &dep.task_id, TaskStatus::Failed.as_str())?;
                let detail = json_to_string(&serde_json::json!({
                    "code": ErrorCode::TaskDependencyFailed.to_string(),
                    "upstream": failed_task_id,
                }))?;
                Tasks::set_error(tx, &dep.task_id, &detail)?;
                failed.push(dep.task_id.clone());
            }
            queue.push(dep.task_id);
        }
    }
    Ok(failed)
}

// ---------------------------------------------------------------------------
// Run rollup and run-level events
// ---------------------------------------------------------------------------

/// Derives the run status from its task statuses: any NEEDS_REVIEW parks the
/// run; once every task is settled (terminal, or FAILED awaiting/serving no
/// further work) the run closes (failed if anything failed, cancelled if
/// anything was cancelled, completed otherwise); otherwise the run is still
/// in flight. FAILED is settled for the rollup even though a single task may
/// later retry — the retry reopens the run through `failed -> running`.
fn rollup_target(statuses: &[TaskStatus]) -> Option<RunStatus> {
    if statuses.contains(&TaskStatus::NeedsReview) {
        return Some(RunStatus::NeedsReview);
    }
    if !statuses.iter().all(|s| s.is_run_settled()) {
        return None;
    }
    if statuses.contains(&TaskStatus::Failed) {
        Some(RunStatus::Failed)
    } else if statuses.contains(&TaskStatus::Cancelled) {
        Some(RunStatus::Cancelled)
    } else {
        Some(RunStatus::Completed)
    }
}

/// Recomputes the run's status from the persisted task statuses and applies
/// it when it differs. `None` when the run has no claimed tasks (nothing to
/// roll up).
fn rollup_run(tx: &Transaction<'_>, run_id: &str) -> Result<Option<RunRollup>, CoreError> {
    let tasks = Tasks::list_for_run(tx, run_id)?;
    if tasks.is_empty() {
        return Ok(None);
    }
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut statuses = Vec::with_capacity(tasks.len());
    for task in &tasks {
        let status = parse_task_status(&task.status)?;
        *counts.entry(status.as_str().to_string()).or_insert(0) += 1;
        statuses.push(status);
    }
    let run = Runs::get(tx, run_id)?
        .ok_or_else(|| CoreError::database(format!("run '{run_id}' not found")))?;
    let current = parse_run_status(&run.status)?;
    let final_status = match rollup_target(&statuses) {
        Some(target) => {
            if target != current {
                can_transition_run(current, target)?;
                Runs::update_status(tx, run_id, target.as_str())?;
            }
            target
        }
        None => {
            // Still in flight: a reopened (retried) task must read the run
            // as running again; an explicitly paused run stays paused.
            if current != RunStatus::Running && current != RunStatus::Paused {
                Runs::update_status(tx, run_id, RunStatus::Running.as_str())?;
            }
            if current == RunStatus::Paused {
                RunStatus::Paused
            } else {
                RunStatus::Running
            }
        }
    };
    Ok(Some(RunRollup {
        run_id: run_id.to_string(),
        previous_status: current.as_str().to_string(),
        status: final_status.as_str().to_string(),
        counts,
    }))
}

/// Applies a run-level event: validates the run transition, then adjusts the
/// run's tasks (`run.started` claims the plan's unassigned PENDING tasks and
/// resumes paused ones; `run.paused` pauses running ones; `run.cancelled`
/// cancels every non-terminal one).
fn run_event(
    tx: &Transaction<'_>,
    event: &CanonicalEvent,
    target: RunStatus,
) -> Result<ApplyOutcome, CoreError> {
    let run = Runs::get(tx, &event.run_id)?
        .ok_or_else(|| CoreError::database(format!("run '{}' not found", event.run_id)))?;
    let current = parse_run_status(&run.status)?;
    can_transition_run(current, target)?;
    if current != target {
        Runs::update_status(tx, &run.id, target.as_str())?;
    }
    match target {
        RunStatus::Running => {
            Tasks::claim_for_run(tx, &run.plan_id, &run.id)?;
            for task in Tasks::list_for_run(tx, &run.id)? {
                if parse_task_status(&task.status)? == TaskStatus::Paused {
                    Tasks::update_status(tx, &task.id, TaskStatus::Running.as_str())?;
                }
            }
        }
        RunStatus::Paused => {
            for task in Tasks::list_for_run(tx, &run.id)? {
                if parse_task_status(&task.status)? == TaskStatus::Running {
                    Tasks::update_status(tx, &task.id, TaskStatus::Paused.as_str())?;
                }
            }
        }
        RunStatus::Cancelled => {
            for task in Tasks::list_for_run(tx, &run.id)? {
                if !parse_task_status(&task.status)?.is_terminal() {
                    Tasks::update_status(tx, &task.id, TaskStatus::Cancelled.as_str())?;
                }
            }
        }
        _ => {}
    }
    Ok(ApplyOutcome::default())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrated_memory_db;
    use crate::repositories::configs::{NewResearchConfig, ResearchConfigs};
    use crate::repositories::plans::{NewPlan, NewTask, PlanDraft, Plans};
    use crate::repositories::projects::{NewProject, Projects};
    use crate::repositories::runs::{NewRun, Runs};
    use crate::repositories::with_write_tx;
    use serde_json::json;

    /// Builds a migrated database with one run over a plan whose tasks are
    /// given as `(idempotency_key, depends_on_keys)` pairs, then applies
    /// `run.started` so the tasks are claimed for the run. Returns
    /// `(conn, run_id, key -> task_id)`.
    fn run_dag(spec: &[(&str, &[&str])]) -> (Connection, String, BTreeMap<String, String>) {
        let mut conn = migrated_memory_db().unwrap();
        let project_id = with_write_tx(&mut conn, |tx| {
            Projects::insert(
                tx,
                &NewProject {
                    name: "P".into(),
                    description: String::new(),
                },
            )
            .map(|p| p.id)
        })
        .unwrap();
        let config_id = with_write_tx(&mut conn, |tx| {
            ResearchConfigs::insert(
                tx,
                &NewResearchConfig {
                    project_id: project_id.clone(),
                    ..Default::default()
                },
            )
            .map(|c| c.id)
        })
        .unwrap();
        let tasks: Vec<NewTask> = spec
            .iter()
            .map(|(key, deps)| NewTask {
                title: (*key).into(),
                description: String::new(),
                task_type: "search".into(),
                idempotency_key: (*key).into(),
                section_index: None,
                depends_on: deps.iter().map(|s| s.to_string()).collect(),
            })
            .collect();
        let created = with_write_tx(&mut conn, |tx| {
            Plans::insert_draft(
                tx,
                &PlanDraft {
                    plan: NewPlan {
                        project_id: project_id.clone(),
                        research_config_id: config_id,
                        title: "T".into(),
                        rationale: String::new(),
                    },
                    sections: vec![],
                    tasks,
                },
            )
        })
        .unwrap();
        let run_id = with_write_tx(&mut conn, |tx| {
            Runs::insert(
                tx,
                &NewRun {
                    id: None,
                    project_id,
                    plan_id: created.plan.id.clone(),
                    started_at: None,
                },
            )
        })
        .unwrap()
        .id;
        let by_key: BTreeMap<String, String> = created
            .tasks
            .iter()
            .map(|t| (t.idempotency_key.clone(), t.id.clone()))
            .collect();
        apply(&mut conn, &run_id, None, "run.started", json!({})).unwrap();
        (conn, run_id, by_key)
    }

    fn apply(
        conn: &mut Connection,
        run_id: &str,
        task_id: Option<&str>,
        event_type: &str,
        payload: Value,
    ) -> Result<ApplyOutcome, CoreError> {
        OrchestratorService::apply_event(
            conn,
            &CanonicalEvent::new(run_id, task_id.map(str::to_string), event_type, payload),
        )
    }

    fn task(conn: &Connection, id: &str) -> TaskRecord {
        Tasks::get(conn, id).unwrap().unwrap()
    }

    fn status_of(conn: &Connection, id: &str) -> TaskStatus {
        parse_task_status(&task(conn, id).status).unwrap()
    }

    fn run(conn: &Connection, run_id: &str) -> crate::repositories::runs::RunRecord {
        Runs::get(conn, run_id).unwrap().unwrap()
    }

    fn start(conn: &mut Connection, run_id: &str, id: &str) -> ApplyOutcome {
        apply(
            conn,
            run_id,
            Some(id),
            "task.started",
            json!({ "task_type": "search" }),
        )
        .unwrap()
    }

    fn complete(conn: &mut Connection, run_id: &str, id: &str) -> ApplyOutcome {
        apply(conn, run_id, Some(id), "task.completed", json!({})).unwrap()
    }

    // -- state machine ------------------------------------------------------

    /// The PRD §7 / ADR-019 legal edges (self-transitions excluded; those are
    /// idempotent no-ops and always allowed).
    fn legal_edges() -> Vec<(TaskStatus, TaskStatus)> {
        use TaskStatus::*;
        vec![
            (Pending, Planning),
            (Pending, Running),
            (Pending, Failed),
            (Pending, Cancelled),
            (Pending, Skipped),
            (Planning, Running),
            (Planning, Failed),
            (Planning, Cancelled),
            (Planning, Skipped),
            (Running, Validating),
            (Running, Completed),
            (Running, NeedsReview),
            (Running, Paused),
            (Running, Failed),
            (Running, Cancelled),
            (Running, Skipped),
            (Validating, Completed),
            (Validating, NeedsReview),
            (Validating, Failed),
            (Validating, Cancelled),
            (NeedsReview, Completed),
            (NeedsReview, Running),
            (NeedsReview, Cancelled),
            (Paused, Running),
            (Paused, Cancelled),
            (Failed, Running),
            (Failed, Cancelled),
            (Failed, Completed),
        ]
    }

    #[test]
    fn transition_table_accepts_exactly_the_legal_edges() {
        let legal = legal_edges();
        for from in TaskStatus::ALL {
            for to in TaskStatus::ALL {
                let result = can_transition(from, to);
                if from == to {
                    assert!(result.is_ok(), "{from:?} -> {to:?} replay must be a no-op");
                } else if legal.contains(&(from, to)) {
                    assert!(result.is_ok(), "{from:?} -> {to:?} must be legal");
                } else {
                    let err = result.unwrap_err();
                    assert_eq!(err.code, ErrorCode::DatabaseError, "{from:?} -> {to:?}");
                    assert!(!err.retryable);
                    assert!(
                        err.developer_detail.contains("illegal task transition"),
                        "{err:?}"
                    );
                }
            }
        }
        assert_eq!(legal.len(), 28);
        // Terminal states are closed.
        for terminal in [
            TaskStatus::Completed,
            TaskStatus::Cancelled,
            TaskStatus::Skipped,
        ] {
            assert!(terminal.is_terminal());
        }
        assert!(!TaskStatus::Failed.is_terminal(), "FAILED can retry");
    }

    #[test]
    fn run_transitions_allow_retry_reopen_but_close_terminal_states() {
        for from in RunStatus::ALL {
            for to in RunStatus::ALL {
                let result = can_transition_run(from, to);
                if from == to {
                    assert!(result.is_ok());
                } else if !from.is_terminal() {
                    assert!(result.is_ok(), "{from:?} -> {to:?} must be legal");
                } else if from == RunStatus::Failed && to == RunStatus::Running {
                    assert!(result.is_ok(), "a retried task reopens a failed run");
                } else {
                    assert!(result.is_err(), "{from:?} -> {to:?} must be rejected");
                }
            }
        }
    }

    // -- projection basics --------------------------------------------------

    #[test]
    fn full_progression_persists_status_refs_and_clears_checkpoint() {
        let (mut conn, run_id, keys) = run_dag(&[("A", &[])]);
        let a = &keys["A"];

        let started = start(&mut conn, &run_id, a);
        assert_eq!(started.to_status, Some(TaskStatus::Running));

        apply(
            &mut conn,
            &run_id,
            Some(a),
            "task.progress",
            json!({"step": 2, "checkpoint": {"cursor": "page-2"}}),
        )
        .unwrap();
        assert_eq!(
            task(&conn, a).checkpoint.as_deref(),
            Some(r#"{"cursor":"page-2"}"#)
        );
        assert_eq!(status_of(&conn, a), TaskStatus::Running);

        apply(
            &mut conn,
            &run_id,
            Some(a),
            "task.checkpoint",
            json!({"checkpoint": {"cursor": "page-3"}}),
        )
        .unwrap();
        assert_eq!(
            task(&conn, a).checkpoint.as_deref(),
            Some(r#"{"cursor":"page-3"}"#)
        );

        let completed = apply(
            &mut conn,
            &run_id,
            Some(a),
            "task.completed",
            json!({"result_ref": "vault://out/a.md"}),
        )
        .unwrap();
        assert_eq!(
            (completed.from_status, completed.to_status),
            (Some(TaskStatus::Running), Some(TaskStatus::Completed))
        );
        let stored = task(&conn, a);
        assert_eq!(stored.status, "COMPLETED");
        assert_eq!(stored.result_ref.as_deref(), Some("vault://out/a.md"));
        assert!(
            stored.checkpoint.is_none(),
            "completed tasks have nothing to resume"
        );

        // Single-task run rolls up to completed with the per-state counts.
        let rollup = completed.run_rollup.unwrap();
        assert_eq!(rollup.previous_status, "running");
        assert_eq!(rollup.status, "completed");
        assert_eq!(rollup.counts, BTreeMap::from([("COMPLETED".into(), 1)]));
        assert!(run(&conn, &run_id).finished_at.is_some());
    }

    #[test]
    fn failed_task_persists_error_ref_and_fails_the_run() {
        let (mut conn, run_id, keys) = run_dag(&[("A", &[])]);
        let a = &keys["A"];
        start(&mut conn, &run_id, a);
        let failed = apply(
            &mut conn,
            &run_id,
            Some(a),
            "task.failed",
            json!({"error": {"code": "SEARCH_FAILED", "retryable": false}}),
        )
        .unwrap();
        assert_eq!(failed.to_status, Some(TaskStatus::Failed));
        assert!(task(&conn, a)
            .error_ref
            .as_deref()
            .unwrap()
            .contains("SEARCH_FAILED"));
        assert_eq!(run(&conn, &run_id).status, "failed");
    }

    #[test]
    fn idempotent_replay_of_a_transition_is_a_no_op_success() {
        let (mut conn, run_id, keys) = run_dag(&[("A", &[])]);
        let a = &keys["A"];
        start(&mut conn, &run_id, a);

        // Replayed task.started: already RUNNING.
        let replay_start = start(&mut conn, &run_id, a);
        assert_eq!(replay_start.to_status, None);
        assert_eq!(status_of(&conn, a), TaskStatus::Running);

        apply(&mut conn, &run_id, Some(a), "task.completed", json!({})).unwrap();
        let before = task(&conn, a);
        let replay_complete = apply(&mut conn, &run_id, Some(a), "task.completed", json!({}));
        assert!(replay_complete.is_ok());
        assert_eq!(replay_complete.unwrap().to_status, None);
        assert_eq!(task(&conn, a), before, "replay changed nothing");
        assert_eq!(run(&conn, &run_id).status, "completed");
    }

    #[test]
    fn illegal_and_out_of_order_events_are_rejected_without_corrupting_state() {
        let (mut conn, run_id, keys) = run_dag(&[("A", &[])]);
        let a = &keys["A"];

        // Completing a task that never started is out of order.
        let err = apply(&mut conn, &run_id, Some(a), "task.completed", json!({})).unwrap_err();
        assert_eq!(err.code, ErrorCode::DatabaseError);
        assert!(err
            .developer_detail
            .contains("illegal task transition PENDING -> COMPLETED"));
        assert_eq!(status_of(&conn, a), TaskStatus::Pending);
        assert_eq!(run(&conn, &run_id).status, "running");

        // Skipping after completion is refused.
        start(&mut conn, &run_id, a);
        complete(&mut conn, &run_id, a);
        let err = apply(
            &mut conn,
            &run_id,
            Some(a),
            "task.skipped",
            json!({"reason": "too late"}),
        )
        .unwrap_err();
        assert!(err
            .developer_detail
            .contains("illegal task transition COMPLETED -> SKIPPED"));

        // Unknown task references and taskless task events are structured
        // errors, not silent drops.
        let err = apply(&mut conn, &run_id, Some("ghost"), "task.started", json!({})).unwrap_err();
        assert!(err.developer_detail.contains("not found"));
        let err = apply(&mut conn, &run_id, None, "task.started", json!({})).unwrap_err();
        assert!(err.developer_detail.contains("no task_id"));
    }

    #[test]
    fn events_without_task_or_run_projection_are_no_ops() {
        let (mut conn, run_id, _keys) = run_dag(&[("A", &[])]);
        for event_type in ["plan.approved", "source.fetched", "claim.created"] {
            let outcome = apply(&mut conn, &run_id, None, event_type, json!({})).unwrap();
            assert_eq!(outcome, ApplyOutcome::default());
        }
        assert_eq!(run(&conn, &run_id).status, "running");
    }

    // -- dependency gating --------------------------------------------------

    #[test]
    fn diamond_dag_skip_still_unblocks_the_join() {
        let (mut conn, run_id, keys) =
            run_dag(&[("A", &[]), ("B", &["A"]), ("C", &["A"]), ("D", &["B", "C"])]);
        let (a, b, c, d) = (&keys["A"], &keys["B"], &keys["C"], &keys["D"]);

        // Completing A unblocks both branches.
        start(&mut conn, &run_id, a);
        let done_a = complete(&mut conn, &run_id, a);
        let mut unblocked = done_a.unblocked_dependents.clone();
        unblocked.sort();
        assert_eq!(unblocked, vec![b.clone(), c.clone()]);

        // Explicitly skipping B (PRD §7: dependents wait for completed OR
        // skipped) does not unblock D yet: C is still pending.
        start(&mut conn, &run_id, b);
        let skipped = apply(
            &mut conn,
            &run_id,
            Some(b),
            "task.skipped",
            json!({"reason": "covered elsewhere"}),
        )
        .unwrap();
        assert_eq!(skipped.to_status, Some(TaskStatus::Skipped));
        assert!(skipped.unblocked_dependents.is_empty());
        assert_eq!(
            task(&conn, b).skip_reason.as_deref(),
            Some("covered elsewhere")
        );
        assert_eq!(status_of(&conn, d), TaskStatus::Pending);

        // Completing C satisfies D's other edge: the skipped branch still
        // unblocks the join.
        start(&mut conn, &run_id, c);
        let done_c = complete(&mut conn, &run_id, c);
        assert_eq!(done_c.unblocked_dependents, vec![d.clone()]);

        // D runs and the run rolls up completed with per-state counts.
        start(&mut conn, &run_id, d);
        let done_d = complete(&mut conn, &run_id, d);
        let rollup = done_d.run_rollup.unwrap();
        assert_eq!(rollup.status, "completed");
        assert_eq!(
            rollup.counts,
            BTreeMap::from([("COMPLETED".into(), 3), ("SKIPPED".into(), 1)])
        );
        assert_eq!(run(&conn, &run_id).status, "completed");
    }

    #[test]
    fn failing_a_branch_fails_the_join_with_task_dependency_failed() {
        let (mut conn, run_id, keys) =
            run_dag(&[("A", &[]), ("B", &["A"]), ("C", &["A"]), ("D", &["B", "C"])]);
        let (a, b, c, d) = (&keys["A"], &keys["B"], &keys["C"], &keys["D"]);
        start(&mut conn, &run_id, a);
        complete(&mut conn, &run_id, a);
        start(&mut conn, &run_id, b);
        start(&mut conn, &run_id, c);

        let failed = apply(
            &mut conn,
            &run_id,
            Some(b),
            "task.failed",
            json!({"error_ref": "errors/b.json"}),
        )
        .unwrap();
        assert_eq!(failed.to_status, Some(TaskStatus::Failed));
        assert_eq!(failed.failed_dependents, vec![d.clone()]);
        let stored = task(&conn, d);
        assert_eq!(stored.status, "FAILED");
        assert!(stored
            .error_ref
            .as_deref()
            .unwrap()
            .contains("TASK_DEPENDENCY_FAILED"));

        // Completing the healthy branch cannot resurrect the failed join.
        let done_c = complete(&mut conn, &run_id, c);
        assert!(done_c.unblocked_dependents.is_empty());
        assert_eq!(status_of(&conn, d), TaskStatus::Failed);

        // Once everything settles the run reads failed (any failed task).
        let rollup = done_c.run_rollup.unwrap();
        assert_eq!(rollup.status, "failed");
        assert_eq!(run(&conn, &run_id).status, "failed");
    }

    #[test]
    fn dependency_failure_cascades_transitively_through_pending_tasks() {
        let (mut conn, run_id, keys) = run_dag(&[("A", &[]), ("B", &["A"]), ("C", &["B"])]);
        let (a, b, c) = (&keys["A"], &keys["B"], &keys["C"]);
        start(&mut conn, &run_id, a);

        let failed = apply(&mut conn, &run_id, Some(a), "task.failed", json!({})).unwrap();
        let mut cascaded = failed.failed_dependents.clone();
        cascaded.sort();
        let mut expected = vec![b.clone(), c.clone()];
        expected.sort();
        assert_eq!(cascaded, expected);
        for id in [&b, &c] {
            let stored = task(&conn, id);
            assert_eq!(stored.status, "FAILED");
            assert!(stored
                .error_ref
                .as_deref()
                .unwrap()
                .contains("TASK_DEPENDENCY_FAILED"));
        }
        assert_eq!(run(&conn, &run_id).status, "failed");
    }

    #[test]
    fn starting_a_task_with_unsatisfied_dependencies_is_rejected() {
        let (mut conn, run_id, keys) = run_dag(&[("A", &[]), ("B", &["A"])]);
        let (a, b) = (&keys["A"], &keys["B"]);

        let err = apply(&mut conn, &run_id, Some(b), "task.started", json!({})).unwrap_err();
        assert_eq!(err.code, ErrorCode::TaskDependencyFailed);
        assert!(err.developer_detail.contains(a.as_str()));
        assert_eq!(status_of(&conn, b), TaskStatus::Pending);

        // A RUNNING upstream also blocks the dependent.
        start(&mut conn, &run_id, a);
        let err = apply(&mut conn, &run_id, Some(b), "task.started", json!({})).unwrap_err();
        assert_eq!(err.code, ErrorCode::TaskDependencyFailed);
        assert!(err.developer_detail.contains("RUNNING"));

        // After completion the same start is accepted.
        complete(&mut conn, &run_id, a);
        assert_eq!(
            start(&mut conn, &run_id, b).to_status,
            Some(TaskStatus::Running)
        );
    }

    #[test]
    fn strict_completed_condition_is_not_satisfied_by_a_skip() {
        let (mut conn, run_id, keys) = run_dag(&[("A", &[]), ("B", &["A"])]);
        let (a, b) = (&keys["A"], &keys["B"]);
        // Tighten the dependency to condition = 'completed'.
        with_write_tx(&mut conn, |tx| {
            tx.execute(
                "UPDATE task_dependencies SET condition = 'completed' WHERE task_id = ?1",
                rusqlite::params![b],
            )
            .map_err(CoreError::from)
        })
        .unwrap();

        start(&mut conn, &run_id, a);
        let skipped = apply(
            &mut conn,
            &run_id,
            Some(a),
            "task.skipped",
            json!({"reason": "not needed"}),
        )
        .unwrap();
        assert_eq!(skipped.to_status, Some(TaskStatus::Skipped));
        assert!(skipped.unblocked_dependents.is_empty());
        assert_eq!(status_of(&conn, b), TaskStatus::Pending);

        let err = apply(&mut conn, &run_id, Some(b), "task.started", json!({})).unwrap_err();
        assert_eq!(err.code, ErrorCode::TaskDependencyFailed);
    }

    // -- review and cancellation -------------------------------------------

    #[test]
    fn needs_review_parks_the_run_until_resolved() {
        let (mut conn, run_id, keys) = run_dag(&[("A", &[]), ("B", &[])]);
        let (a, b) = (&keys["A"], &keys["B"]);
        start(&mut conn, &run_id, a);
        complete(&mut conn, &run_id, a);

        start(&mut conn, &run_id, b);
        let review = apply(
            &mut conn,
            &run_id,
            Some(b),
            "review.requested",
            json!({"result_ref": "vault://review/b.md"}),
        )
        .unwrap();
        assert_eq!(review.to_status, Some(TaskStatus::NeedsReview));
        assert_eq!(
            task(&conn, b).result_ref.as_deref(),
            Some("vault://review/b.md")
        );
        let parked = run(&conn, &run_id);
        assert_eq!(parked.status, "needs_review");
        assert!(parked.finished_at.is_none(), "needs_review is not terminal");

        let resolved = apply(&mut conn, &run_id, Some(b), "review.resolved", json!({})).unwrap();
        assert_eq!(resolved.to_status, Some(TaskStatus::Completed));
        let finished = run(&conn, &run_id);
        assert_eq!(finished.status, "completed");
        assert!(finished.finished_at.is_some());
    }

    #[test]
    fn worker_cancel_projections_close_tasks_as_cancelled() {
        let (mut conn, run_id, keys) = run_dag(&[("A", &[]), ("B", &[])]);
        let (a, b) = (&keys["A"], &keys["B"]);
        start(&mut conn, &run_id, a);

        // Legacy task.cancelled passes through untouched.
        apply(&mut conn, &run_id, Some(a), "task.cancelled", json!({})).unwrap();
        assert_eq!(status_of(&conn, a), TaskStatus::Cancelled);

        // Canonical task.skipped with outcome=cancelled (ADR-015 rename) is
        // also a cancellation, not an explicit skip.
        start(&mut conn, &run_id, b);
        apply(
            &mut conn,
            &run_id,
            Some(b),
            "task.skipped",
            json!({"outcome": "cancelled"}),
        )
        .unwrap();
        assert_eq!(status_of(&conn, b), TaskStatus::Cancelled);
        assert!(task(&conn, b).skip_reason.is_none());
        // Both tasks are terminal with a cancellation: the run follows.
        assert_eq!(run(&conn, &run_id).status, "cancelled");
    }

    #[test]
    fn run_cancellation_cancels_every_non_terminal_task() {
        let (mut conn, run_id, keys) = run_dag(&[("A", &[]), ("B", &["A"])]);
        let (a, b) = (&keys["A"], &keys["B"]);
        start(&mut conn, &run_id, a);
        complete(&mut conn, &run_id, a);
        start(&mut conn, &run_id, b);

        apply(&mut conn, &run_id, None, "run.cancelled", json!({})).unwrap();
        assert_eq!(
            status_of(&conn, a),
            TaskStatus::Completed,
            "terminal tasks keep their state"
        );
        assert_eq!(status_of(&conn, b), TaskStatus::Cancelled);
        assert_eq!(run(&conn, &run_id).status, "cancelled");
    }

    #[test]
    fn run_pause_and_resume_move_tasks_with_the_run() {
        let (mut conn, run_id, keys) = run_dag(&[("A", &[])]);
        let a = &keys["A"];
        start(&mut conn, &run_id, a);

        apply(&mut conn, &run_id, None, "run.paused", json!({})).unwrap();
        assert_eq!(status_of(&conn, a), TaskStatus::Paused);
        assert_eq!(run(&conn, &run_id).status, "paused");

        apply(&mut conn, &run_id, None, "run.started", json!({})).unwrap();
        assert_eq!(status_of(&conn, a), TaskStatus::Running);
        assert_eq!(run(&conn, &run_id).status, "running");
    }

    // -- retry ---------------------------------------------------------------

    #[test]
    fn retrying_a_failed_task_recounts_retries_and_reopens_the_run() {
        let (mut conn, run_id, keys) = run_dag(&[("A", &[])]);
        let a = &keys["A"];
        start(&mut conn, &run_id, a);
        apply(
            &mut conn,
            &run_id,
            Some(a),
            "task.failed",
            json!({"error_ref": "errors/a.json"}),
        )
        .unwrap();
        assert_eq!(run(&conn, &run_id).status, "failed");
        assert!(run(&conn, &run_id).finished_at.is_some());

        let retried = start(&mut conn, &run_id, a);
        assert_eq!(
            (retried.from_status, retried.to_status),
            (Some(TaskStatus::Failed), Some(TaskStatus::Running))
        );
        let stored = task(&conn, a);
        assert_eq!(stored.retry_count, 1);
        assert!(
            stored.error_ref.is_none(),
            "the stale error ref is cleared on retry"
        );
        let reopened = run(&conn, &run_id);
        assert_eq!(reopened.status, "running");
        assert!(
            reopened.finished_at.is_none(),
            "reopening clears finished_at"
        );

        complete(&mut conn, &run_id, a);
        assert_eq!(run(&conn, &run_id).status, "completed");
    }
}
