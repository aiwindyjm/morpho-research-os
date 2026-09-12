//! Worker supervisor: process lifecycle over the worker protocol.
//!
//! Contract source: `docs/API.md` and the frozen `docs/api/WORKER_PROTOCOL.md`
//! — the core spawns the worker with an ephemeral session token and a
//! protocol version, checks `/health` and `/version` compatibility, restarts
//! with bounded backoff, and reports `WORKER_NOT_AVAILABLE` after exhaustion.
//! [`FakeWorker`](fake::FakeWorker) is the hermetic transport used by tests;
//! [`HttpWorkerTransport`](http::HttpWorkerTransport) speaks the real loopback
//! HTTP/1.1 protocol (including the `GET /jobs/{id}/events` SSE stream).
//!
//! The supervisor is transport-agnostic and synchronous: time and sleeping
//! are injected so tests exercise backoff without real delays.

pub mod fake;
pub mod http;
pub mod process;

use crate::error::{CoreError, ErrorCode};
use crate::ipc::ResearchEvent;
use crate::versions::WORKER_PROTOCOL_VERSION;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// Response of `GET /health`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HealthInfo {
    pub status: String,
    pub protocol_version: String,
}

/// Response of `GET /version`, normalized by the transport from the wire
/// envelope (`worker_version` plus the accepted protocol range).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkerVersionInfo {
    pub worker_version: String,
    pub protocol_min: String,
    pub protocol_max: String,
}

/// A job to execute. Core-side identity plus the worker wire payload: the
/// HTTP transport sends `params` as the job `config` and `approve_plan` as
/// the plan-review decision (`kind` maps 1:1, e.g. `research_run`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JobRequest {
    /// Core-side job id. The worker mints the authoritative wire id; the
    /// acknowledged id in [`JobAck`] wins for all follow-up calls.
    pub job_id: String,
    pub run_id: String,
    pub task_id: Option<String>,
    pub kind: String,
    pub params: Value,
    /// The caller's plan-review decision; without it the worker rejects the
    /// job (`PLAN_NOT_APPROVED`) and no DAG runs.
    #[serde(default)]
    pub approve_plan: bool,
}

/// Acknowledgement of `POST /jobs`. `job_id` is the worker's authoritative
/// id for the job (it mints its own).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct JobAck {
    pub job_id: String,
    pub accepted: bool,
}

/// One worker event from `GET /jobs/{id}/events`. The transport normalizes
/// the wire envelope (canonical `type`/`sequence` names preferred, legacy
/// `event_type`/`kind`/`seq` tolerated) into this shape; the supervisor
/// converts these into redacted [`ResearchEvent`]s for the frontend.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkerEvent {
    pub job_id: String,
    pub sequence: u64,
    pub event_type: String,
    pub payload: Value,
}

/// Transport port mirroring the worker HTTP endpoints. `spawn` receives the
/// ephemeral session token for this process instance.
pub trait WorkerTransport {
    /// Starts (or connects to) the worker process for this instance.
    fn spawn(&mut self, token: &str) -> Result<(), CoreError>;
    fn health(&mut self) -> Result<HealthInfo, CoreError>;
    fn version(&mut self) -> Result<WorkerVersionInfo, CoreError>;
    fn submit_job(&mut self, request: &JobRequest) -> Result<JobAck, CoreError>;
    /// `GET /jobs/{id}`: the worker's transport-level job status envelope
    /// (status, counts, run/plan ids), returned as parsed JSON because the
    /// envelope shape is owned by the worker contract.
    fn job_status(&mut self, job_id: &str) -> Result<Value, CoreError>;
    fn cancel_job(&mut self, job_id: &str) -> Result<(), CoreError>;
    fn poll_events(&mut self, job_id: &str, cursor: u64) -> Result<Vec<WorkerEvent>, CoreError>;
    fn shutdown(&mut self) -> Result<(), CoreError>;
    /// Cheap liveness probe; false means the process crashed and the
    /// supervisor must restart it.
    fn is_alive(&self) -> bool;
}

/// Creates one transport per (re)start attempt.
pub type TransportFactory =
    dyn FnMut() -> Result<Box<dyn WorkerTransport + Send>, CoreError> + Send;

