# Architecture Invariants

Frontend cannot access SQLite or secrets. Worker cannot mutate UI state. Provider-specific types stay behind adapters. LLM responses must pass schema validation and normalization. Vault writes preserve user-modified files. Task transitions are validated and persisted before events are emitted. Every event and contract is versioned. No new framework or global token without an ADR.
