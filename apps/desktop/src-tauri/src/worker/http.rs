//! HTTP [`WorkerTransport`] speaking the Python worker's loopback protocol.
//!
//! Contract role: mirrors the wire format implemented by
//! `apps/research-worker/src/morpho_worker/{transport,jobs,events,version}.py`
//! exactly — request framing (`Authorization: Bearer <session-token>`,
//! `POST /jobs` envelope `{schema_version, kind, config, approve_plan}`),
//! response bodies (content-length, chunked, and connection-close framing),
//! the `GET /jobs/{id}/events` SSE stream (`id:`/`event:`/`data:`/comment
//! lines, `Last-Event-ID` reconnect cursor), and the structured error
//! envelope (`packages/schemas/worker-error.v1.json`) mapped onto
//! [`CoreError`](crate::error::CoreError).
//!
//! Everything is hand-rolled over `std::net::TcpStream`: no TLS and no
//! non-loopback addresses, because the worker is a private child process
//! (see [`crate::worker::process`]). Event field names are parsed tolerantly:
//! the canonical `type`/`sequence` names from the frozen event contracts are
//! preferred, legacy `event_type`/`kind`/`seq` spellings are accepted.

use crate::error::{CoreError, CorrelationId, ErrorCode};
use crate::secrets::WorkerConfig;
use crate::worker::process::WorkerProcess;
use crate::worker::{
    HealthInfo, JobAck, JobRequest, WorkerEvent, WorkerTransport, WorkerVersionInfo,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{ErrorKind, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::time::{Duration, Instant};

/// `schema_version` of the worker's job/health/error envelopes on the wire.
const WIRE_SCHEMA_VERSION: &str = "1";

const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const READ_TIMEOUT: Duration = Duration::from_secs(30);
const SSE_IDLE_TIMEOUT: Duration = Duration::from_millis(300);
/// Upper bound for one SSE poll: backlog replay is immediate, live streams
/// end with a sentinel comment and EOF, so this only guards runaway servers.
const SSE_BUDGET: Duration = Duration::from_secs(5);
/// Refuse to buffer more than this many SSE bytes per poll.
const SSE_MAX_BYTES: usize = 16 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Error mapping (task: worker error envelope codes -> CoreError)
// ---------------------------------------------------------------------------

/// Wire shape of `packages/schemas/worker-error.v1.json` (tolerant parse:
/// missing optional members default, unknown members are ignored).
#[derive(Debug, Deserialize)]
struct ErrorEnvelopeWire {
    error: ErrorDetailWire,
}

#[derive(Debug, Deserialize)]
struct ErrorDetailWire {
    code: String,
    #[serde(default)]
    user_message: String,
    #[serde(default)]
    developer_detail: String,
    #[serde(default)]
    retryable: bool,
    #[serde(default)]
    correlation_id: String,
    #[serde(default)]
    cause: Option<String>,
}

/// The 1:1 domain code mapping; `WORKER_NOT_AVAILABLE` (the transport guard
/// code) maps onto the same-named core code. Everything else is unknown.
fn error_code_from_wire(code: &str) -> Option<ErrorCode> {
    match code {
        "WORKER_NOT_AVAILABLE" => Some(ErrorCode::WorkerNotAvailable),
        "PROVIDER_AUTH_FAILED" => Some(ErrorCode::ProviderAuthFailed),
        "PROVIDER_TIMEOUT" => Some(ErrorCode::ProviderTimeout),
        "SEARCH_FAILED" => Some(ErrorCode::SearchFailed),
        "SOURCE_PARSE_FAILED" => Some(ErrorCode::SourceParseFailed),
        "LLM_INVALID_JSON" => Some(ErrorCode::LlmInvalidJson),
        "TASK_DEPENDENCY_FAILED" => Some(ErrorCode::TaskDependencyFailed),
        "VAULT_WRITE_FAILED" => Some(ErrorCode::VaultWriteFailed),
        "DATABASE_ERROR" => Some(ErrorCode::DatabaseError),
        _ => None,
    }
}

/// Maps a non-2xx worker response body onto a [`CoreError``.
///
/// Known envelope codes map 1:1 (keeping the worker's retryable flag); every
/// unknown code becomes a generic non-retryable `WORKER_NOT_AVAILABLE` that
/// preserves the worker's developer detail and correlation id. A body that
/// is not a parseable envelope is itself reported as a protocol failure.
pub fn map_worker_error(status: u16, body: &[u8]) -> CoreError {
    let parsed: Option<ErrorEnvelopeWire> = serde_json::from_slice(body).ok();
    let Some(envelope) = parsed else {
        return CoreError::new(
            ErrorCode::WorkerNotAvailable,
            "The research worker is not available.",
            format!(
                "worker returned HTTP {status} with a body that is not a \
                 worker-error.v1 envelope"
            ),
            false,
        );
    };
    let detail = envelope.error;
    let known = error_code_from_wire(&detail.code);
    let (code, user_message, developer_detail, retryable) = match known {
        Some(code) => {
            let user = if detail.user_message.is_empty() {
                "The research worker reported an error.".to_string()
            } else {
                detail.user_message.clone()
            };
            (
                code,
                user,
                format!(
                    "worker reported {} (HTTP {status}): {}",
                    detail.code, detail.developer_detail
                ),
                detail.retryable,
            )
        }
        None => (
            ErrorCode::WorkerNotAvailable,
            "The research worker reported an unrecognized error.".to_string(),
            format!(
                "unknown worker error code '{}' (HTTP {status}): {}",
                detail.code, detail.developer_detail
            ),
            false,
        ),
    };
    let mut error = CoreError::new(code, user_message, developer_detail, retryable);
    error.correlation_id = CorrelationId::from_existing(detail.correlation_id);
    if let Some(cause) = detail.cause {
        error = error.with_cause(cause);
    }
    error
}

// ---------------------------------------------------------------------------
// Minimal HTTP/1.1 client over TcpStream
// ---------------------------------------------------------------------------

/// A parsed HTTP response head (status + headers); bodies are read
/// separately by framing because the SSE path streams them.
#[derive(Debug)]
struct HttpResponse {
    status: u16,
    headers: Vec<(String, String)>,
}

impl HttpResponse {
    fn header(&self, name: &str) -> Option<&str> {
        let lowered = name.to_ascii_lowercase();
        self.headers
            .iter()
            .find(|(key, _)| *key == lowered)
            .map(|(_, value)| value.as_str())
    }

    fn is_chunked(&self) -> bool {
        self.header("transfer-encoding")
            .map(|value| value.to_ascii_lowercase().contains("chunked"))
            .unwrap_or(false)
    }
}

/// Buffered reader over the response stream. `fill` pulls more bytes;
/// helpers extract lines and exact byte counts without blocking twice.
struct ByteReader {
    stream: TcpStream,
    buf: Vec<u8>,
    pos: usize,
}

impl ByteReader {
    fn new(stream: TcpStream) -> Self {
        Self {
            stream,
            buf: Vec::new(),
            pos: 0,
        }
    }

    fn set_read_timeout(&self, timeout: Duration) -> Result<(), CoreError> {
        self.stream
            .set_read_timeout(Some(timeout))
            .map_err(transport_io_error)
    }

    /// Reads more bytes into the buffer; `Ok(0)` means EOF.
    fn fill(&mut self) -> Result<usize, CoreError> {
        if self.pos > 0 && self.pos >= self.buf.len() {
            self.buf.clear();
            self.pos = 0;
        }
        let mut chunk = [0_u8; 8192];
        let read = self.stream.read(&mut chunk).map_err(transport_io_error)?;
        self.buf.extend_from_slice(&chunk[..read]);
        Ok(read)
    }

    fn buffered(&self) -> &[u8] {
        &self.buf[self.pos..]
    }

    /// Reads one CRLF/LF-terminated line; `Ok(None)` on EOF before any byte.
    fn read_line(&mut self) -> Result<Option<String>, CoreError> {
        loop {
            let newline = self.buffered().iter().position(|&b| b == b'\n');
            if let Some(index) = newline {
                let mut line = self.buf[self.pos..self.pos + index].to_vec();
                self.pos += index + 1;
                if line.last() == Some(&b'\r') {
                    line.pop();
                }
                return Ok(Some(String::from_utf8_lossy(&line).into_owned()));
            }
            if self.fill()? == 0 {
                if self.buffered().is_empty() {
                    return Ok(None);
                }
                let rest = self.buffered().to_vec();
                self.pos = self.buf.len();
                return Ok(Some(String::from_utf8_lossy(&rest).into_owned()));
            }
        }
    }

    fn read_exact_bytes(&mut self, count: usize) -> Result<Vec<u8>, CoreError> {
        while self.buffered().len() < count {
            if self.fill()? == 0 {
                return Err(transport_io_error(std::io::Error::new(
                    ErrorKind::UnexpectedEof,
                    "worker closed the connection mid-body",
                )));
            }
        }
        let out = self.buffered()[..count].to_vec();
        self.pos += count;
        Ok(out)
    }

    fn read_to_eof(&mut self) -> Result<Vec<u8>, CoreError> {
        while self.fill()? != 0 {
            if self.buf.len() > SSE_MAX_BYTES {
                break;
            }
        }
        let out = self.buffered().to_vec();
        self.pos = self.buf.len();
        Ok(out)
    }
}

/// Reads the status line and headers; the body is NOT consumed.
fn read_response_head(reader: &mut ByteReader) -> Result<HttpResponse, CoreError> {
    let status_line = reader
        .read_line()?
        .ok_or_else(|| malformed_response("the worker closed the connection before responding"))?;
    let mut parts = status_line.splitn(3, ' ');
    let version = parts.next().unwrap_or_default();
    if !version.starts_with("HTTP/") {
        return Err(malformed_response(format!(
            "unparseable status line: {status_line:?}"
        )));
    }
    let status: u16 = parts
        .next()
        .and_then(|code| code.parse().ok())
        .ok_or_else(|| malformed_response(format!("no status code in: {status_line:?}")))?;

    let mut headers = Vec::new();
    loop {
        let line = reader
            .read_line()?
            .ok_or_else(|| malformed_response("the worker closed the connection mid-headers"))?;
        if line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            headers.push((name.trim().to_ascii_lowercase(), value.trim().to_string()));
        }
    }
    Ok(HttpResponse { status, headers })
}

/// Reads the response body according to the head's framing: content-length,
/// chunked transfer, or connection-close (read until EOF).
fn read_response_body(reader: &mut ByteReader, head: &HttpResponse) -> Result<Vec<u8>, CoreError> {
    if head.is_chunked() {
        read_chunked_body(reader)
    } else if let Some(length) = head
        .header("content-length")
        .and_then(|value| value.parse::<usize>().ok())
    {
        reader.read_exact_bytes(length)
    } else {
        reader.read_to_eof()
    }
}

fn read_chunked_body(reader: &mut ByteReader) -> Result<Vec<u8>, CoreError> {
    let mut body = Vec::new();
    loop {
        let size_line = reader
            .read_line()?
            .ok_or_else(|| malformed_response("chunked body ended before its terminator"))?;
        let size_hex = size_line.split(';').next().unwrap_or("").trim();
        let size = usize::from_str_radix(size_hex, 16)
            .map_err(|_| malformed_response(format!("invalid chunk size {size_hex:?}")))?;
        if size == 0 {
            // Optional trailers, then the blank line ending the body. EOF is
            // tolerated because workers may close immediately after "0".
            while let Some(line) = reader.read_line()? {
                if line.is_empty() {
                    break;
                }
            }
            break;
        }
        body.extend_from_slice(&reader.read_exact_bytes(size)?);
        let _separator = reader.read_exact_bytes(2)?; // CRLF after each chunk
    }
    Ok(body)
}

fn build_request(
    port: u16,
    method: &str,
    path: &str,
    token: &str,
    accept: &str,
    body: Option<&str>,
) -> String {
    let mut request = format!(
        "{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAccept: {accept}\r\n\
         Connection: close\r\n"
    );
    if !token.is_empty() {
        request.push_str(&format!("Authorization: Bearer {token}\r\n"));
    }
    if let Some(body) = body {
        request.push_str("Content-Type: application/json\r\n");
        request.push_str(&format!("Content-Length: {}\r\n", body.len()));
    }
    request.push_str("\r\n");
    if let Some(body) = body {
        request.push_str(body);
    }
    request
}

/// Connection-level failures are transient from the supervisor's point of
/// view (it retries with backoff); protocol garbage is not.
fn transport_io_error(err: std::io::Error) -> CoreError {
    let retryable = matches!(
        err.kind(),
        ErrorKind::ConnectionRefused
            | ErrorKind::ConnectionReset
            | ErrorKind::ConnectionAborted
            | ErrorKind::BrokenPipe
            | ErrorKind::WouldBlock
            | ErrorKind::TimedOut
            | ErrorKind::UnexpectedEof
            | ErrorKind::Interrupted
    );
    CoreError::new(
        ErrorCode::WorkerNotAvailable,
        "The research worker is not available.",
        format!("worker connection failed: {err}"),
        retryable,
    )
}

fn malformed_response(detail: impl std::fmt::Display) -> CoreError {
    CoreError::new(
        ErrorCode::WorkerNotAvailable,
        "The research worker is not available.",
        format!("malformed worker response: {detail}"),
        false,
    )
}

fn malformed_json(context: &str, status: u16, err: serde_json::Error) -> CoreError {
    CoreError::new(
        ErrorCode::WorkerNotAvailable,
        "The research worker is not available.",
        format!(
            "worker {context} returned HTTP {status} with a body that is not valid JSON: {err}"
        ),
        false,
    )
}

// ---------------------------------------------------------------------------
// SSE decoding
// ---------------------------------------------------------------------------

/// One decoded SSE frame (comment lines dropped, multi-line data joined).
#[derive(Debug, Clone, PartialEq)]
struct SseFrame {
    id: Option<String>,
    event: Option<String>,
    data: String,
}

/// Decodes complete SSE frames from a byte buffer. Frames end at a blank
/// line; an unterminated trailing frame (truncated stream) is still emitted
/// so a budget-limited poll does not lose already-received events.
fn decode_sse(bytes: &[u8]) -> Vec<SseFrame> {
    let text = String::from_utf8_lossy(bytes);
    let mut frames = Vec::new();
    let mut id: Option<String> = None;
    let mut event: Option<String> = None;
    let mut data_lines: Vec<String> = Vec::new();

    let flush = |frames: &mut Vec<SseFrame>,
                 id: &mut Option<String>,
                 event: &mut Option<String>,
                 data_lines: &mut Vec<String>| {
        if !data_lines.is_empty() {
            frames.push(SseFrame {
                id: id.take(),
                event: event.take(),
                data: data_lines.join("\n"),
            });
        }
        *id = None;
        *event = None;
        data_lines.clear();
    };

    for raw_line in text.split('\n') {
        let line = raw_line.strip_suffix('\r').unwrap_or(raw_line);
        if line.is_empty() {
            flush(&mut frames, &mut id, &mut event, &mut data_lines);
            continue;
        }
        if let Some(value) = line.strip_prefix("data:") {
            data_lines.push(value.strip_prefix(' ').unwrap_or(value).to_string());
        } else if let Some(value) = line.strip_prefix("id:") {
            id = Some(value.strip_prefix(' ').unwrap_or(value).to_string());
        } else if let Some(value) = line.strip_prefix("event:") {
            event = Some(value.strip_prefix(' ').unwrap_or(value).to_string());
        }
        // Comments (`: ...`), `retry:`, and unknown fields are ignored.
    }
    flush(&mut frames, &mut id, &mut event, &mut data_lines);
    frames
}

/// Extracts the payload bytes from a (possibly truncated) chunked buffer,
/// keeping only complete chunks.
fn decode_complete_chunks(raw: &[u8]) -> Vec<u8> {
    let mut payload = Vec::new();
    let mut offset = 0_usize;
    while let Some(newline) = raw[offset..].iter().position(|&b| b == b'\n') {
        let size_line_end = offset + newline;
        let mut line_end = size_line_end;
        if line_end > offset && raw[line_end - 1] == b'\r' {
            line_end -= 1;
        }
        let size_line = String::from_utf8_lossy(&raw[offset..line_end]).into_owned();
        let size_hex = size_line.split(';').next().unwrap_or("").trim();
        let Ok(size) = usize::from_str_radix(size_hex, 16) else {
            break; // malformed or truncated header: keep what we have
        };
        let data_start = size_line_end + 1;
        let data_end = data_start + size;
        if size == 0 {
            break; // terminator chunk reached
        }
        if data_end + 2 > raw.len() {
            break; // truncated chunk: ignore the tail
        }
        payload.extend_from_slice(&raw[data_start..data_end]);
        offset = data_end + 2; // skip the trailing CRLF
    }
    payload
}

/// Converts one SSE frame into a [`WorkerEvent`]. Canonical field names win;
/// legacy spellings are tolerated. Frames with no derivable sequence cannot
/// be ordered and are skipped (`Ok(None)`); frames whose `data` is not valid
/// JSON are protocol failures (`Err`).
fn worker_event_from_frame(
    requested_job_id: &str,
    frame: SseFrame,
) -> Result<Option<WorkerEvent>, CoreError> {
    let data: Value = serde_json::from_str(&frame.data)
        .map_err(|err| malformed_response(format!("SSE data line is not valid JSON: {err}")))?;
    let sequence = data
        .get("sequence")
        .and_then(Value::as_u64)
        .or_else(|| data.get("seq").and_then(Value::as_u64))
        .or_else(|| frame.id.as_deref().and_then(|id| id.parse().ok()));
    let Some(sequence) = sequence else {
        return Ok(None);
    };
    let event_type = ["type", "event_type", "kind"]
        .iter()
        .find_map(|key| data.get(*key).and_then(Value::as_str))
        .map(str::to_string)
        .or_else(|| frame.event.clone())
        .unwrap_or_else(|| "unknown".to_string());
    let job_id = data
        .get("job_id")
        .and_then(Value::as_str)
        .unwrap_or(requested_job_id)
        .to_string();
    let mut payload = match data.get("payload") {
        Some(value) if value.is_object() => value.clone(),
        _ => Value::Object(serde_json::Map::new()),
    };
    // Fold the canonical envelope fields into the payload so persistence
    // (events repository) keeps event_id/run_id/project_id/occurred_at —
    // WorkerEvent itself only models job/sequence/type/payload.
    if let Value::Object(map) = &mut payload {
        for key in ["event_id", "run_id", "project_id", "occurred_at", "task_id"] {
            if let Some(value) = data.get(key) {
                map.entry(key.to_string()).or_insert_with(|| value.clone());
            }
        }
    }
    Ok(Some(WorkerEvent {
        job_id,
        sequence,
        event_type,
        payload,
    }))
}

// ---------------------------------------------------------------------------
// The transport
// ---------------------------------------------------------------------------

/// Wire adapters for the endpoints we parse structurally.
#[derive(Debug, Deserialize)]
struct HealthWire {
    status: String,
    protocol_version: String,
}

#[derive(Debug, Deserialize)]
struct VersionWire {
    worker_version: String,
    protocol_version: String,
    #[serde(default)]
    accepted_protocol_versions: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct JobResponseWire {
    job: JobWire,
}

#[derive(Debug, Deserialize)]
struct JobWire {
    job_id: String,
}

/// (major, minor, patch) key for ordering protocol versions; unparsable
/// strings sort last.
fn version_key(text: &str) -> (u64, u64, u64) {
    let mut parts = text.split('.');
    let next = |parts: &mut std::str::Split<'_, char>| {
        parts.next().and_then(|part| part.parse().ok()).unwrap_or(0)
    };
    let major = next(&mut parts);
    let minor = next(&mut parts);
    let patch = next(&mut parts);
    (major, minor, patch)
}

/// [`WorkerTransport`](crate::worker::WorkerTransport) over loopback
/// HTTP/1.1 against the Python worker.
///
/// Two modes:
/// * *launching* ([`HttpWorkerTransport::launching`]): `spawn` starts the
///   worker process (see [`crate::worker::process`]) and the transport talks
///   to it; this is the production mode selected by
///   `worker.transport = "http"`.
/// * *connect-only* ([`HttpWorkerTransport::connect`]): talks to an
///   already-listening worker on the given port; used by the transport tests
///   (the in-test server) — never spawns processes.
pub struct HttpWorkerTransport {
    port: u16,
    token: String,
    launcher: Option<WorkerConfig>,
    process: Option<WorkerProcess>,
    alive: bool,
}

impl HttpWorkerTransport {
    /// Connect-only transport for an already-listening loopback worker.
    pub fn connect(port: u16) -> Self {
        Self {
            port,
            token: String::new(),
            launcher: None,
            process: None,
            alive: false,
        }
    }

    /// Launching transport: `spawn` starts the process described by `config`
    /// (python executable + module args) with the env-var contract from
    /// [`crate::worker::process`].
    pub fn launching(config: WorkerConfig) -> Self {
        Self {
            port: 0,
            token: String::new(),
            launcher: Some(config),
            process: None,
            alive: false,
        }
    }

    fn addr(&self) -> SocketAddr {
        SocketAddr::from((Ipv4Addr::LOCALHOST, self.port))
    }

    fn open(&self) -> Result<ByteReader, CoreError> {
        let stream = TcpStream::connect_timeout(&self.addr(), CONNECT_TIMEOUT)
            .map_err(transport_io_error)?;
        stream
            .set_write_timeout(Some(CONNECT_TIMEOUT))
            .map_err(transport_io_error)?;
        let reader = ByteReader::new(stream);
        reader.set_read_timeout(READ_TIMEOUT)?;
        Ok(reader)
    }

    /// Sends one JSON request and returns the parsed JSON on 2xx; non-2xx
    /// bodies go through [`map_worker_error`].
    fn request_json(
        &self,
        method: &str,
        path: &str,
        body: Option<&Value>,
    ) -> Result<Value, CoreError> {
        let payload = body.map(|value| value.to_string());
        let request = build_request(
            self.port,
            method,
            path,
            &self.token,
            "application/json",
            payload.as_deref(),
        );
        let mut reader = self.open()?;
        reader
            .stream
            .write_all(request.as_bytes())
            .map_err(transport_io_error)?;
        let head = read_response_head(&mut reader)?;
        let body = read_response_body(&mut reader, &head)?;
        if (200..300).contains(&head.status) {
            serde_json::from_slice(&body)
                .map_err(|err| malformed_json(&format!("{method} {path}"), head.status, err))
        } else {
            Err(map_worker_error(head.status, &body))
        }
    }

    /// Opens the SSE event stream for a job and returns the events decoded
    /// until EOF, an idle gap, or the poll budget elapses. The stream bytes
    /// accumulate in the reader's buffer (nothing consumes them mid-stream),
    /// are de-chunked if the server chose chunked framing, then decoded as
    /// SSE frames.
    fn request_event_stream(
        &self,
        job_id: &str,
        cursor: u64,
    ) -> Result<Vec<WorkerEvent>, CoreError> {
        let path = format!("/jobs/{job_id}/events?after_sequence={cursor}");
        let mut request = build_request(
            self.port,
            "GET",
            &path,
            &self.token,
            "text/event-stream",
            None,
        );
        if cursor > 0 {
            // Insert the reconnect cursor right before the final blank line.
            let insert_at = request.len() - 2;
            request.insert_str(insert_at, &format!("Last-Event-ID: {cursor}\r\n"));
        }
        let mut reader = self.open()?;
        reader
            .stream
            .write_all(request.as_bytes())
            .map_err(transport_io_error)?;
        let head = read_response_head(&mut reader)?;
        if head.status != 200 {
            let body = read_response_body(&mut reader, &head)?;
            return Err(map_worker_error(head.status, &body));
        }
        let chunked = head.is_chunked();
        reader.set_read_timeout(SSE_IDLE_TIMEOUT)?;

        let deadline = Instant::now() + SSE_BUDGET;
        loop {
            if Instant::now() >= deadline {
                break;
            }
            match reader.fill() {
                Ok(0) => break, // stream ended (sentinel comment + clean EOF)
                Ok(_) => {
                    if reader.buffered().len() > SSE_MAX_BYTES {
                        break;
                    }
                }
                // Idle timeout (no new bytes within SSE_IDLE_TIMEOUT) or a
                // dropped connection: deliver the frames already received.
                Err(_) => break,
            }
        }
        let raw = reader.buffered().to_vec();
        let payload = if chunked {
            decode_complete_chunks(&raw)
        } else {
            raw
        };
        decode_sse(&payload)
            .into_iter()
            .filter_map(|frame| worker_event_from_frame(job_id, frame).transpose())
            .collect()
    }
}

impl WorkerTransport for HttpWorkerTransport {
    fn spawn(&mut self, token: &str) -> Result<(), CoreError> {
        self.token = token.to_string();
        if let Some(config) = self.launcher.clone() {
            let process = WorkerProcess::start(&config, token)?;
            self.port = process.port();
            self.process = Some(process);
        }
        self.alive = true;
        Ok(())
    }

    fn health(&mut self) -> Result<HealthInfo, CoreError> {
        let value = self.request_json("GET", "/health", None)?;
        let wire: HealthWire =
            serde_json::from_value(value).map_err(|err| malformed_json("GET /health", 200, err))?;
        Ok(HealthInfo {
            status: wire.status,
            protocol_version: wire.protocol_version,
        })
    }

    fn version(&mut self) -> Result<WorkerVersionInfo, CoreError> {
        let value = self.request_json("GET", "/version", None)?;
        let wire: VersionWire = serde_json::from_value(value)
            .map_err(|err| malformed_json("GET /version", 200, err))?;
        let (protocol_min, protocol_max) = if wire.accepted_protocol_versions.is_empty() {
            (wire.protocol_version.clone(), wire.protocol_version)
        } else {
            let mut accepted = wire.accepted_protocol_versions.clone();
            accepted.sort_by_key(|item| version_key(item));
            (
                accepted.first().cloned().unwrap_or_default(),
                accepted.last().cloned().unwrap_or_default(),
            )
        };
        Ok(WorkerVersionInfo {
            worker_version: wire.worker_version,
            protocol_min,
            protocol_max,
        })
    }

    fn submit_job(&mut self, request: &JobRequest) -> Result<JobAck, CoreError> {
        // Exact wire envelope the Python worker validates (unknown fields
        // are rejected): params travel as the job `config`; the approved
        // plan member (ADR-024) is included only when present so older
        // workers keep accepting self-planned jobs.
        let mut body = json!({
            "schema_version": WIRE_SCHEMA_VERSION,
            "kind": request.kind,
            "config": request.params,
            "approve_plan": request.approve_plan,
        });
        if let Some(plan) = &request.plan {
            body["plan"] = plan.clone();
        }
        let value = self.request_json("POST", "/jobs", Some(&body))?;
        let wire: JobResponseWire =
            serde_json::from_value(value).map_err(|err| malformed_json("POST /jobs", 200, err))?;
        Ok(JobAck {
            job_id: wire.job.job_id,
            accepted: true,
        })
    }

    fn job_status(&mut self, job_id: &str) -> Result<Value, CoreError> {
        self.request_json("GET", &format!("/jobs/{job_id}"), None)
    }

    fn cancel_job(&mut self, job_id: &str) -> Result<(), CoreError> {
        self.request_json("POST", &format!("/jobs/{job_id}/cancel"), None)?;
        Ok(())
    }

    fn poll_events(&mut self, job_id: &str, cursor: u64) -> Result<Vec<WorkerEvent>, CoreError> {
        self.request_event_stream(job_id, cursor)
    }

    fn fetch_job_results(&mut self, job_id: &str) -> Result<Value, CoreError> {
        self.request_json("GET", &format!("/jobs/{job_id}/results"), None)
    }

    fn shutdown(&mut self) -> Result<(), CoreError> {
        if let Some(process) = self.process.as_ref() {
            process.kill();
        }
        self.process = None;
        self.alive = false;
        Ok(())
    }

    fn is_alive(&self) -> bool {
        match &self.process {
            Some(process) => process.is_alive(),
            // Connect-only mode has no child to poll, so liveness is an
            // actual loopback TCP probe: a worker that stopped listening is
            // dead and must be restarted (or reported unavailable).
            None => {
                self.alive
                    && TcpStream::connect_timeout(&self.addr(), Duration::from_millis(500)).is_ok()
            }
        }
    }
}

#[cfg(test)]
// Scripted servers/tests deliberately tweak Default-constructed values.
#[allow(clippy::field_reassign_with_default)]
mod tests {
    use super::*;
    use crate::worker::Supervisor;
    use serde_json::json;
    use std::io::{BufRead, BufReader};
    use std::net::TcpListener;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::thread::JoinHandle;

    /// Fake session token built at runtime; no credential literal in source.
    fn fake_token() -> String {
        format!("session-{}", "t".repeat(24))
    }

    // ------------------------------------------------------------------
    // Test HTTP server (std lib only; canned worker responses)
    // ------------------------------------------------------------------

    #[derive(Debug, Clone)]
    struct RecordedRequest {
        method: String,
        path: String,
        query: String,
        authorization: Option<String>,
        accept: Option<String>,
        last_event_id: Option<String>,
        body: String,
    }

    /// Response body framing the server uses for JSON endpoints.
    #[derive(Debug, Clone, Copy, PartialEq)]
    enum Framing {
        ContentLength,
        Chunked,
        ConnectionClose,
    }

    #[derive(Debug, Clone)]
    struct ServerScript {
        token: String,
        health_framing: Framing,
        /// Raw SSE bytes served from `GET /jobs/{id}/events`.
        sse_body: String,
        sse_chunked: bool,
        /// Optional override for `POST /jobs` (status + raw body) used to
        /// inject worker error envelopes.
        job_response: Option<(u16, String)>,
    }

    impl Default for ServerScript {
        fn default() -> Self {
            Self {
                token: fake_token(),
                health_framing: Framing::ContentLength,
                sse_body: String::new(),
                sse_chunked: false,
                job_response: None,
            }
        }
    }

    struct TestWorkerServer {
        addr: SocketAddr,
        recorded: Arc<Mutex<Vec<RecordedRequest>>>,
        stop: Arc<AtomicBool>,
        handle: Option<JoinHandle<()>>,
    }

    impl TestWorkerServer {
        fn start(script: ServerScript) -> Self {
            let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
            let addr = listener.local_addr().unwrap();
            listener.set_nonblocking(true).unwrap();
            let recorded: Arc<Mutex<Vec<RecordedRequest>>> = Arc::default();
            let stop = Arc::new(AtomicBool::new(false));
            let server = Self {
                addr,
                recorded: Arc::clone(&recorded),
                stop: Arc::clone(&stop),
                handle: None,
            };
            let stop_for_thread = Arc::clone(&stop);
            let recorded_for_thread = Arc::clone(&recorded);
            let handle = std::thread::spawn(move || loop {
                if stop_for_thread.load(Ordering::SeqCst) {
                    break;
                }
                match listener.accept() {
                    Ok((stream, _)) => {
                        handle_connection(stream, &script, &recorded_for_thread);
                    }
                    Err(err) if err.kind() == ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    Err(_) => break,
                }
            });
            Self {
                handle: Some(handle),
                ..server
            }
        }

        fn recorded(&self) -> Vec<RecordedRequest> {
            self.recorded.lock().expect("recorded poisoned").clone()
        }

        fn requests_to(&self, prefix: &str) -> Vec<RecordedRequest> {
            self.recorded()
                .into_iter()
                .filter(|request| request.path == prefix)
                .collect()
        }

        fn drop_server(mut self) {
            self.stop.store(true, Ordering::SeqCst);
            if let Some(handle) = self.handle.take() {
                let _ = handle.join();
            }
        }
    }

    fn write_json_response(
        stream: &mut TcpStream,
        status: u16,
        body: &str,
        framing: Framing,
    ) -> std::io::Result<()> {
        match framing {
            Framing::ContentLength => {
                let head = format!(
                    "HTTP/1.1 {status} X\r\nContent-Type: application/json; charset=utf-8\r\n\
                     Content-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                stream.write_all(head.as_bytes())?;
                stream.write_all(body.as_bytes())?;
            }
            Framing::Chunked => {
                stream.write_all(
                    format!(
                        "HTTP/1.1 {status} X\r\nContent-Type: application/json; charset=utf-8\r\n\
                         Transfer-Encoding: chunked\r\nConnection: close\r\n\r\n"
                    )
                    .as_bytes(),
                )?;
                for chunk in body.as_bytes().chunks(7) {
                    stream.write_all(format!("{:x}\r\n", chunk.len()).as_bytes())?;
                    stream.write_all(chunk)?;
                    stream.write_all(b"\r\n")?;
                }
                stream.write_all(b"0\r\n\r\n")?;
            }
            Framing::ConnectionClose => {
                stream.write_all(
                    format!(
                        "HTTP/1.1 {status} X\r\nContent-Type: application/json; charset=utf-8\r\n\
                         Connection: close\r\n\r\n"
                    )
                    .as_bytes(),
                )?;
                stream.write_all(body.as_bytes())?;
            }
        }
        stream.flush()
    }

    fn handle_connection(
        stream: TcpStream,
        script: &ServerScript,
        recorded: &Mutex<Vec<RecordedRequest>>,
    ) {
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut writer = stream.try_clone().unwrap();
        let mut reader = BufReader::new(stream);
        let mut request_line = String::new();
        if reader.read_line(&mut request_line).unwrap_or(0) == 0 {
            return;
        }
        let mut parts = request_line.split_whitespace();
        let method = parts.next().unwrap_or_default().to_string();
        let full_path = parts.next().unwrap_or_default().to_string();
        let (path, query) = match full_path.split_once('?') {
            Some((path, query)) => (path.to_string(), query.to_string()),
            None => (full_path.clone(), String::new()),
        };
        let mut headers: Vec<(String, String)> = Vec::new();
        loop {
            let mut line = String::new();
            if reader.read_line(&mut line).unwrap_or(0) == 0 || line.trim().is_empty() {
                break;
            }
            if let Some((name, value)) = line.split_once(':') {
                headers.push((name.trim().to_ascii_lowercase(), value.trim().to_string()));
            }
        }
        let header = |name: &str| -> Option<String> {
            headers
                .iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.clone())
        };
        let mut body = String::new();
        if let Some(length) = header("content-length").and_then(|v| v.parse::<u64>().ok()) {
            let mut bytes = vec![0_u8; length as usize];
            std::io::Read::read_exact(&mut reader, &mut bytes).unwrap();
            body = String::from_utf8_lossy(&bytes).into_owned();
        }
        recorded
            .lock()
            .expect("recorded poisoned")
            .push(RecordedRequest {
                method: method.clone(),
                path: path.clone(),
                query,
                authorization: header("authorization"),
                accept: header("accept"),
                last_event_id: header("last-event-id"),
                body,
            });

        // Bearer-token gate exactly like the Python transport: an empty
        // script token disables auth (used by supervisor tests, which cannot
        // know the supervisor's freshly minted token).
        let expected = format!("Bearer {}", script.token);
        let authorized = script.token.is_empty()
            || header("authorization").as_deref() == Some(expected.as_str());
        if !authorized {
            let envelope = json!({
                "schema_version": "1",
                "error": {
                    "code": "UNAUTHORIZED",
                    "user_message": "The worker requires a valid session token.",
                    "developer_detail": "missing or invalid Authorization bearer token",
                    "retryable": false,
                    "correlation_id": "",
                },
            });
            let _ = write_json_response(
                &mut writer,
                401,
                &envelope.to_string(),
                Framing::ContentLength,
            );
            return;
        }

        let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        match (method.as_str(), segments.as_slice()) {
            ("GET", ["health"]) => {
                let body = json!({
                    "schema_version": "1",
                    "status": "ok",
                    "worker_version": "0.0.1",
                    "protocol_version": "1",
                })
                .to_string();
                let _ = write_json_response(&mut writer, 200, &body, script.health_framing);
            }
            ("GET", ["version"]) => {
                let body = json!({
                    "schema_version": "1",
                    "worker_version": "0.0.1",
                    "protocol_version": "1",
                    "accepted_protocol_versions": ["1"],
                })
                .to_string();
                let _ = write_json_response(&mut writer, 200, &body, Framing::ContentLength);
            }
            ("GET", ["broken-json"]) => {
                let _ = write_json_response(&mut writer, 200, "{{not json", Framing::ContentLength);
            }
            ("POST", ["jobs"]) => {
                let (status, body) = match &script.job_response {
                    Some((status, body)) => (*status, body.clone()),
                    None => (
                        201,
                        json!({
                            "schema_version": "1",
                            "job": {
                                "job_id": "wire-job-1",
                                "kind": "research_run",
                                "status": "RUNNING",
                                "protocol_version": "1",
                                "counts": {"tasks_total": 2, "tasks_pending": 2},
                            },
                        })
                        .to_string(),
                    ),
                };
                let _ = write_json_response(&mut writer, status, &body, Framing::ContentLength);
            }
            ("GET", ["jobs", "missing"]) => {
                let body = json!({
                    "schema_version": "1",
                    "error": {
                        "code": "NOT_FOUND",
                        "user_message": "The requested job does not exist.",
                        "developer_detail": "job_id=missing",
                        "retryable": false,
                        "correlation_id": "corr-404",
                    },
                })
                .to_string();
                let _ = write_json_response(&mut writer, 404, &body, Framing::ContentLength);
            }
            ("GET", ["jobs", job_id]) => {
                let body = json!({
                    "schema_version": "1",
                    "job": {
                        "job_id": job_id,
                        "kind": "research_run",
                        "status": "RUNNING",
                        "counts": {"tasks_total": 2, "tasks_running": 1},
                    },
                })
                .to_string();
                let _ = write_json_response(&mut writer, 200, &body, Framing::ContentLength);
            }
            ("POST", ["jobs", job_id, "cancel"]) => {
                let body = json!({
                    "schema_version": "1",
                    "job": {"job_id": job_id, "status": "CANCELLED"},
                })
                .to_string();
                let _ = write_json_response(&mut writer, 200, &body, Framing::ContentLength);
            }
            ("GET", ["jobs", _job_id, "events"]) => {
                let framing_head = if script.sse_chunked {
                    "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n\
                      Cache-Control: no-cache\r\nTransfer-Encoding: chunked\r\n\
                      Connection: close\r\n\r\n"
                } else {
                    "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\n\
                      Cache-Control: no-cache\r\nConnection: close\r\n\r\n"
                };
                let _ = writer.write_all(framing_head.as_bytes());
                if script.sse_chunked {
                    for chunk in script.sse_body.as_bytes().chunks(13) {
                        let _ = writer.write_all(format!("{:x}\r\n", chunk.len()).as_bytes());
                        let _ = writer.write_all(chunk);
                        let _ = writer.write_all(b"\r\n");
                    }
                    let _ = writer.write_all(b"0\r\n\r\n");
                } else {
                    let _ = writer.write_all(script.sse_body.as_bytes());
                }
                let _ = writer.flush();
            }
            _ => {
                let body = json!({
                    "schema_version": "1",
                    "error": {
                        "code": "NOT_FOUND",
                        "user_message": "The requested worker endpoint does not exist.",
                        "developer_detail": format!("{method} {path}"),
                        "retryable": false,
                        "correlation_id": "",
                    },
                })
                .to_string();
                let _ = write_json_response(&mut writer, 404, &body, Framing::ContentLength);
            }
        }
    }

    /// A transport pointed at the test server, already spawned with the
    /// server's token (mirrors the supervisor's `spawn(token)` handshake).
    fn transport_on(server: &TestWorkerServer, token: &str) -> HttpWorkerTransport {
        let mut transport = HttpWorkerTransport::connect(server.addr.port());
        transport.spawn(token).unwrap();
        transport
    }

    fn canned_sse_body() -> String {
        // Canonical names, legacy spellings, comment lines, SSE event-name
        // fallback, and the terminal sentinel — everything the decoder must
        // tolerate.
        [
            ": morpho keep-alive",
            "",
            "id: 1",
            "event: job.progress",
            r#"data: {"schema_version":"research.event.v1","event_id":"evt-1","job_id":"wire-job-1","sequence":1,"timestamp":"2026-09-12T00:00:00Z","type":"task.started","task_id":"task-9","payload":{"step":1}}"#,
            "",
            "id: 2",
            r#"data: {"event_type":"task.progress","seq":2,"payload":{"step":2}}"#,
            "",
            "id: 3",
            r#"data: {"kind":"task.completed","sequence":3,"payload":{"done":true}}"#,
            "",
            "id: 4",
            "event: job.completed",
            r#"data: {"payload":{"status":"COMPLETED"}}"#,
            "",
            ": morpho stream end (job_id=wire-job-1, status=COMPLETED)",
            "",
        ]
        .join("\n")
    }

    // ------------------------------------------------------------------
    // Transport tests
    // ------------------------------------------------------------------

    #[test]
    fn health_and_version_round_trip_with_bearer_auth() {
        let server = TestWorkerServer::start(ServerScript::default());
        let token = fake_token();
        let mut transport = transport_on(&server, &token);

        let health = transport.health().unwrap();
        assert_eq!(health.status, "ok");
        assert_eq!(health.protocol_version, "1");

        let version = transport.version().unwrap();
        assert_eq!(version.worker_version, "0.0.1");
        assert_eq!(version.protocol_min, "1");
        assert_eq!(version.protocol_max, "1");

        let recorded = server.recorded();
        assert_eq!(recorded.len(), 2);
        for request in &recorded {
            assert_eq!(
                request.authorization.as_deref(),
                Some(format!("Bearer {token}").as_str())
            );
        }
        assert!(crate::worker::protocol_compatible(
            &version.protocol_min,
            &version.protocol_max
        ));
        server.drop_server();
    }

    #[test]
    fn content_length_chunked_and_close_bodies_all_parse() {
        for framing in [
            Framing::ContentLength,
            Framing::Chunked,
            Framing::ConnectionClose,
        ] {
            let mut script = ServerScript::default();
            script.health_framing = framing;
            let server = TestWorkerServer::start(script);
            let mut transport = transport_on(&server, &fake_token());
            let health = transport.health().unwrap();
            assert_eq!(health.status, "ok", "framing {framing:?} must parse");
            server.drop_server();
        }
    }

    #[test]
    fn auth_rejection_maps_to_a_non_retryable_core_error() {
        let server = TestWorkerServer::start(ServerScript::default());
        // Wrong token: the server answers the frozen 401 envelope, which has
        // no CoreError counterpart code and must map to the generic error.
        let mut transport = transport_on(&server, &format!("wrong-{}", "x".repeat(16)));
        let err = transport.health().unwrap_err();
        assert_eq!(err.code, ErrorCode::WorkerNotAvailable);
        assert!(!err.retryable);
        assert!(err.developer_detail.contains("UNAUTHORIZED"), "{err:?}");
        server.drop_server();
    }

    #[test]
    fn submit_job_sends_the_wire_envelope_and_acks_the_worker_job_id() {
        let server = TestWorkerServer::start(ServerScript::default());
        let mut transport = transport_on(&server, &fake_token());

        let request = JobRequest {
            job_id: "core-side-id".into(),
            run_id: "run-1".into(),
            task_id: Some("task-1".into()),
            kind: "research_run".into(),
            params: json!({"domain": "AI", "topic": "LLM scaling", "depth": 3}),
            approve_plan: true,
            plan: None,
        };
        let ack = transport.submit_job(&request).unwrap();
        assert!(ack.accepted);
        assert_eq!(ack.job_id, "wire-job-1", "the worker mints the job id");

        let posted = server.requests_to("/jobs");
        assert_eq!(posted.len(), 1);
        assert_eq!(posted[0].method, "POST");
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&posted[0].body).unwrap(),
            json!({
                "schema_version": "1",
                "kind": "research_run",
                "config": {"domain": "AI", "topic": "LLM scaling", "depth": 3},
                "approve_plan": true,
            }),
            "the wire envelope must contain exactly the worker's fields"
        );
        server.drop_server();
    }

    #[test]
    fn job_status_and_cancel_hit_their_endpoints() {
        let server = TestWorkerServer::start(ServerScript::default());
        let mut transport = transport_on(&server, &fake_token());

        let status = transport.job_status("wire-job-1").unwrap();
        assert_eq!(status["job"]["job_id"], "wire-job-1");
        assert_eq!(status["job"]["status"], "RUNNING");

        transport.cancel_job("wire-job-1").unwrap();
        assert_eq!(server.requests_to("/jobs/wire-job-1/cancel").len(), 1);

        // Unknown jobs surface as the mapped 404 envelope error.
        let err = transport.job_status("missing").unwrap_err();
        assert!(!err.retryable);
        assert!(err.developer_detail.contains("NOT_FOUND"), "{err:?}");
        assert_eq!(err.correlation_id.as_str(), "corr-404");
        server.drop_server();
    }

    #[test]
    fn poll_events_parses_sse_frames_and_sends_the_reconnect_cursor() {
        let mut script = ServerScript::default();
        script.sse_body = canned_sse_body();
        let server = TestWorkerServer::start(script);
        let mut transport = transport_on(&server, &fake_token());

        let events = transport.poll_events("wire-job-1", 0).unwrap();
        let sequences: Vec<u64> = events.iter().map(|event| event.sequence).collect();
        assert_eq!(sequences, vec![1, 2, 3, 4]);
        assert_eq!(events[0].event_type, "task.started");
        assert_eq!(events[1].event_type, "task.progress", "legacy event_type");
        assert_eq!(events[2].event_type, "task.completed", "legacy kind");
        assert_eq!(
            events[3].event_type, "job.completed",
            "SSE event: line is the fallback when data has no type"
        );
        assert_eq!(events[3].sequence, 4, "id: line is the sequence fallback");
        assert_eq!(events[0].payload["step"], 1);
        // Canonical envelope fields survive into the payload for persistence.
        assert_eq!(events[0].payload["event_id"], "evt-1");
        assert_eq!(events[0].payload["task_id"], "task-9");

        let event_requests = server.requests_to("/jobs/wire-job-1/events");
        assert_eq!(event_requests.len(), 1);
        assert_eq!(
            event_requests[0].accept.as_deref(),
            Some("text/event-stream")
        );
        assert_eq!(
            event_requests[0].query, "after_sequence=0",
            "the cursor always travels as the query parameter"
        );
        assert!(
            event_requests[0].last_event_id.is_none(),
            "no Last-Event-ID header on a fresh stream"
        );

        // Reconnect with a cursor: the header must carry it verbatim.
        transport.poll_events("wire-job-1", 4).unwrap();
        let event_requests = server.requests_to("/jobs/wire-job-1/events");
        assert_eq!(event_requests.len(), 2);
        assert_eq!(event_requests[1].last_event_id.as_deref(), Some("4"));
        server.drop_server();
    }

    #[test]
    fn poll_events_reads_chunked_sse_bodies() {
        let mut script = ServerScript::default();
        script.sse_body = canned_sse_body();
        script.sse_chunked = true;
        let server = TestWorkerServer::start(script);
        let mut transport = transport_on(&server, &fake_token());

        let events = transport.poll_events("wire-job-1", 0).unwrap();
        assert_eq!(events.len(), 4, "chunked SSE framing must decode");
        assert_eq!(events[1].sequence, 2);
        server.drop_server();
    }

    #[test]
    fn malformed_success_bodies_map_to_core_errors() {
        let server = TestWorkerServer::start(ServerScript::default());
        let transport = transport_on(&server, &fake_token());
        let err = transport
            .request_json("GET", "/broken-json", None)
            .unwrap_err();
        assert_eq!(err.code, ErrorCode::WorkerNotAvailable);
        assert!(!err.retryable);
        assert!(err.developer_detail.contains("not valid JSON"), "{err:?}");
        server.drop_server();
    }

    // ------------------------------------------------------------------
    // Error-envelope mapping tests (direct, no server needed)
    // ------------------------------------------------------------------

    #[test]
    fn worker_error_codes_map_one_to_one() {
        let cases = [
            ("PROVIDER_AUTH_FAILED", ErrorCode::ProviderAuthFailed),
            ("PROVIDER_TIMEOUT", ErrorCode::ProviderTimeout),
            ("SEARCH_FAILED", ErrorCode::SearchFailed),
            ("SOURCE_PARSE_FAILED", ErrorCode::SourceParseFailed),
            ("LLM_INVALID_JSON", ErrorCode::LlmInvalidJson),
            ("TASK_DEPENDENCY_FAILED", ErrorCode::TaskDependencyFailed),
            ("VAULT_WRITE_FAILED", ErrorCode::VaultWriteFailed),
            ("DATABASE_ERROR", ErrorCode::DatabaseError),
        ];
        for (wire_code, expected) in cases {
            let body = json!({
                "schema_version": "1",
                "error": {
                    "code": wire_code,
                    "user_message": "safe message",
                    "developer_detail": "detail for developers",
                    "retryable": true,
                    "correlation_id": "corr-7",
                },
            });
            let error = map_worker_error(400, body.to_string().as_bytes());
            assert_eq!(error.code, expected, "code {wire_code}");
            assert!(
                error.retryable,
                "retryable flag passes through for {wire_code}"
            );
            assert_eq!(error.user_message, "safe message");
            assert!(error.developer_detail.contains(wire_code));
            assert!(error.developer_detail.contains("detail for developers"));
            assert_eq!(error.correlation_id.as_str(), "corr-7");
        }
    }

    #[test]
    fn unknown_worker_codes_map_to_a_generic_non_retryable_error() {
        let body = json!({
            "schema_version": "1",
            "error": {
                "code": "PLAN_NOT_APPROVED",
                "user_message": "The job request does not approve the research plan.",
                "developer_detail": "approve_plan=false",
                "retryable": true,
                "correlation_id": "corr-plan",
            },
        });
        let error = map_worker_error(400, body.to_string().as_bytes());
        assert_eq!(error.code, ErrorCode::WorkerNotAvailable);
        assert!(!error.retryable, "unknown codes are never retryable");
        assert!(error.developer_detail.contains("PLAN_NOT_APPROVED"));
        assert!(error.developer_detail.contains("approve_plan=false"));
        assert_eq!(error.correlation_id.as_str(), "corr-plan");

        // A body that is not an envelope at all is a protocol failure.
        let error = map_worker_error(500, b"<html>boom</html>");
        assert_eq!(error.code, ErrorCode::WorkerNotAvailable);
        assert!(!error.retryable);
        assert!(error
            .developer_detail
            .contains("not a worker-error.v1 envelope"));
    }

    #[test]
    fn worker_not_available_keeps_its_name_and_retryable_flag() {
        let body = json!({
            "schema_version": "1",
            "error": {
                "code": "WORKER_NOT_AVAILABLE",
                "user_message": "The worker failed to handle the request.",
                "developer_detail": "RuntimeError: boom",
                "retryable": true,
                "correlation_id": "corr-500",
            },
        });
        let error = map_worker_error(500, body.to_string().as_bytes());
        assert_eq!(error.code, ErrorCode::WorkerNotAvailable);
        assert!(error.retryable);
    }

    // ------------------------------------------------------------------
    // Supervisor integration over real sockets
    // ------------------------------------------------------------------

    fn tiny_policy() -> crate::worker::RestartPolicy {
        crate::worker::RestartPolicy {
            max_restarts: 3,
            base_delay_ms: 1,
            max_delay_ms: 4,
        }
    }

    #[test]
    fn supervisor_runs_jobs_and_forwards_sse_events_over_http() {
        let mut script = ServerScript::default();
        script.token = String::new(); // accept the supervisor's own token
        script.sse_body = canned_sse_body();
        let server = TestWorkerServer::start(script);
        let port = server.addr.port();
        let factory: Box<crate::worker::TransportFactory> =
            Box::new(move || Ok(Box::new(HttpWorkerTransport::connect(port))));
        let mut supervisor = Supervisor::new(
            factory,
            tiny_policy(),
            Box::new(crate::worker::SystemClock),
            Box::new(crate::worker::SystemSleeper),
        );

        supervisor.ensure_started().unwrap();
        assert_eq!(supervisor.state(), crate::worker::SupervisorState::Ready);

        let request = JobRequest {
            job_id: "core-side-1".into(),
            run_id: "run-9".into(),
            task_id: Some("task-9".into()),
            kind: "research_run".into(),
            params: json!({"domain": "AI", "topic": "scaling"}),
            approve_plan: true,
            plan: None,
        };
        supervisor.submit_job(&request).unwrap();
        // Tracking follows the worker-acknowledged id, not the core-side one.
        assert_eq!(supervisor.active_job_ids(), vec!["wire-job-1".to_string()]);

        let forwarded = supervisor.poll_events("wire-job-1").unwrap();
        assert_eq!(forwarded.len(), 4);
        assert_eq!(forwarded[0].run_id, "run-9");
        assert_eq!(forwarded[0].task_id.as_deref(), Some("task-9"));
        assert_eq!(forwarded[0].sequence, 1);
        // Acknowledgment gates consumption (audit F5): an unacknowledged
        // poll re-fetches; after acknowledging, the replay is dropped.
        let replayed = supervisor.poll_events("wire-job-1").unwrap();
        assert_eq!(replayed.len(), 4, "unacknowledged events re-deliver");
        supervisor.acknowledge_events("wire-job-1", 4);
        let second = supervisor.poll_events("wire-job-1").unwrap();
        assert!(second.is_empty(), "duplicate sequences must not forward");

        // Cancel keeps the job pollable until the pump retires it.
        supervisor.cancel_job("wire-job-1").unwrap();
        assert_eq!(
            supervisor.active_job_ids(),
            vec!["wire-job-1".to_string()],
            "cancelling jobs stay pollable for their terminal event"
        );
        supervisor.retire_job("wire-job-1");
        assert!(supervisor.active_job_ids().is_empty());
        server.drop_server();
    }

    #[test]
    fn dead_worker_exhausts_restarts_over_real_sockets() {
        let mut script = ServerScript::default();
        script.token = String::new(); // accept the supervisor's own token
        let server = TestWorkerServer::start(script);
        let port = server.addr.port();
        let factory: Box<crate::worker::TransportFactory> =
            Box::new(move || Ok(Box::new(HttpWorkerTransport::connect(port))));
        let mut supervisor = Supervisor::new(
            factory,
            tiny_policy(),
            Box::new(crate::worker::SystemClock),
            Box::new(crate::worker::SystemSleeper),
        );
        supervisor.ensure_started().unwrap();
        server.drop_server(); // the worker process dies

        let err = supervisor
            .submit_job(&JobRequest {
                job_id: "j".into(),
                run_id: "r".into(),
                task_id: None,
                kind: "research_run".into(),
                params: json!({}),
                approve_plan: true,
                plan: None,
            })
            .unwrap_err();
        assert_eq!(err.code, ErrorCode::WorkerNotAvailable);
        assert!(!err.retryable);
        assert!(err.developer_detail.contains("restart budget exhausted"));
        assert_eq!(
            supervisor.state(),
            crate::worker::SupervisorState::Exhausted
        );
    }
}
