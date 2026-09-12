"""Draft worker HTTP transport (stdlib only).

Implements the documented draft endpoints from ``docs/API.md``/``docs/PRD.md``
section 8: ``GET /health``, ``GET /version``, the local compatibility probe,
and — when a :class:`~morpho_worker.jobs.JobService` is injected — the job
surface: ``POST /jobs``, ``GET /jobs/{job_id}``,
``POST /jobs/{job_id}/cancel``, and ``GET /jobs/{job_id}/events`` (SSE with
``Last-Event-ID`` header / ``?after_sequence=`` cursor replay). Also hosts
the local test client used by the protocol tests.

Draft status (W2-02): the job/event endpoints are implemented against the
documented draft, but request/response field names, the job envelope, and
transport-level error codes (``UNAUTHORIZED`` / ``NOT_FOUND`` /
``BAD_REQUEST`` / ``UNSUPPORTED_JOB_KIND``) remain placeholders until W2-02
freezes the worker protocol. They intentionally reuse the structured error
envelope shape from ``docs/api/ERRORS.md``.
"""

from __future__ import annotations

import http.client
import json
import threading
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable, Iterator
from urllib.parse import parse_qs, unquote

from morpho_worker.errors import MorphoError
from morpho_worker.version import (
    health_payload,
    is_protocol_compatible,
    version_payload,
)

_SCHEMA_VERSION = "1"

#: Handler type for exact routes: ``(request_body) -> (status, payload)``.
ExactRouteHandler = Callable[[dict[str, Any]], tuple[int, dict[str, Any]]]

#: Handler type for ``{param}`` pattern routes:
#: ``(request_info, path_params) -> (status, payload) | StreamResponse`` where
#: ``request_info`` carries ``body`` (parsed JSON), ``query`` (first value per
#: parameter), and ``headers`` (raw header dict).
ParamRouteHandler = Callable[..., Any]


def error_envelope(
    code: str,
    user_message: str,
    *,
    developer_detail: str = "",
    retryable: bool = False,
    correlation_id: str = "",
) -> dict[str, Any]:
    return {
        "schema_version": _SCHEMA_VERSION,
        "error": {
            "code": code,
            "user_message": user_message,
            "developer_detail": developer_detail,
            "retryable": retryable,
            "correlation_id": correlation_id,
        },
    }


def error_envelope_from(exc: MorphoError) -> dict[str, Any]:
    return {"schema_version": _SCHEMA_VERSION, "error": exc.to_dict()}


@dataclass
class StreamResponse:
    """Streaming reply (SSE): chunks are written and flushed one by one and
    the stream ends with clean EOF once the iterator is exhausted. A client
    disconnect aborts iteration, so producers stop on the next write."""

    content_type: str
    chunks: Iterator[str]


