# Initialization Plan
Phase 0: approve contracts, invariants, tokens, ADRs, CI. Phase 1: repository skeleton and codegen. Phase 2: frontend shell/component registry. Phase 3: Tauri commands, SQLite migrations, keychain and supervisor. Phase 4: worker health/protocol/mocks. Phase 5: schemas and repositories. Phase 6: planner. Phase 7: DAG engine. Phase 8: search. Phase 9: knowledge normalization. Phase 10: vault writer. Phase 11: graph.

Every phase must ship targeted tests, docs updated with code, and a definition of done: builds locally, contract checks pass, error/retry behavior verified, and no invariant violations. Phase 0 explicitly contains no research business code.
