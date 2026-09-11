# Morpho Research OS

> Turn a research question into a living knowledge base.

[English](README.md) | [简体中文](README.zh-CN.md)

Morpho is a local-first, AI-driven research workspace that turns a research question into a source-grounded, Obsidian-compatible knowledge base.

**Why Morpho?** Chat interfaces produce answers; Morpho preserves the research process: plan → tasks → sources → evidence → claims → relations → Markdown assets.

## Status

🚧 Early development — Architecture Phase. Current: public contracts and governance. Next: repository foundation and research planner.

## Highlights

- Local-first Tauri desktop app
- Resumable DAG research tasks
- OpenAI-compatible provider abstraction
- Claims and evidence with provenance
- Markdown and Obsidian export
- 2D knowledge graph with D3

## Quick start

Architecture documentation is available now. Product runtime is not yet released. Read the [Product and Technical Specification](docs/PRD.md) and follow [Open Development](docs/development/OPEN_DEVELOPMENT.md) for the current build path. Once the foundation lands:

```bash
pnpm install
pnpm test
pnpm tauri dev
```

## Architecture

React/Vite → Tauri IPC → Rust Core → Python Research Worker → SQLite indexes + Markdown Vault. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Example

The first reproducible fixture is planned under `examples/fixtures/brain-computer-interface/` and will grow from configuration to plan, sources, knowledge, and graph snapshots.

## Roadmap

See [ROADMAP.md](ROADMAP.md). Releases are small, meaningful milestones; activity is never manufactured.

For the implementation task map, see the [AI Parallel Development Plan](docs/development/AI_PARALLEL_DEVELOPMENT_PLAN.md).

## Contributing and community

Read [CONTRIBUTING.md](CONTRIBUTING.md), open an Issue or Discussion, and review the [development workflow](docs/development/GITHUB_WORKFLOW.md).

## License

Apache-2.0 (see [LICENSE](LICENSE)).
