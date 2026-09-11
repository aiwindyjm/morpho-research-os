//! Deterministic in-memory [`WorkerTransport`] for tests and offline runs.
//!
//! The fake simulates the draft protocol endpoints and injects failures
//! (spawn failures, crashes, unhealthy responses) through a shared handle so
//! supervisor behavior is testable without processes, ports, or networks.

use crate::error::{CoreError, ErrorCode};
use crate::worker::{
    HealthInfo, JobAck, JobRequest, TransportFactory, WorkerEvent, WorkerTransport,
    WorkerVersionInfo,
};
use serde_json::Value;
use std::sync::{Arc, Mutex};

/// Scriptable behavior of the fake worker process.
#[derive(Debug, Clone)]
pub struct FakeWorkerScript {
    /// How many spawn attempts fail before one succeeds.
    pub spawn_failures_before_success: u32,
    /// Reported protocol support range (health/version gate).
    pub protocol_min: String,
    pub protocol_max: String,
    /// Health status string; anything but "ok" is treated as unhealthy.
    pub health_status: String,
    /// Kill the process immediately after a successful job submit.
    pub crash_after_job_submit: bool,
    /// Re-deliver the last event on every poll after the first (tests
    /// reconnect dedup).
    pub redeliver_last_event: bool,
    /// Events returned by `poll_events`, in order.
    pub events: Vec<WorkerEvent>,
}

impl Default for FakeWorkerScript {
    fn default() -> Self {
        Self {
            spawn_failures_before_success: 0,
            protocol_min: crate::versions::WORKER_PROTOCOL_MIN.to_string(),
            protocol_max: crate::versions::WORKER_PROTOCOL_VERSION.to_string(),
            health_status: "ok".into(),
            crash_after_job_submit: false,
            redeliver_last_event: false,
            events: Vec::new(),
        }
    }
}

impl FakeWorkerScript {
    /// A healthy, compatible worker that accepts every job.
    pub fn healthy() -> Self {
        Self::default()
    }

    /// Builds a transport factory plus a [`FakeHandle`] for failure
    /// injection. Every factory call models a fresh process instance sharing
    /// the script.
    pub fn factory(self) -> (Box<TransportFactory>, FakeHandle) {
        let script = Arc::new(self);
        let state = Arc::new(Mutex::new(FakeInner::default()));
        let factory_state = Arc::clone(&state);
        let factory_script = Arc::clone(&script);
        let factory: Box<TransportFactory> = Box::new(move || {
            let mut state = factory_state.lock().expect("fake worker state poisoned");
            state.spawn_attempts += 1;
            if state.spawn_attempts <= factory_script.spawn_failures_before_success {
                return Err(CoreError::new(
                    ErrorCode::WorkerNotAvailable,
                    "The research worker is not available.",
                    format!(
                        "fake worker spawn attempt {} failed (scripted)",
                        state.spawn_attempts
                    ),
                    true,
                ));
            }
            state.next_instance += 1;
            let instance_id = state.next_instance;
            state.alive_instance = Some(instance_id);
            Ok(Box::new(FakeWorker {
                script: Arc::clone(&factory_script),
                state: Arc::clone(&factory_state),
                instance_id,
            }))
        });
        (factory, FakeHandle { state })
    }
}

#[derive(Debug, Default)]
struct FakeInner {
    spawn_attempts: u32,
    next_instance: u64,
    alive_instance: Option<u64>,
    received_tokens: Vec<String>,
    submitted_jobs: Vec<String>,
    cancelled_jobs: Vec<String>,
    shut_down: bool,
}

/// Test handle to observe and disrupt the fake worker.
#[derive(Clone)]
pub struct FakeHandle {
    state: Arc<Mutex<FakeInner>>,
}

impl FakeHandle {
    /// Kills the currently running instance (simulates a crash).
    pub fn kill(&self) {
        self.state
            .lock()
            .expect("fake worker state poisoned")
            .alive_instance = None;
    }

    pub fn is_alive(&self) -> bool {
        self.state
            .lock()
            .expect("fake worker state poisoned")
            .alive_instance
            .is_some()
    }

    pub fn received_tokens(&self) -> Vec<String> {
        self.state
            .lock()
            .expect("fake worker state poisoned")
            .received_tokens
            .clone()
    }

    pub fn submitted_jobs(&self) -> Vec<String> {
        self.state
            .lock()
            .expect("fake worker state poisoned")
            .submitted_jobs
            .clone()
    }

    pub fn cancelled_jobs(&self) -> Vec<String> {
        self.state
            .lock()
            .expect("fake worker state poisoned")
            .cancelled_jobs
            .clone()
    }

    pub fn shut_down(&self) -> bool {
        self.state
            .lock()
            .expect("fake worker state poisoned")
            .shut_down
    }
}

