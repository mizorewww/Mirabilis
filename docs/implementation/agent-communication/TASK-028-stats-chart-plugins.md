# TASK-028 Agent Communication - Stats and Chart Plugins

## Task

- ID: TASK-028.
- Name: Implement Stats and Chart plugins.
- Branch: `feat/task-028-stats-chart-plugins`.
- Started: 2026-05-25 10:36 CST.
- Parent role: orchestration only. Parent delegates planning, docs research, test writing, implementation, review, and docs sync to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-028-implement-stats-and-chart-plugins`.
- `docs/product/05-built-in-plugins.md#20-stats-plugin-与-chart-plugin`.
- `docs/architecture/05-plugin-implementations.md#13-stats--chart--ml-插件架构`.
- `docs/development/01-data-roadmap-and-mvp.md#phase-8stats--chart-plugin`.
- `docs/development/02-implementation-roadmap-and-constraints.md#phase-8stats--chart-plugins`.

## Initial Parent Interpretation

- Implement a built-in Stats Plugin baseline and a separate Chart Plugin baseline.
- Stats should expose aggregation behavior for time by tag, time by page, estimate vs actual, habit completion, task switching, and unnoted sessions, using existing metadata/event/filter/view primitives where possible.
- Chart should register plugin-owned chart views for supported normalized data shapes and handle empty/loading states.
- Core must stay free of stats/chart business behavior.
- Keep native/Tauri/package/Rust/schema changes, persistent stats indexes, app-shell dashboard routing, ML/AI insight generation, sync, release packaging, production charting-library adoption, and broad cross-plugin query facade out of scope unless agents identify an acceptance-critical dependency.

## Validation At Start

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK; non-blocking notes were unrestricted sandbox/network and the known `TERM=dumb` terminal failure.

## Parent Decisions

- Start from `master` commit `69684a8`, after TASK-027 merge validation.
- Use branch `feat/task-028-stats-chart-plugins`.
- Delegate pre-test planning/current-doc guidance, deprecation/API review, and security review before writing tests because TASK-028 touches React/Vitest plugin views, aggregation semantics, metadata/event inputs, and plugin isolation.
- Parent thread will not write TASK-028 tests, production implementation, review findings, or formal docs sync unless a delegated agent fails or is explicitly cancelled and the fallback reason is recorded.

## Current Next Action

- Spawn pre-test guidance agents, then record parent decisions and delegate failing acceptance tests to `test_writer`.