/// Wall clock port so tests control time.
pub trait Clock: Send {
    fn now_ms(&self) -> u64;
}

/// Sleep port so tests observe backoff without waiting.
pub trait Sleeper: Send {
    fn sleep_ms(&mut self, ms: u64);
}

/// Real clock (production default).
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_ms(&self) -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }
}

/// Real sleeper (production default).
pub struct SystemSleeper;

impl Sleeper for SystemSleeper {
    fn sleep_ms(&mut self, ms: u64) {
        std::thread::sleep(std::time::Duration::from_millis(ms));
    }
}

/// Bounded exponential backoff: `base * 2^attempt`, capped at `max`.
#[derive(Debug, Clone, PartialEq)]
pub struct RestartPolicy {
    pub max_restarts: u32,
    pub base_delay_ms: u64,
    pub max_delay_ms: u64,
}

impl Default for RestartPolicy {
    fn default() -> Self {
        Self {
            max_restarts: 3,
            base_delay_ms: 250,
            max_delay_ms: 8_000,
        }
    }
}

impl RestartPolicy {
    pub fn delay_for_attempt(&self, attempt: u32) -> u64 {
        let shift = attempt.min(16);
        self.base_delay_ms
            .saturating_mul(1_u64 << shift)
            .min(self.max_delay_ms)
    }
}

/// Lifecycle state of the supervised worker.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SupervisorState {
    /// Never started or shut down.
    Stopped,
    /// A healthy, protocol-compatible worker is attached.
    Ready,
    /// Restart budget exhausted; requires an explicit restart.
    Exhausted,
}

/// A tracked job: submitted to a live worker instance.
#[derive(Debug, Clone, PartialEq)]
struct ActiveJob {
    #[allow(dead_code)]
    job_id: String,
    run_id: String,
    task_id: Option<String>,
}

/// Supervises one worker process: start, health/version gating, bounded
/// restarts with backoff, cancellation, event forwarding with dedup, and
/// crash accounting for interrupted jobs.
pub struct Supervisor {
    transport_factory: Box<TransportFactory>,
    transport: Option<Box<dyn WorkerTransport + Send>>,
    policy: RestartPolicy,
    clock: Box<dyn Clock>,
    sleeper: Box<dyn Sleeper>,
    state: SupervisorState,
    restart_attempts: u32,
    active_jobs: HashMap<String, ActiveJob>,
    interrupted_jobs: Vec<String>,
    event_cursors: HashMap<String, u64>,
    spawned_tokens: Vec<String>,
}

impl Supervisor {
    pub fn new(
        transport_factory: Box<TransportFactory>,
        policy: RestartPolicy,
        clock: Box<dyn Clock>,
        sleeper: Box<dyn Sleeper>,
    ) -> Self {
        Self {
            transport_factory,
            transport: None,
            policy,
            clock,
            sleeper,
            state: SupervisorState::Stopped,
            restart_attempts: 0,
            active_jobs: HashMap::new(),
            interrupted_jobs: Vec::new(),
            event_cursors: HashMap::new(),
            spawned_tokens: Vec::new(),
        }
    }

    pub fn state(&self) -> SupervisorState {
        self.state.clone()
    }

    pub fn restart_attempts(&self) -> u32 {
        self.restart_attempts
    }

    /// Tokens handed to worker instances, in order (ephemeral per spawn).
    pub fn spawned_tokens(&self) -> &[String] {
        &self.spawned_tokens
    }

    /// Jobs whose worker instance died or was shut down before completion.
    /// The task layer (RES-02) uses this to mark tasks resumable.
    pub fn interrupted_jobs(&self) -> &[String] {
        &self.interrupted_jobs
    }

    /// Ids of jobs currently tracked as active (used by the event pump to
    /// know which SSE streams to poll).
    pub fn active_job_ids(&self) -> Vec<String> {
        self.active_jobs.keys().cloned().collect()
    }

