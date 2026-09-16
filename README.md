<div align="center">
  <img src="docs/assets/brand/morpho-icon.png" width="128" alt="Morpho Research OS logo" />
</div>

# Morpho Research OS

> Turn a research question into a living knowledge base.

[English](README.md) | [简体中文](README.zh-CN.md)

Morpho is a local-first, AI-driven research workspace that turns a research question into a source-grounded, Obsidian-compatible knowledge base.

**Why Morpho?** Chat interfaces produce answers; Morpho preserves the research process: plan → tasks → sources → evidence → claims → relations → Markdown assets.

## Status

🚧 Early development — engineering alpha. The offline V0.1 research loop works end to end (plan approval → execution → persisted knowledge → Vault export → restart readback, verified by an offline real-process smoke); real providers, per-task dispatch, and packaging remain open — see CHANGELOG and docs/testing/REAL_WORKER_SMOKE.md.

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

### Docker preview

Run the current Mock-backed web workspace without installing Node or Rust:

```bash
docker compose up --build -d
```

Open `http://localhost:1420`. This is a static Web Preview; the full Rust Core and Python Research Worker are not exposed through Docker yet. See [Docker deployment](docs/deployment/DOCKER.md).

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

Code and documentation are licensed under **Apache-2.0** (see [LICENSE](LICENSE)).

The **Morpho name, logo, and icon set** are the project's visual brand and
are *not* licensed under Apache-2.0 — they are reserved by the maintainer.
Forks and redistributions must use their own name and icons. Permitted uses
(articles, reviews, unmodified screenshots referencing this project) are
listed in [TRADEMARKS.md](TRADEMARKS.md).
