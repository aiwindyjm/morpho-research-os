# Changelog
All notable changes are documented here. Architecture Phase initialization begins in 0.1.0-alpha.

## Unreleased

Rapid feature push — NOT yet verified by the maintainer. Merged the three workgroup branches (contracts, fixture tooling, Python research engine) and added the local-compute research loop: provider routing profiles (default/local/offline), optional SearXNG search adapter, and the `run_research` CLI with plan approval gate. Verified by automated suites only (pytest 193, vitest 99, cargo 86, cross-language fixture checks); the real-model smoke run used a local Ollama qwen3:8b. Contract ratification items (error codes, protocol version, event field names) remain open — see `docs/development/TASK_STATUS.md`.