    /// Ensures a healthy, protocol-compatible worker is attached, restarting
    /// with backoff after crashes. `WORKER_NOT_AVAILABLE` (non-retryable) is
    /// returned once the restart budget is spent.
    pub fn ensure_started(&mut self) -> Result<(), CoreError> {
        if self.state == SupervisorState::Ready {
            if let Some(transport) = self.transport.as_ref() {
                if transport.is_alive() {
                    return Ok(());
                }
                // Process died under us: account interrupted jobs and restart.
                self.mark_jobs_interrupted();
                self.transport = None;
                self.state = SupervisorState::Stopped;
            }
        }

        loop {
            if self.restart_attempts >= self.policy.max_restarts {
                self.state = SupervisorState::Exhausted;
                return Err(worker_unavailable(
                    format!(
                        "restart budget exhausted after {} attempts",
                        self.restart_attempts
                    ),
                    false,
                ));
            }
            if self.restart_attempts > 0 {
                let delay = self.policy.delay_for_attempt(self.restart_attempts - 1);
                self.sleeper.sleep_ms(delay);
            }
            match self.start_worker() {
                Ok(()) => {
                    self.restart_attempts = 0;
                    self.state = SupervisorState::Ready;
                    return Ok(());
                }
                Err(err) if !err.retryable => {
                    // Protocol incompatibility and explicit rejections are
                    // not transient; stop immediately.
                    self.state = SupervisorState::Exhausted;
                    return Err(err);
                }
                Err(err) => {
                    self.restart_attempts += 1;
                    tracing_note(format!(
                        "worker start attempt failed ({}): restart {}",
                        err.code, self.restart_attempts
                    ));
                }
            }
        }
    }

    /// Spawns one worker instance and performs the health/version gate.
    fn start_worker(&mut self) -> Result<(), CoreError> {
        let mut transport = (self.transport_factory)()
            .map_err(|err| worker_unavailable(format!("transport factory failed: {err}"), true))?;

        // Ephemeral session token, regenerated for every (re)start.
        let token = uuid::Uuid::new_v4().to_string();
        transport.spawn(&token)?;
        self.spawned_tokens.push(token);

        let health = transport.health()?;
        if health.status != "ok" {
            return Err(worker_unavailable(
                format!("health status '{}'", health.status),
                true,
            ));
        }

        let version = transport.version()?;
        if !protocol_compatible(&version.protocol_min, &version.protocol_max) {
            return Err(CoreError::new(
                ErrorCode::WorkerNotAvailable,
                "The research worker version is not compatible with this app.",
                format!(
                    "protocol incompatible: worker supports [{}, {}], core speaks {}",
                    version.protocol_min, version.protocol_max, WORKER_PROTOCOL_VERSION
                ),
                false,
            ));
        }

        self.transport = Some(transport);
        Ok(())
    }

    /// Submits a job, restarting the worker first if needed. The job is
    /// tracked (under the worker-acknowledged id) until cancelled or
    /// interrupted.
    pub fn submit_job(&mut self, request: &JobRequest) -> Result<JobAck, CoreError> {
        self.ensure_started()?;
        let transport = self
            .transport
            .as_mut()
            .ok_or_else(|| worker_unavailable("no transport attached", false))?;
        let ack = transport.submit_job(request)?;
        if !ack.accepted {
            return Err(worker_unavailable(
                format!("job {} not accepted by worker", request.job_id),
                true,
            ));
        }
        // The worker mints the authoritative job id; all follow-up calls
        // (status/cancel/events) use the acknowledged id.
        self.active_jobs.insert(
            ack.job_id.clone(),
            ActiveJob {
                job_id: ack.job_id.clone(),
                run_id: request.run_id.clone(),
                task_id: request.task_id.clone(),
            },
        );
        Ok(ack)
    }

    /// Fetches the worker's transport-level job status envelope
    /// (`GET /jobs/{id}`), restarting the worker first if needed.
    pub fn job_status(&mut self, job_id: &str) -> Result<Value, CoreError> {
        self.ensure_started()?;
        let transport = self
            .transport
            .as_mut()
            .ok_or_else(|| worker_unavailable("no transport attached", false))?;
        transport.job_status(job_id)
    }

    /// Cancels a job through the protocol (never by killing the process).
    pub fn cancel_job(&mut self, job_id: &str) -> Result<(), CoreError> {
        self.ensure_started()?;
        let transport = self
            .transport
            .as_mut()
            .ok_or_else(|| worker_unavailable("no transport attached", false))?;
        transport.cancel_job(job_id)?;
        self.active_jobs.remove(job_id);
        Ok(())
    }

