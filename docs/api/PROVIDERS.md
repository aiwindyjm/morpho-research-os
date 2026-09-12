# Provider Contracts
LLMProvider: `complete(request, schema) -> structured response`, `stream`, and usage metadata. SearchProvider: `search(query, options) -> canonical sources`. EmbeddingProvider: `embed(texts)`. Adapters implement timeout, bounded retry, redaction, and token/cost tracking. Supported adapters are GLM, OpenAI, Claude, Gemini, DeepSeek, and Ollama; provider names/models are configuration, never domain enums.

## Frozen records (v1.0)

- [`packages/schemas/provider-config.v1.json`](../../packages/schemas/provider-config.v1.json) — one provider instance: `provider_id`, `kind` (`llm`/`search`/`embedding`), `base_url`, `key_reference`, `model`, `timeout_ms`, `retry {max_attempts 1..10, backoff_ms}`, optional non-secret `extra_headers`. Closed record.
- [`packages/schemas/usage-record.v1.json`](../../packages/schemas/usage-record.v1.json) — per-call accounting: `usage_id`, `task_id`/`run_id`, `provider_id`, `kind`, `model`, `input_tokens`/`output_tokens`, `duration_ms`, `estimated_cost_usd {amount, currency: USD}`, `cache_hit`, `retries`, `created_at`. Closed record.

## Normative rules

1. **Key references only.** `key_reference` names an OS keychain entry. Key values live in the keychain and are resolved by the Rust Core, which injects them into the worker process environment at spawn; they never appear in persisted configs, job payloads, events, logs, prompts, or this schema's instances. Local providers (e.g. Ollama) omit `key_reference`.
2. **Names are configuration.** `provider_id`, adapter choice, and `model` are strings; introducing a new vendor or model must not change any schema or domain enum.
3. **Interface shapes** (implemented in scope D against these records): `LLMProvider.complete(request, output_schema) -> validated structured response` plus `stream`; `SearchProvider.search(query, options) -> canonical sources`; `EmbeddingProvider.embed(texts)`. Provider-specific response types stay inside adapters; the domain consumes normalized results only.
4. **Error mapping** to the frozen envelope codes: authentication/permission failures → `PROVIDER_AUTH_FAILED` (retryable `false` unless transient); timeouts → `PROVIDER_TIMEOUT` (retryable `true`, honors bounded `retry`); search backend failures → `SEARCH_FAILED`; structurally invalid model output → `LLM_INVALID_JSON` (retryable per strategy). Retry exhaustion surfaces the terminal error with `retries` recorded in the usage record.
5. **Usage accounting is mandatory:** every non-cached provider interaction writes exactly one usage record; cache hits write a record with `cache_hit: true` and zero cost so reports stay explainable.
6. **Cache keys** include schema/prompt version, provider/model, and normalized input (`docs/ai/CACHE_AND_COST.md`); changing any of these invalidates the entry by construction.
7. **Future model routing** (strong models for planning/validation, cheap models for extraction) extends configuration and routing policy only; it must not leak provider kinds into domain types (`docs/ai/MODEL_ROUTING.md`).