/// One fake worker process instance.
struct FakeWorker {
    script: Arc<FakeWorkerScript>,
    state: Arc<Mutex<FakeInner>>,
    instance_id: u64,
}

impl FakeWorker {
    fn ensure_alive(&self) -> Result<(), CoreError> {
        let state = self.state.lock().expect("fake worker state poisoned");
        if state.alive_instance == Some(self.instance_id) {
            Ok(())
        } else {
            Err(CoreError::new(
                ErrorCode::WorkerNotAvailable,
                "The research worker is not available.",
                "fake worker process is not running".to_string(),
                true,
            ))
        }
    }

    fn kill_self(&self, state: &mut FakeInner) {
        if state.alive_instance == Some(self.instance_id) {
            state.alive_instance = None;
        }
    }
}

impl WorkerTransport for FakeWorker {
    fn spawn(&mut self, token: &str) -> Result<(), CoreError> {
        self.state
            .lock()
            .expect("fake worker state poisoned")
            .received_tokens
            .push(token.to_string());
        Ok(())
    }

    fn health(&mut self) -> Result<HealthInfo, CoreError> {
        self.ensure_alive()?;
        if self.script.health_status != "ok" {
            let status = self.script.health_status.clone();
            return Err(CoreError::new(
                ErrorCode::WorkerNotAvailable,
                "The research worker is not available.",
                format!("fake worker health status '{status}'"),
                true,
            ));
        }
        Ok(HealthInfo {
            status: self.script.health_status.clone(),
            protocol_version: crate::versions::WORKER_PROTOCOL_VERSION.to_string(),
        })
    }

    fn version(&mut self) -> Result<WorkerVersionInfo, CoreError> {
        self.ensure_alive()?;
        Ok(WorkerVersionInfo {
            worker_version: "fake-worker-1".into(),
            protocol_min: self.script.protocol_min.clone(),
            protocol_max: self.script.protocol_max.clone(),
        })
    }

    fn submit_job(&mut self, request: &JobRequest) -> Result<JobAck, CoreError> {
        self.ensure_alive()?;
        let mut state = self.state.lock().expect("fake worker state poisoned");
        state.submitted_jobs.push(request.job_id.clone());
        if self.script.crash_after_job_submit {
            self.kill_self(&mut state);
        }
        Ok(JobAck {
            job_id: request.job_id.clone(),
            accepted: true,
        })
    }

    fn cancel_job(&mut self, job_id: &str) -> Result<(), CoreError> {
        self.ensure_alive()?;
        self.state
            .lock()
            .expect("fake worker state poisoned")
            .cancelled_jobs
            .push(job_id.to_string());
        Ok(())
    }

    fn poll_events(&mut self, job_id: &str, cursor: u64) -> Result<Vec<WorkerEvent>, CoreError> {
        self.ensure_alive()?;
        let events: Vec<WorkerEvent> = self
            .script
            .events
            .iter()
            .filter(|event| event.job_id == job_id && event.sequence > cursor)
            .cloned()
            .collect();
        if self.script.redeliver_last_event && cursor > 0 {
            if let Some(last) = events.last() {
                let mut redelivered = events.clone();
                let mut duplicate = last.clone();
                duplicate.payload = Value::String("re-delivered".into());
                redelivered.push(duplicate);
                return Ok(redelivered);
            }
        }
        Ok(events)
    }

    fn shutdown(&mut self) -> Result<(), CoreError> {
        let mut state = self.state.lock().expect("fake worker state poisoned");
        self.kill_self(&mut state);
        state.shut_down = true;
        Ok(())
    }

    fn is_alive(&self) -> bool {
        self.state
            .lock()
            .expect("fake worker state poisoned")
            .alive_instance
            == Some(self.instance_id)
    }
}

/// Deterministic clock: returns `value` and only advances via `advance_ms`.
#[derive(Debug, Clone, Default)]
pub struct FakeClock {
    value: Arc<Mutex<u64>>,
}

impl FakeClock {
    pub fn advance_ms(&self, ms: u64) {
        *self.value.lock().expect("clock poisoned") += ms;
    }
}

impl crate::worker::Clock for FakeClock {
    fn now_ms(&self) -> u64 {
        *self.value.lock().expect("clock poisoned")
    }
}

/// Deterministic sleeper: records requested sleeps instead of sleeping.
#[derive(Debug, Clone, Default)]
pub struct FakeSleeper {
    sleeps: Arc<Mutex<Vec<u64>>>,
}

impl FakeSleeper {
    pub fn sleeps(&self) -> Vec<u64> {
        self.sleeps.lock().expect("sleeper poisoned").clone()
    }
}

impl crate::worker::Sleeper for FakeSleeper {
    fn sleep_ms(&mut self, ms: u64) {
        self.sleeps.lock().expect("sleeper poisoned").push(ms);
    }
}