    /// Polls new events for a job and forwards them as redacted
    /// [`ResearchEvent`]s. Duplicate or stale sequences (re-delivered after
    /// reconnect) are dropped, so events are never forwarded twice.
    pub fn poll_events(&mut self, job_id: &str) -> Result<Vec<ResearchEvent>, CoreError> {
        self.ensure_started()?;
        let job = self
            .active_jobs
            .get(job_id)
            .ok_or_else(|| CoreError::database(format!("job '{job_id}' is not active")))?;
        let (run_id, task_id) = (job.run_id.clone(), job.task_id.clone());

        let cursor = self.event_cursors.get(job_id).copied().unwrap_or(0);
        let transport = self
            .transport
            .as_mut()
            .ok_or_else(|| worker_unavailable("no transport attached", false))?;
        let raw_events = transport.poll_events(job_id, cursor)?;

        let timestamp_ms = self.clock.now_ms();
        let mut forwarded = Vec::with_capacity(raw_events.len());
        for event in raw_events {
            let last = self.event_cursors.get(job_id).copied().unwrap_or(0);
            if event.sequence <= last {
                continue; // duplicate or stale delivery
            }
            self.event_cursors
                .insert(job_id.to_string(), event.sequence);
            forwarded.push(ResearchEvent::new(
                run_id.clone(),
                task_id.clone(),
                event.sequence,
                timestamp_ms,
                event.event_type,
                event.payload,
            ));
        }
        Ok(forwarded)
    }

    /// Shuts the worker down cleanly. Active jobs are recorded as
    /// interrupted so their tasks can be resumed later.
    pub fn shutdown(&mut self) -> Result<(), CoreError> {
        self.mark_jobs_interrupted();
        if let Some(mut transport) = self.transport.take() {
            transport.shutdown()?;
        }
        self.state = SupervisorState::Stopped;
        self.restart_attempts = 0;
        Ok(())
    }

    fn mark_jobs_interrupted(&mut self) {
        let ids: Vec<String> = self.active_jobs.keys().cloned().collect();
        for id in ids {
            self.active_jobs.remove(&id);
            if !self.interrupted_jobs.contains(&id) {
                self.interrupted_jobs.push(id);
            }
        }
    }
}

/// `WORKER_NOT_AVAILABLE` with the contract's semantics: transient failures
/// are retryable; exhaustion and incompatibility are not.
fn worker_unavailable(detail: impl Into<String>, retryable: bool) -> CoreError {
    CoreError::new(
        ErrorCode::WorkerNotAvailable,
        "The research worker is not available.",
        detail,
        retryable,
    )
}

/// True when the core's protocol version fits the worker's supported range.
pub fn protocol_compatible(min: &str, max: &str) -> bool {
    match (
        parse_semver(min),
        parse_semver(max),
        parse_semver(WORKER_PROTOCOL_VERSION),
    ) {
        (Some(min), Some(max), Some(ours)) => min <= ours && ours <= max,
        _ => false,
    }
}

/// Parses `major.minor.patch`; missing parts default to 0.
fn parse_semver(text: &str) -> Option<(u64, u64, u64)> {
    let mut parts = text.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
    let patch = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
    Some((major, minor, patch))
}

