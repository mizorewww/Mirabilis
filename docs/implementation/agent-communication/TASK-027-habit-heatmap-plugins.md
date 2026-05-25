# TASK-027 Agent Communication - Habit and Heatmap Plugins

## Task

- ID: TASK-027.
- Name: Implement Habit and Heatmap plugins.
- Branch: `feat/task-027-habit-heatmap-plugins`.
- Started: 2026-05-25 09:41 CST.
- Parent role: orchestration only. Parent delegates planning, docs research, test writing, implementation, review, and docs sync to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-027-implement-habit-and-heatmap-plugins`.
- `docs/product/05-built-in-plugins.md#17-habit-plugin`.
- `docs/architecture/05-plugin-implementations.md#12-habit--heatmap-插件架构`.
- `docs/development/01-data-roadmap-and-mvp.md#phase-7habit-plugin--heatmap-view-plugin`.
- `docs/development/02-implementation-roadmap-and-constraints.md#phase-7habit--heatmap-plugins`.
- Related Habit/Heatmap references in product, architecture, development, and testing docs.

## Initial Parent Interpretation

- Implement a built-in Habit Plugin baseline that recognizes habit pages through `#habit` syntax or habit-owned metadata.
- Habit completion should write Habit-owned events.
- Habits and Today Habits filters should work through existing filter/view primitives where possible.
- Implement a separate Heatmap Plugin baseline that renders habit completion events or normalized date-series data.
- Heatmap rendering belongs in a plugin-owned view, not Core.
- Keep Core free of habit/heatmap business behavior.
- Keep native/Tauri/package/Rust/schema changes, persistence rewiring, broad app-shell navigation, Stats/ML aggregation, Calendar scheduled feeds, external sync, and release packaging out of scope unless agents identify an acceptance-critical dependency.

## Validation At Start

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK; non-blocking notes were unrestricted sandbox/network and the known `TERM=dumb` terminal failure.

## Parent Decisions

- Start from `master` commit `b898ca3`, after TASK-026 merge validation.
- Use branch `feat/task-027-habit-heatmap-plugins`.
- Delegate pre-test planning/current-doc guidance, deprecation/API review, and security review before writing tests because TASK-027 touches React/Vitest plugin views, filter/view/command/event boundaries, habit metadata/events, and plugin isolation.
- Parent thread will not write TASK-027 tests, production implementation, review findings, or formal docs sync unless a delegated agent fails or is explicitly cancelled and the fallback reason is recorded.

## Current Next Action

- Pre-test guidance started 2026-05-25 09:44 CST.
- Einstein (`planner`) is defining the smallest safe TASK-027 scope, canonical ids, acceptance criteria, risks, and TDD handoff.
- Laplace (`docs_researcher`) is checking current React/Vitest/Testing Library guidance for Habit filters and Heatmap/date-series view tests.
- Kierkegaard (`deprecation_auditor`) is auditing canonical Habit/Heatmap identifiers, stale docs/API risks, and deprecated framework patterns.
- Singer (`security_reviewer`) is reviewing Habit command/event/metadata trust boundaries, Heatmap input validation, inert rendering, and native/package/Tauri/Rust/schema guardrails.

## Current Next Action

- Wait for pre-test guidance agents, then record parent decisions and delegate failing acceptance tests to `test_writer`.