class WorkerHTTPRequestHandler(BaseHTTPRequestHandler):
    """Route table: /health, /version plus a test-only compatibility probe.

    Two extension points (both optional, registered via the server factory):

    - ``extra_routes``: exact ``(method, path) -> handler(request_dict)``
      mappings, kept for simple additional endpoints;
    - ``param_routes``: ``(method, "/path/{param}", handler)`` patterns where
      the handler receives ``(request_info, path_params)`` and may return a
      ``StreamResponse`` for streaming (SSE) replies.

    Exact routes keep precedence over pattern routes; the job routes are
    registered by ``JobService`` through both tables.
    """

    server_version = "morpho-research-worker"
    sys_version = ""

    @property
    def worker_server(self) -> "WorkerHTTPServer":
        return self.server  # type: ignore[return-value]

    def _authorize(self) -> bool:
        token = self.worker_server.session_token
        if not token:
            return True
        header = self.headers.get("Authorization", "")
        return header == f"Bearer {token}"

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_stream(self, stream: StreamResponse) -> None:
        """Write a streaming reply frame by frame until EOF or disconnect."""

        self.close_connection = True
        self.send_response(200)
        self.send_header("Content-Type", stream.content_type)
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        for chunk in stream.chunks:
            data = chunk.encode("utf-8") if isinstance(chunk, str) else bytes(chunk)
            try:
                self.wfile.write(data)
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, OSError):
                # Client disconnected: stop consuming the producer.
                return

    def _read_json_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        if not raw:
            return {}
        try:
            parsed = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise MorphoError(
                "BAD_REQUEST",
                "The request body is not valid JSON.",
                developer_detail=f"transport body parse failed: {exc}",
                retryable=False,
            ) from exc
        if not isinstance(parsed, dict):
            raise MorphoError(
                "BAD_REQUEST",
                "The request body must be a JSON object.",
                retryable=False,
            )
        return parsed

    def _dispatch(self, method: str) -> None:
        if not self._authorize():
            self._send_json(
                401,
                error_envelope(
                    "UNAUTHORIZED",
                    "The worker requires a valid session token.",
                    developer_detail="missing or invalid Authorization bearer token",
                ),
            )
            return
        raw_path, _, query_string = self.path.partition("?")
        path = raw_path.rstrip("/") or "/"
        query = {name: values[0] for name, values in parse_qs(query_string).items()}
        handler: Any = self.worker_server.routes.get((method, path))
        params: dict[str, str] | None = None
        if handler is None:
            matched = self.worker_server.match_param_route(method, path)
            if matched is None:
                self._send_json(
                    404,
                    error_envelope(
                        "NOT_FOUND",
                        "The requested worker endpoint does not exist.",
                        developer_detail=f"{method} {path}",
                    ),
                )
                return
            handler, params = matched
        try:
            if params is None:
                request: dict[str, Any] = {}
                if method == "POST":
                    request = self._read_json_body()
                result = handler(request)
            else:
                request_info: dict[str, Any] = {
                    "body": self._read_json_body() if method == "POST" else {},
                    "query": query,
                    "headers": dict(self.headers.items()),
                }
                result = handler(request_info, params)
        except MorphoError as exc:
            self._send_json(400, error_envelope_from(exc))
            return
        except Exception as exc:  # pragma: no cover - defensive transport guard
            self._send_json(
                500,
                error_envelope(
                    "WORKER_NOT_AVAILABLE",
                    "The worker failed to handle the request.",
                    developer_detail=f"{type(exc).__name__}: {exc}",
                    retryable=True,
                ),
            )
            return
        if isinstance(result, StreamResponse):
            self._send_stream(result)
            return
        status, payload = result
        self._send_json(status, payload)

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        self._dispatch("GET")

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        self._dispatch("POST")

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        # Keep test output quiet; protocol tests assert on payloads, not logs.
        return


class WorkerHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(
        self,
        *,
        host: str = "127.0.0.1",
        port: int = 0,
        session_token: str | None = None,
        extra_routes: dict[tuple[str, str], ExactRouteHandler] | None = None,
        param_routes: list[tuple[str, str, ParamRouteHandler]] | None = None,
        job_service: Any | None = None,
    ) -> None:
        self.session_token = session_token
        self.routes: dict[tuple[str, str], Any] = {
            ("GET", "/health"): self._handle_health,
            ("GET", "/version"): self._handle_version,
            ("POST", "/compatibility"): self._handle_compatibility,
        }
        #: ``{param}`` pattern routes; matched only when no exact route hits.
        self.param_routes: list[tuple[str, str, Any]] = []
        if extra_routes:
            self.routes.update(extra_routes)
        if param_routes:
            self.param_routes.extend(param_routes)
        if job_service is not None:
            # Duck-typed wiring (routes()/param_routes()) keeps the transport
            # free of a jobs import; see morpho_worker.jobs.JobService.
            self.routes.update(job_service.routes())
            self.param_routes.extend(job_service.param_routes())
        super().__init__((host, port), WorkerHTTPRequestHandler)

    def match_param_route(
        self, method: str, path: str
    ) -> tuple[ParamRouteHandler, dict[str, str]] | None:
        """First ``{param}`` route whose method and segment shape match.

        Parameter segments (``{job_id}``) capture a single path segment each;
        values are percent-decoded.
        """

        parts = [part for part in path.split("/") if part]
        for route_method, pattern, handler in self.param_routes:
            if route_method != method:
                continue
            expected = [part for part in pattern.split("/") if part]
            if len(expected) != len(parts):
                continue
            params: dict[str, str] = {}
            matched = True
            for want, got in zip(expected, parts):
                if len(want) > 2 and want.startswith("{") and want.endswith("}"):
                    params[want[1:-1]] = unquote(got)
                elif want != got:
                    matched = False
                    break
            if matched:
                return handler, params
        return None

    # Handlers ------------------------------------------------------------

    def _handle_health(self, _request: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        return 200, health_payload(process_status="ok")

    def _handle_version(self, _request: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        return 200, version_payload()

    def _handle_compatibility(self, request: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        requested = str(request.get("protocol_version", ""))
        compatible = is_protocol_compatible(requested)
        return 200, {
            "schema_version": _SCHEMA_VERSION,
            "requested_protocol_version": requested,
            "worker_protocol_version": self._protocol_version(),
            "compatible": compatible,
        }

    def _protocol_version(self) -> str:
        from morpho_worker.version import WORKER_PROTOCOL_VERSION

        return WORKER_PROTOCOL_VERSION


class WorkerStream:
    """Incremental read handle over one open HTTP response (SSE tests).

    The connection stays open while the caller reads; closing ends it. Only
    talks to a locally started WorkerHTTPServer, like ``WorkerClient``.
    """

    def __init__(
        self, connection: http.client.HTTPConnection, response: http.client.HTTPResponse
    ) -> None:
        self._connection = connection
        self.response = response

    @property
    def status(self) -> int:
        return self.response.status

    @property
    def content_type(self) -> str:
        return self.response.getheader("Content-Type", "")

    def lines(self) -> Iterator[str]:
        for raw in self.response:
            yield raw.decode("utf-8")

    def read_all(self) -> str:
        return "".join(self.lines())

    def close(self) -> None:
        self._connection.close()

    def __enter__(self) -> "WorkerStream":
        return self

    def __exit__(self, *exc_info: Any) -> None:
        self.close()


class WorkerClient:
    """Minimal local test client (stdlib http.client), for tests and the
    Rust-side protocol conformance checks. Never used against real networks
    in tests: it only talks to a locally started WorkerHTTPServer."""

    def __init__(self, host: str, port: int, session_token: str | None = None) -> None:
        self.host = host
        self.port = port
        self.session_token = session_token

    def request(
        self, method: str, path: str, body: dict[str, Any] | None = None
    ) -> tuple[int, dict[str, Any]]:
        connection = http.client.HTTPConnection(self.host, self.port, timeout=10)
        try:
            headers = {"Accept": "application/json"}
            if self.session_token:
                headers["Authorization"] = f"Bearer {self.session_token}"
            payload = None
            if body is not None:
                payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
                headers["Content-Type"] = "application/json"
            connection.request(method, path, body=payload, headers=headers)
            response = connection.getresponse()
            raw = response.read()
            parsed = json.loads(raw.decode("utf-8")) if raw else {}
            return response.status, parsed
        finally:
            connection.close()

    def stream(
        self, path: str, *, headers: dict[str, str] | None = None, timeout: float = 30.0
    ) -> WorkerStream:
        """Open a GET stream (SSE) and return a handle for incremental reads."""

        connection = http.client.HTTPConnection(self.host, self.port, timeout=timeout)
        try:
            request_headers = {"Accept": "text/event-stream"}
            if self.session_token:
                request_headers["Authorization"] = f"Bearer {self.session_token}"
            request_headers.update(headers or {})
            connection.request("GET", path, headers=request_headers)
            response = connection.getresponse()
        except Exception:
            connection.close()
            raise
        return WorkerStream(connection, response)

    def get(self, path: str) -> tuple[int, dict[str, Any]]:
        return self.request("GET", path)

    def post(self, path: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        return self.request("POST", path, body)


class WorkerService:
    """Server lifecycle helper: binds an ephemeral port and serves until
    stopped. Used by tests and (later) by the Rust supervisor contract
    checks; never exposes the worker beyond loopback by default.

    Passing ``job_service`` registers the draft job endpoints
    (``POST /jobs``, ``GET /jobs/{job_id}``, ``POST /jobs/{job_id}/cancel``,
    ``GET /jobs/{job_id}/events``) alongside health/version.
    """

    def __init__(
        self,
        *,
        session_token: str | None = None,
        host: str = "127.0.0.1",
        port: int = 0,
        extra_routes: dict[tuple[str, str], ExactRouteHandler] | None = None,
        param_routes: list[tuple[str, str, ParamRouteHandler]] | None = None,
        job_service: Any | None = None,
    ) -> None:
        self.server = WorkerHTTPServer(
            host=host,
            port=port,
            session_token=session_token,
            extra_routes=extra_routes,
            param_routes=param_routes,
            job_service=job_service,
        )
        self.host, self.port = self.server.server_address[:2]
        self.session_token = session_token
        self._thread: threading.Thread | None = None

    @property
    def base_url(self) -> str:
        return f"http://{self.host}:{self.port}"

    def client(self) -> WorkerClient:
        return WorkerClient(str(self.host), int(self.port), self.session_token)

    def start(self) -> "WorkerService":
        self._thread = threading.Thread(
            target=self.server.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True
        )
        self._thread.start()
        return self

    def stop(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=5)

    def __enter__(self) -> "WorkerService":
        return self.start()

    def __exit__(self, *exc_info: Any) -> None:
        self.stop()
