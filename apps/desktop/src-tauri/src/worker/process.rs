//! Process launcher for the Python research worker (`morpho_worker.serve`).
//!
//! Contract role (docs/PRD.md §8, docs/api/WORKER_PROTOCOL.md): the Rust core
//! owns worker process lifecycle. One [`WorkerProcess`] is started per
//! transport instance on loopback only, configured exclusively through
//! process environment variables (never inside job payloads):
//!
//! * `MORPHO_WORKER_HOST=127.0.0.1`
//! * `MORPHO_WORKER_PORT=<ephemeral>` (picked by binding a listener and
//!   dropping it before launch)
//! * `MORPHO_WORKER_SESSION_TOKEN=<the supervisor's ephemeral token>`
//!
//! The child's stderr is drained into the app log (piped, so a chatty worker
//! can never deadlock on a full pipe), and the child is killed when the
//! handle is dropped or explicitly shut down. No TLS and no non-loopback
//! binding: the worker is private to this core.

use crate::error::{CoreError, ErrorCode};
use crate::secrets::WorkerConfig;
use std::io::{BufRead, BufReader};
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4, TcpListener, TcpStream};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

/// Environment variable naming the loopback interface the worker binds.
pub const WORKER_HOST_ENV: &str = "MORPHO_WORKER_HOST";
/// Environment variable carrying the ephemeral port picked by this core.
pub const WORKER_PORT_ENV: &str = "MORPHO_WORKER_PORT";
/// Environment variable carrying the per-spawn ephemeral session token.
pub const WORKER_TOKEN_ENV: &str = "MORPHO_WORKER_SESSION_TOKEN";

/// How long [`WorkerProcess::start`] waits for the worker to accept TCP
/// connections before giving up (the Python interpreter needs a moment).
const READINESS_TIMEOUT: Duration = Duration::from_secs(15);
const READINESS_POLL: Duration = Duration::from_millis(100);

/// Picks a free loopback port by binding an ephemeral listener and dropping
/// it. The bind-then-drop race is accepted by the contract: the worker must
/// retry or fail loudly if the port vanished (it never happens with an
/// immediate rebind on the same stack).
pub fn pick_free_port() -> Result<u16, CoreError> {
    let listener = TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, 0))
        .map_err(|err| spawn_error(format!("binding an ephemeral port failed: {err}")))?;
    let port = listener
        .local_addr()
        .map_err(|err| spawn_error(format!("querying the ephemeral port failed: {err}")))?
        .port();
    drop(listener);
    Ok(port)
}

/// A supervised child process running the worker serve module. Killing the
/// child on drop guarantees no orphaned worker outlives its transport. The
/// child sits behind a `Mutex` because `Child::try_wait` needs `&mut self`
/// while the transport's liveness probe only holds `&self`.
pub struct WorkerProcess {
    child: std::sync::Mutex<Child>,
    port: u16,
    token: String,
}

/// Debug output deliberately hides the session token.
impl std::fmt::Debug for WorkerProcess {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let alive = self.is_alive();
        write!(
            f,
            "WorkerProcess {{ port: {}, alive: {alive}, token: [hidden] }}",
            self.port
        )
    }
}

impl WorkerProcess {
    /// Launches the worker with the env-var contract above and waits until
    /// it accepts loopback TCP connections. `extra_env` carries additional
    /// `MORPHO_*` variables (review F: the desktop's provider configuration
    /// and resolved key values, resolved fresh at spawn time); names outside
    /// the `MORPHO_` namespace are rejected so the transport can never
    /// smuggle arbitrary process environment. On any failure the child is
    /// killed and a retryable `WORKER_NOT_AVAILABLE` error is returned (the
    /// supervisor's restart policy decides what happens next).
    pub fn start(
        config: &WorkerConfig,
        token: &str,
        extra_env: &[(String, String)],
    ) -> Result<Self, CoreError> {
        for (name, _) in extra_env {
            if !name.starts_with("MORPHO_") {
                return Err(spawn_error(format!(
                    "refusing to pass non-morpho environment variable '{name}' to the worker"
                )));
            }
        }
        let port = pick_free_port()?;
        let mut command = Command::new(&config.python_executable);
        command
            .args(&config.module_args)
            .env(WORKER_HOST_ENV, "127.0.0.1")
            .env(WORKER_PORT_ENV, port.to_string())
            .env(WORKER_TOKEN_ENV, token)
            .envs(extra_env.iter().cloned())
            .stdout(Stdio::null())
            .stderr(Stdio::piped());
        // Never flash a console window next to the app window on Windows.
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = command
            .spawn()
            .map_err(|err| spawn_error(format!("spawning the worker failed: {err}")))?;
        // Drain stderr into the log from a daemon thread so the pipe can
        // never fill up and block the child.
        if let Some(stderr) = child.stderr.take() {
            std::thread::spawn(move || {
                for line in BufReader::new(stderr).lines() {
                    match line {
                        Ok(line) => eprintln!("[morpho-worker] {line}"),
                        Err(_) => break,
                    }
                }
            });
        }

        let process = Self {
            child: std::sync::Mutex::new(child),
            port,
            token: token.to_string(),
        };
        process.wait_until_listening()?;
        Ok(process)
    }

