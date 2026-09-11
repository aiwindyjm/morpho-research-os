# Error Model

Errors use codes WORKER_NOT_AVAILABLE, PROVIDER_AUTH_FAILED, PROVIDER_TIMEOUT, SEARCH_FAILED, SOURCE_PARSE_FAILED, LLM_INVALID_JSON, TASK_DEPENDENCY_FAILED, VAULT_WRITE_FAILED, DATABASE_ERROR, VAULT_SCHEMA_MISMATCH. Each carries safe user_message, developer_detail, retryable, correlation_id, and optional cause. Logs redact keys, prompts with secrets, and raw sensitive payloads.

## Frozen envelope

The structured error shape is frozen as [`packages/schemas/worker-error.v1.json`](../../packages/schemas/worker-error.v1.json): a closed envelope `{schema_version, error: {code, user_message, developer_detail, retryable, correlation_id, cause?}}`. The code list is an enum in that schema; adding a code is a contract change that must update the schema, all three bindings, and the corpus — not just this page.

- `VAULT_SCHEMA_MISMATCH` (added with the version policy): a vault reader encountered note frontmatter with an unsupported `schema_version` major; user content is never rewritten to force compatibility (`docs/development/VERSIONS.md`).
- Transport-level mapping for the worker protocol lives in [`WORKER_PROTOCOL.md`](WORKER_PROTOCOL.md); provider error classification lives in [`PROVIDERS.md`](PROVIDERS.md).
