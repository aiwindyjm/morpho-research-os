# Error Model
Errors use codes WORKER_NOT_AVAILABLE, PROVIDER_AUTH_FAILED, PROVIDER_TIMEOUT, SEARCH_FAILED, SOURCE_PARSE_FAILED, LLM_INVALID_JSON, TASK_DEPENDENCY_FAILED, VAULT_WRITE_FAILED, DATABASE_ERROR. Each carries safe user_message, developer_detail, retryable, correlation_id, and optional cause. Logs redact keys, prompts with secrets, and raw sensitive payloads.