    /// The loopback port the worker was launched on.
    pub fn port(&self) -> u16 {
        self.port
    }

    /// The session token handed to this worker instance (already supplied
    /// through the environment; kept for diagnostics, never logged).
    #[allow(dead_code)]
    pub fn token(&self) -> &str {
        &self.token
    }

    /// True while the child has not exited.
    pub fn is_alive(&self) -> bool {
        let mut child = self.child.lock().expect("worker child handle poisoned");
        matches!(child.try_wait(), Ok(None))
    }

    /// Kills the child and reaps it. Idempotent.
    pub fn kill(&self) {
        let mut child = self.child.lock().expect("worker child handle poisoned");
        let _ = child.kill();
        let _ = child.wait();
    }

    fn wait_until_listening(&self) -> Result<(), CoreError> {
        let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, self.port));
        let deadline = Instant::now() + READINESS_TIMEOUT;
        while Instant::now() < deadline {
            if !self.is_alive() {
                return Err(spawn_error(
                    "the worker process exited before it started listening",
                ));
            }
            if TcpStream::connect_timeout(&addr, READINESS_POLL).is_ok() {
                return Ok(());
            }
            std::thread::sleep(READINESS_POLL);
        }
        Err(spawn_error(format!(
            "the worker did not start listening on 127.0.0.1:{} within {}s",
            self.port,
            READINESS_TIMEOUT.as_secs()
        )))
    }
}

impl Drop for WorkerProcess {
    fn drop(&mut self) {
        self.kill();
    }
}

/// A retryable `WORKER_NOT_AVAILABLE`: launch failures are transient from
/// the supervisor's point of view (it may succeed on the next attempt).
/// The user message is actionable (audit A4): the common cause is a missing
/// Python/worker runtime on a clean install.
fn spawn_error(detail: impl Into<String>) -> CoreError {
    CoreError::new(
        ErrorCode::WorkerNotAvailable,
        "The research worker could not be started. Check that Python and the \
         morpho_worker package are installed (worker.transport in the app \
         config selects the runtime), then start the run again.",
        format!("worker launch failed: {}", detail.into()),
        true,
    )
}

#[cfg(test)]
// Tests deliberately tweak a Default-constructed launch config.
#[allow(clippy::field_reassign_with_default)]
mod tests {
    use super::*;

    #[test]
    fn free_ports_are_bindable_immediately_after_pick() {
        // The contract of pick_free_port: the returned port can be rebound
        // by the worker right away.
        for _ in 0..8 {
            let port = pick_free_port().unwrap();
            assert!(port > 0);
            assert!(TcpListener::bind(SocketAddrV4::new(Ipv4Addr::LOCALHOST, port)).is_ok());
        }
    }

    #[test]
    fn missing_executable_is_a_retryable_structured_error() {
        // Hermetic failure path: no real python is ever spawned in tests.
        let mut config = WorkerConfig::default();
        config.python_executable = "morpho-definitely-missing-binary-42".into();
        let err = WorkerProcess::start(&config, "token-not-a-secret", &[]).unwrap_err();
        assert_eq!(err.code, ErrorCode::WorkerNotAvailable);
        assert!(err.retryable, "launch failures are transient");
        assert!(err.developer_detail.contains("spawning the worker failed"));
    }

    #[test]
    fn non_morpho_extra_env_is_rejected_before_spawning() {
        let mut config = WorkerConfig::default();
        config.python_executable = "morpho-definitely-missing-binary-42".into();
        let err = WorkerProcess::start(
            &config,
            "token-not-a-secret",
            &[("PATH_OVERRIDE".to_string(), "x".to_string())],
        )
        .unwrap_err();
        assert_eq!(err.code, ErrorCode::WorkerNotAvailable);
        assert!(err
            .developer_detail
            .contains("non-morpho environment variable"));
    }

    #[test]
    fn env_var_names_follow_the_serve_contract() {
        assert_eq!(WORKER_HOST_ENV, "MORPHO_WORKER_HOST");
        assert_eq!(WORKER_PORT_ENV, "MORPHO_WORKER_PORT");
        assert_eq!(WORKER_TOKEN_ENV, "MORPHO_WORKER_SESSION_TOKEN");
    }
}
