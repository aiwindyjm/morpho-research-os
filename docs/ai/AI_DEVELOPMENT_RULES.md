# AI Development Rules (Public)

This file is the version committed to the public repository. It is based on the official [OpenAI Codex documentation](https://developers.openai.com/codex/overview/) and is written for repeatable, high-efficiency AI-assisted development.

## Operating loop

```text
Understand → plan a small slice → implement → verify → inspect diff → document
```

Before editing, AI must read `AGENTS.md`, `DO_NOT_BREAK.md`, the canonical `docs/PRD.md`, the governing architecture/contract, and the relevant feature or page specification. It must state the target files, acceptance checks, and any unresolved assumption in the work log.

## Small increments

- One change should have one clear user or engineering outcome.
- Prefer a sequence of small, independently buildable increments over a large feature branch.
- Every increment must have an acceptance check: test, typecheck, lint, contract validation, screenshot, or documented manual verification.
- Keep the public commit and release history truthful and readable.
- The repository may be pushed in small releases, but private batching and timing decisions belong only in the ignored local execution file.

## AI may do

- Implement an approved product, architecture, feature, page, or data specification.
- Fix a reproducible bug and add a focused regression test.
- Refactor inside an existing module boundary without changing behavior.
- Extend a registered component, provider adapter, prompt, fixture, or test.
- Update documentation when behavior, setup, configuration, or contracts change.

## AI must not decide alone

- Product direction, information architecture, navigation, or UX priorities.
- Technology, schema, IPC, worker, persistence, provider, or security changes.
- Global design tokens or a new UI framework/state library.
- Whether user data, secrets, private conversations, or research content is published.
- Whether a release is ready when required checks or human review are incomplete.

## Implementation discipline

- Prefer existing patterns and the smallest compatible dependency set.
- Separate domain, service, repository, adapter, transport, and presentation concerns.
- Validate external and LLM data before normalization or persistence.
- Never hide failures behind broad catches or silently destructive fallbacks.
- Do not modify unrelated user changes.

## Verification discipline

- Run the narrowest relevant checks after each increment, then the repository quality gate before release.
- Review `git diff`, `git diff --cached`, and the changed-file list before commit.
- Confirm private paths, secrets, local databases, caches, and conversation journals are absent from the staged set.
- Report skipped checks and known limitations honestly.

## Escalation

Stop and request a decision, or create an ADR, when the governing documents conflict, a required contract is missing, a change crosses a boundary, or the acceptance criteria cannot be inferred safely. Do not invent architecture to keep moving.
