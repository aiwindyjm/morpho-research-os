# ADR-025 Desktop Provider Configuration and Worker Role Routing

## Status

Proposed (2026-09-17) — awaiting maintainer ratification. This document is
the decision material for the round-2 review's provider-routing finding; it
proposes a config model the current desktop surface cannot express. Nothing
here is implemented or self-ratified. Until it is Accepted, the desktop
handoff supports exactly ONE provider (unambiguous routing) and refuses
multi-provider configurations loudly instead of guessing (see
`secrets.rs::worker_provider_env`).

## Context

The round-2 review (2026-09-17, P1) confirmed: the desktop → worker
provider handoff passed provider DEFINITIONS into the worker process, but no
`MORPHO_ROLE_*` routing — so the worker silently used its built-in defaults
(planner/validation → `glm`, extraction/summarization/classification →
`ollama-local`) and the mock search adapter. The user's Settings choice did
not execute the research.

The gap is structural: the desktop's `ProviderConfig`
(`apps/desktop/src-tauri/src/secrets.rs`) has only `name`, `base_url`,
`model`, `api_key_ref`, `timeout_ms`, `max_retries` — no `kind`, no
`protocol`, no per-role routing, no search provider. The Rust handoff
therefore hardcodes `kind=llm`, `protocol=openai` per provider.

## What already works (verified, within the current model)

- With exactly ONE configured provider, the handoff emits
  `MORPHO_ROLE_{PLANNER,VALIDATION,EXTRACTION,SUMMARIZATION,CLASSIFICATION}`
  pointing at it; the embedding role deliberately stays on the worker's
  default (routing an embedding role onto a chat endpoint would
  misexecute). Rust tests: `secrets.rs` (`single_provider_handoff_routes_every_llm_role`,
  `multiple_providers_without_role_routing_refuse_loudly`).
- Worker-side FINAL selection is asserted in Python
  (`tests/test_desktop_handoff_selection.py`): `from_env` + `ProviderFactory`
  resolve the desktop provider for every LLM role; an explicit
  `kind=search` provider selects the SearXNG adapter; a routed-but-missing
  provider fails at config validation. No real keys or network.
- Multiple providers without routing refuse loudly at handoff time.

## Decision needed

Extend the desktop provider configuration (app config file under the app
config dir; crosses no IPC contract boundary but mirrors the frozen
`packages/schemas/provider-config.v1.json` vocabulary where applicable):

1. **Per-provider fields**: `kind` (`llm` | `search` | `embedding`),
   `protocol` (`openai` | `anthropic` | `gemini`) — mapping one-to-one onto
   the worker's `ProviderConfig` (W2-03 draft vocabulary, already parsed by
   `morpho_worker.config.from_env`).
2. **Role routing**: an explicit role→provider map for the worker's six
   roles (planner, validation, extraction, summarization, classification,
   embedding), persisted in the app config and validated against the
   provider list (a role referencing a missing or wrong-kind provider is a
   configuration error, mirroring the worker's own validator).
3. **Search selection**: `_configured_search_provider` already selects the
   first configured `kind=search` provider; with at most one search
   provider this stays unambiguous. Multiple search providers would need
   the same explicit-selection decision.
4. **Settings UI**: the provider form gains kind/protocol selectors and a
   role-routing section (ten-locale i18n keys).

## Alternatives

- **Keep single-provider-only**: rejected as the end state — the maintainer's
  documented setup routes extraction/summarization to local Ollama and
  planner/validation to a strong model; one provider cannot express that.
- **Let the worker decide (first provider wins)**: rejected — the review
  explicitly forbids silent defaults.
- **Route roles inside job payloads**: rejected — configuration travels at
  spawn time through process environment (the documented worker contract),
  never inside job payloads.

## Consequences (if accepted)

- `secrets.rs::ProviderConfig` and the Settings UI grow the fields above;
  `worker_provider_env` emits the role map instead of refusing.
- The app-config file format changes additively (old files keep working via
  serde defaults; a file with more than one provider and no role map keeps
  the loud refusal).
- `provider-config.v1.json` in `packages/schemas/` may need a minor
  additive revision or a documented divergence note — that choice belongs
  to the maintainer together with workgroup A's freeze policy.
