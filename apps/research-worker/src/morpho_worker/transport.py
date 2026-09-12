"""Draft worker HTTP transport (stdlib only).

Implements the documented draft endpoints ``GET /health`` and
``GET /version`` from ``docs/API.md``/``docs/PRD.md`` section 8, plus the
local test client used by the protocol tests. Job and event endpoints are
added by later tasks (event primitives PY-03, job wiring with the
orchestrator).

Draft status: request/response field names and transport-level error codes
are placeholders until W2-02 freezes the worker protocol. They intentionally
reuse the structured error envelope shape from ``docs/api/ERRORS.md``.
"""

from __future__ import annotations

import http.client
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from morpho_worker.errors import MorphoError
from morpho_worker.version import (
    health_payload,
    is_protocol_compatible,
    version_payload,
)

_SCHEMA_VERSION = "1"


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


class WorkerHTTPRequestHandler(BaseHTTPRequestHandler):
    """Route table: /health and /version plus a test-only compatibility probe.

    Subclasses (or the server factory) may register additional routes via
    ``extra_routes``: mapping of ``(method, path) -> callable(request_dict)
    -> (status, payload)``. Path parameters are not supported at this draft
    stage; job routes register exact paths per job id.
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
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        handler = self.worker_server.routes.get((method, path))
        if handler is None:
            self._send_json(
                404,
                error_envelope(
                    "NOT_FOUND",
                    "The requested worker endpoint does not exist.",
                    developer_detail=f"{method} {path}",
                ),
            )
            return
        try:
            request: dict[str, Any] = {}
            if method == "POST":
                request = self._read_json_body()
            status, payload = handler(request)
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
        extra_routes: dict[tuple[str, str], Any] | None = None,
    ) -> None:
        self.session_token = session_token
        self.routes: dict[tuple[str, str], Any] = {
            ("GET", "/health"): self._handle_health,
            ("GET", "/version"): self._handle_version,
            ("POST", "/compatibility"): self._handle_compatibility,
        }
        if extra_routes:
            self.routes.update(extra_routes)
        super().__init__((host, port), WorkerHTTPRequestHandler)

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

    def get(self, path: str) -> tuple[int, dict[str, Any]]:
        return self.request("GET", path)

    def post(self, path: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
        return self.request("POST", path, body)


class WorkerService:
    """Server lifecycle helper: binds an ephemeral port and serves until
    stopped. Used by tests and (later) by the Rust supervisor contract
    checks; never exposes the worker beyond loopback by default."""

    def __init__(
        self,
        *,
        session_token: str | None = None,
        host: str = "127.0.0.1",
        port: int = 0,
        extra_routes: dict[tuple[str, str], Any] | None = None,
    ) -> None:
        self.server = WorkerHTTPServer(
            host=host, port=port, session_token=session_token, extra_routes=extra_routes
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