/// Minimal tracing stand-in: tauri's log plugin is wired in W2-05; until
/// then failures are only counted in memory by tests via returned errors.
fn tracing_note(_message: String) {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::worker::fake::{FakeClock, FakeHandle, FakeSleeper, FakeWorkerScript};
    use serde_json::json;

    fn policy() -> RestartPolicy {
        RestartPolicy {
            max_restarts: 3,
            base_delay_ms: 100,
            max_delay_ms: 1_000,
        }
    }

    fn supervisor(script: FakeWorkerScript) -> (Supervisor, FakeClock, FakeSleeper, FakeHandle) {
        let clock = FakeClock::default();
        let sleeper = FakeSleeper::default();
        let (factory, handle) = FakeWorkerScript::factory(script);
        let supervisor = Supervisor::new(
            factory,
            policy(),
            Box::new(clock.clone()),
            Box::new(sleeper.clone()),
        );
        (supervisor, clock, sleeper, handle)
    }

    fn job(id: &str) -> JobRequest {
        JobRequest {
            job_id: id.into(),
            run_id: "run-1".into(),
            task_id: Some("task-1".into()),
            kind: "search".into(),
            params: json!({"query": "llm scaling"}),
            approve_plan: false,
        }
    }

    #[test]
    fn healthy_worker_starts_with_ephemeral_token() {
        let (mut supervisor, _clock, _sleeper, handle) = supervisor(FakeWorkerScript::healthy());
        supervisor.ensure_started().unwrap();
        assert_eq!(supervisor.state(), SupervisorState::Ready);
        assert_eq!(supervisor.spawned_tokens().len(), 1);
        assert_eq!(
            handle.received_tokens(),
            supervisor.spawned_tokens().to_vec()
        );
        // Token shape: a fresh UUIDv4 per spawn.
        assert!(uuid::Uuid::parse_str(&supervisor.spawned_tokens()[0]).is_ok());
    }

    #[test]
    fn incompatible_protocol_is_rejected_without_restarts() {
        let mut script = FakeWorkerScript::healthy();
        script.protocol_min = "9.0.0".into();
        script.protocol_max = "9.1.0".into();
        let (mut supervisor, _clock, sleeper, _handle) = supervisor(script);
        let err = supervisor.ensure_started().unwrap_err();
        assert_eq!(err.code, ErrorCode::WorkerNotAvailable);
        assert!(!err.retryable);
        assert!(err.developer_detail.contains("protocol incompatible"));
        assert_eq!(
            supervisor.restart_attempts(),
            0,
            "incompatibility must not burn restarts"
        );
        assert!(sleeper.sleeps().is_empty());
        assert_eq!(supervisor.state(), SupervisorState::Exhausted);
    }

    #[test]
    fn unhealthy_worker_is_a_transient_failure() {
        let mut script = FakeWorkerScript::healthy();
        script.health_status = "degraded".into();
        let (mut supervisor, _clock, _sleeper, _handle) = supervisor(script);
        let err = supervisor.ensure_started().unwrap_err();
        assert_eq!(err.code, ErrorCode::WorkerNotAvailable);
        assert!(err.developer_detail.contains("restart budget exhausted"));
    }

    #[test]
    fn spawn_failures_restart_with_backoff_until_success() {
        let mut script = FakeWorkerScript::healthy();
        script.spawn_failures_before_success = 2;
        let (mut supervisor, _clock, sleeper, _handle) = supervisor(script);
        supervisor.ensure_started().unwrap();
        assert_eq!(supervisor.state(), SupervisorState::Ready);
        assert_eq!(
            sleeper.sleeps(),
            vec![100, 200],
            "exponential backoff between attempts"
        );
    }

    #[test]
    fn exhausted_restarts_report_non_retryable_worker_unavailable() {
        let mut script = FakeWorkerScript::healthy();
        script.spawn_failures_before_success = 99;
        let (mut supervisor, _clock, sleeper, _handle) = supervisor(script);
        let err = supervisor.ensure_started().unwrap_err();
        assert_eq!(err.code, ErrorCode::WorkerNotAvailable);
        assert!(!err.retryable);
        assert!(err.developer_detail.contains("restart budget exhausted"));
        assert_eq!(supervisor.state(), SupervisorState::Exhausted);
        assert_eq!(sleeper.sleeps().len(), 2, "3 attempts => 2 sleeps");
    }

    #[test]
    fn crashed_worker_is_restarted_and_jobs_marked_interrupted() {
        let (mut supervisor, _clock, _sleeper, handle) = supervisor(FakeWorkerScript::healthy());

        let ack = supervisor.submit_job(&job("job-1")).unwrap();
        assert!(ack.accepted);

        // The process dies while idle; the next operation must detect it,
        // mark job-1 interrupted, restart, and still accept new work.
        handle.kill();
        let ack = supervisor.submit_job(&job("job-2")).unwrap();
        assert!(ack.accepted);
        assert_eq!(supervisor.interrupted_jobs(), vec!["job-1".to_string()]);
        assert_eq!(
            supervisor.spawned_tokens().len(),
            2,
            "worker was restarted once"
        );
        assert_eq!(supervisor.state(), SupervisorState::Ready);

        supervisor.submit_job(&job("job-3")).unwrap();
        assert_eq!(supervisor.state(), SupervisorState::Ready);
    }

    #[test]
    fn crash_during_submit_is_bounded_and_resumable() {
        let mut script = FakeWorkerScript::healthy();
        script.crash_after_job_submit = true;
        let (mut supervisor, _clock, _sleeper, _handle) = supervisor(script);

        supervisor.submit_job(&job("job-1")).unwrap();
        let ack = supervisor.submit_job(&job("job-2")).unwrap();
        assert!(ack.accepted, "restart recovers from a submit-time crash");
        assert!(supervisor.interrupted_jobs().contains(&"job-1".to_string()));
    }

    #[test]
    fn events_forward_once_with_dedup_and_redaction() {
        let mut script = FakeWorkerScript::healthy();
        script.events = vec![
            WorkerEvent {
                job_id: "job-1".into(),
                sequence: 1,
                event_type: "task.progress".into(),
                payload: json!({"step": 1}),
            },
            WorkerEvent {
                job_id: "job-1".into(),
                sequence: 2,
                event_type: "task.progress".into(),
                payload: json!({"api_key": String::from("k").repeat(12)}),
            },
        ];
        script.redeliver_last_event = true;
        let (mut supervisor, clock, _sleeper, _handle) = supervisor(script);
        supervisor.submit_job(&job("job-1")).unwrap();

        let first = supervisor.poll_events("job-1").unwrap();
        assert_eq!(first.len(), 2);
        assert_eq!(first[0].sequence, 1);
        assert_eq!(first[1].payload["api_key"], crate::redaction::REDACTED);
        assert_eq!(first[0].run_id, "run-1");
        assert!(first[0].timestamp_ms >= clock.now_ms());

        // Second poll re-delivers sequence 2 (reconnect scenario) — it must
        // be dropped, not forwarded again.
        let second = supervisor.poll_events("job-1").unwrap();
        assert!(
            second.is_empty(),
            "duplicate sequences must not be forwarded"
        );
    }

    #[test]
    fn cancel_goes_through_the_protocol() {
        let (mut supervisor, _clock, _sleeper, handle) = supervisor(FakeWorkerScript::healthy());
        supervisor.submit_job(&job("job-1")).unwrap();
        supervisor.cancel_job("job-1").unwrap();
        assert_eq!(handle.cancelled_jobs(), vec!["job-1".to_string()]);
        assert!(supervisor.interrupted_jobs().is_empty());
        let err = supervisor.poll_events("job-1").unwrap_err();
        assert!(err.developer_detail.contains("not active"));
    }

    #[test]
    fn shutdown_records_interrupted_jobs_and_stops() {
        let (mut supervisor, _clock, _sleeper, handle) = supervisor(FakeWorkerScript::healthy());
        supervisor.submit_job(&job("job-1")).unwrap();
        supervisor.shutdown().unwrap();
        assert_eq!(supervisor.state(), SupervisorState::Stopped);
        assert_eq!(supervisor.interrupted_jobs(), vec!["job-1".to_string()]);
        assert!(handle.shut_down());
        assert!(!handle.is_alive());
    }

    #[test]
    fn backoff_delays_are_bounded() {
        let policy = RestartPolicy {
            max_restarts: 10,
            base_delay_ms: 100,
            max_delay_ms: 1_000,
        };
        assert_eq!(policy.delay_for_attempt(0), 100);
        assert_eq!(policy.delay_for_attempt(1), 200);
        assert_eq!(policy.delay_for_attempt(2), 400);
        assert_eq!(policy.delay_for_attempt(5), 1_000, "capped at max_delay_ms");
        assert_eq!(policy.delay_for_attempt(9), 1_000);
    }

    #[test]
    fn protocol_compatibility_range_check() {
        use crate::versions::WORKER_PROTOCOL_MIN;
        assert!(protocol_compatible("1.0.0", "1.2.0"));
        assert!(protocol_compatible("1.0", "1.0"));
        // The Python worker reports the bare major ("1") — parsed as 1.0.0.
        assert!(protocol_compatible("1", "1"));
        assert!(!protocol_compatible("2.0.0", "3.0.0"));
        assert!(!protocol_compatible("garbage", "1.0.0"));
        assert_eq!(WORKER_PROTOCOL_MIN, "1.0");
    }
}
