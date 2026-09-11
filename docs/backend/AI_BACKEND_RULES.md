# AI Backend Rules
Keep domain, service, repository, adapter, and transport layers separate. Rust owns persistence, IPC, secrets, filesystem, and process lifecycle; Python owns research workflow. Use typed errors, redacted structured logging, transactions, idempotency keys, bounded retries, and explicit cancellation. No cross-layer calls or direct LLM-to-database/vault writes.
