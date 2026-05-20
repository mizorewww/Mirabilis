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

- Status: pre-test guidance active.
- Active agents:
  - Kepler (`planner`, `019e4699-91c6-73f3-877d-3badf515c89f`): TASK-010 API/test implementation plan.
  - Sagan (`docs_researcher`, `019e4699-91c6-73f3-877d-3bc379b980a9`): current official docs and local-doc ambiguity research.
  - Franklin (`deprecation_auditor`, `019e4699-91c6-73f3-877d-3c00fd953abf`): TypeScript/API/deprecation risk audit.
  - Feynman (`security_reviewer`, `019e4699-91c6-73f3-877d-3c5c1e780654`): plugin permission/context boundary guidance.
- Next agent step: wait for pre-test guidance agents.

## Agent Handoffs

### Pre-test Guidance Round

- Status: active.
- Agents:
  - Kepler (`planner`, `019e4699-91c6-73f3-877d-3badf515c89f`).
  - Sagan (`docs_researcher`, `019e4699-91c6-73f3-877d-3bc379b980a9`).
  - Franklin (`deprecation_auditor`, `019e4699-91c6-73f3-877d-3c00fd953abf`).
  - Feynman (`security_reviewer`, `019e4699-91c6-73f3-877d-3c5c1e780654`).
- Assignment:
  - Produce focused Plugin API contract, test, docs, deprecation/API, and security-boundary guidance before TDD tests.
  - Stay read-only and do not edit files.

## Parent Decisions

- Use the existing repository checkout and branch only; do not create a sibling worktree.
- Follow TDD: gather docs/API guidance, delegate failing tests to `test_writer`, confirm the red signal, then delegate production implementation to `implementer`.
- Persist agent outputs and parent decisions here instead of relying on chat history.
- Keep TASK-010 focused on contracts. Do not implement Plugin Host lifecycle, native bridge, persisted plugin registry, built-in plugin behavior, app UI, Tauri IPC, SQLite, filesystem, permissions, or concrete business plugin logic.

## Next Action

Wait for pre-test guidance agents, record outcomes, then spawn a `test_writer`.
