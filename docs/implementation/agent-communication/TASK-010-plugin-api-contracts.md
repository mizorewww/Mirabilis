# TASK-010 Agent Communication - Plugin API Contracts

## Task

- Task ID: TASK-010.
- Task name: Define Plugin API contracts.
- Branch: `feat/task-010-plugin-api-contracts`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/product/03-plugin-platform.md#6-plugin-manifest-设计`.
- `docs/product/03-plugin-platform.md#7-plugin-可以贡献的能力`.
- `docs/product/03-plugin-platform.md#8-plugin-生命周期`.
- `docs/product/03-plugin-platform.md#9-plugin-runtime`.
- `docs/architecture/03-plugin-api-and-host.md#5-plugin-api-设计`.
- `docs/architecture/02-core-kernel.md`.
- `docs/implementation/task-index.md#task-010-define-plugin-api-contracts`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- Define `PluginManifest`, `PluginContributions`, `AppPlugin`, and `PluginContext`.
- Plugin permissions and dependencies are represented.
- Contributions include markdown syntax, metadata fields, event types, commands, filters, views, slots, indexers, algorithms, mobile toolbar items, and settings panels.
- API contracts do not depend on concrete built-in plugin implementations.

## Initial Parent Interpretation

- TASK-010 is a TypeScript contract task, not a Plugin Host implementation task.
- Contracts should likely live under Core or a plugin-api subpath consistent with the current repo shape; agents should advise before tests are written.
- The task should expose type contracts from public Core entrypoints and focused subpaths without adding concrete Task/Habit/Timer/AI/etc. business implementations.
- `PluginContext` should refer to existing runtime services and registries where implemented today, while future extension registries/services should be represented as contracts only if required by the acceptance criteria.
- Runtime validation may be added only if agents recommend it as the smallest useful contract surface; otherwise type-level and export tests are enough.
- Do not touch Tauri IPC, permissions, Rust, SQLite, filesystem, UI rendering, built-in plugin packages, or Plugin Host lifecycle for this task.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network OK, noted Codex `0.132.0` is available, and reported the known desktop-terminal `TERM=dumb` failure. Parent treats this as non-blocking for repository agent work.

## Current Status

- Status: pre-test guidance pending.
- Active agents: none.
- Next agent step: spawn planner, docs researcher, and deprecation auditor for TASK-010 contract/API guidance.

## Agent Handoffs

No agents have been spawned yet for TASK-010.

## Parent Decisions

- Use the existing repository checkout and branch only; do not create a sibling worktree.
- Follow TDD: gather docs/API guidance, delegate failing tests to `test_writer`, confirm the red signal, then delegate production implementation to `implementer`.
- Persist agent outputs and parent decisions here instead of relying on chat history.
- Keep TASK-010 focused on contracts. Do not implement Plugin Host lifecycle, native bridge, persisted plugin registry, built-in plugin behavior, app UI, Tauri IPC, SQLite, filesystem, permissions, or concrete business plugin logic.

## Next Action

Spawn pre-test guidance agents.
