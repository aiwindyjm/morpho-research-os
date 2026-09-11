# Development

Flow: PRD → architecture/feature spec → page spec → data contract → implementation → tests → docs. Use pnpm, cargo, and uv/pytest. Commits use `feat`, `fix`, `docs`, `refactor`, `test`, or `chore`. Run format, typecheck, lint, unit, and contract tests. Automated tests never call real providers.

For AI-assisted implementation, use the [AI Parallel Development Plan](development/AI_PARALLEL_DEVELOPMENT_PLAN.md). It is the canonical task map for small slices, dependency-aware parallel work, handoffs, and merge order.
