# Technology Stack Introduction

Morpho intentionally uses a small, familiar stack suited to one maintainer and AI-assisted development.

| Layer | Choice | Role | Boundary |
|---|---|---|---|
| Desktop shell | Tauri 2 | Native window, packaging, IPC host | Does not contain research workflow logic |
| Frontend | React + TypeScript + Vite | UI and interaction | Calls typed Tauri commands only |
| Styling | Tailwind CSS + shadcn/ui | Tokenized visual system and primitives | No second UI framework |
| UI state | Zustand | Local view state | Not a server cache or domain database |
| Async state | TanStack Query | Request lifecycle and cache | Uses service contracts |
| Validation | Zod | Runtime validation in TypeScript | Mirrors canonical schemas |
| Desktop core | Rust | Persistence, filesystem, secrets, process lifecycle | Authoritative local boundary |
| Database | SQLite | Runtime state and indexes | Never the sole user knowledge asset |
| Worker | Python | Research orchestration and adapters | Communicates through versioned protocol |
| Visualization | D3.js | 2D graph and timeline rendering | Must provide accessible alternatives |

## Why this stack

The choices are stable, locally runnable, testable, and widely understood. They avoid a cloud control plane, microservices, a vector database, or a complex agent framework during V0.1.

## Dependency rule

Adding a framework, state library, database, or runtime requires an ADR that explains the problem, alternatives, complexity cost, and maintenance impact for a solo maintainer.
