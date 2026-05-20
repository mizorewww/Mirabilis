# TASK-012 Agent Communication - NativeBridge TypeScript Boundary

## Task

- Task ID: TASK-012.
- Task name: Add NativeBridge TypeScript boundary.
- Branch: `feat/task-012-nativebridge-typescript-boundary`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/architecture/06-filter-native-database.md#15-tauri--rust-边界`.
- `docs/architecture/01-overview-and-monorepo.md#11-分层结构`.
- `docs/architecture/07-runtime-flows.md`.
- `docs/implementation/task-index.md#task-012-add-nativebridge-typescript-boundary`.
- `docs/testing/strategy.md`.
- Current `@tauri-apps/api` v2 `invoke` documentation must be verified before tests.

## Acceptance Criteria

- Frontend calls Rust through a typed NativeBridge wrapper instead of raw invoke calls scattered through UI.
- Request and response DTOs are typed.
- Errors are normalized into typed app errors.
- No UI component calls Tauri APIs directly for persistence.

## Initial Parent Interpretation

- TASK-012 is a TypeScript frontend boundary task, not the Rust command, SQLite schema, persistence repository, or app-bootstrap implementation.
- The smallest useful shape is a typed NativeBridge module that owns all direct `@tauri-apps/api/core` `invoke` calls and exposes grouped bridge methods for database, shortcuts, notifications, and markdown file import/export as sketched in the architecture docs.
- Tests should mock Tauri invoke at the NativeBridge boundary and assert command names, DTO shapes, response typing behavior, and error normalization.
- Existing UI components should not call Tauri APIs directly for persistence. If no UI persistence calls exist yet, tests and scans should lock the boundary so future persistence calls route through NativeBridge.
- This task should avoid adding new Tauri permissions/capabilities, Rust commands, SQLite repositories, concrete persistence behavior, or runtime provider wiring. TASK-013 through TASK-015 own those surfaces.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully with 11 agent config files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK, plus the known desktop-terminal `TERM=dumb` failure. Parent treats this as non-blocking for repository agent work because configured agents and network reachability are available.

## Current Status

- Status: pre-test guidance agents running.
- Active agents:
  - Socrates (`planner`, `019e46af-56e2-7d60-acda-6e5010986619`).
  - Parfit (`docs_researcher`, `019e46af-5ac6-7ec0-82e2-b42db7892871`).
  - Turing (`deprecation_auditor`, `019e46af-5f7c-73d2-a0e9-cf63956a1350`).
  - Euclid (`security_reviewer`, `019e46af-6383-7ab0-94a4-8c01342a54e5`).
- Next parent step: wait for pre-test guidance, summarize recommendations, and commit the handoff before delegating red tests.

## Agent Handoffs

### Pre-test Guidance Round

- Status: running.
- Agents:
  - Socrates (`planner`, `019e46af-56e2-7d60-acda-6e5010986619`).
  - Parfit (`docs_researcher`, `019e46af-5ac6-7ec0-82e2-b42db7892871`).
  - Turing (`deprecation_auditor`, `019e46af-5f7c-73d2-a0e9-cf63956a1350`).
  - Euclid (`security_reviewer`, `019e46af-6383-7ab0-94a4-8c01342a54e5`).
- Assignment:
  - Produce focused behavior, API, current-doc, deprecation, and security-boundary guidance before TDD tests.
  - Stay read-only and do not edit files.
  - Socrates should recommend the module/file surface, public API shape, DTO/error boundaries, out-of-scope items, acceptance-test behaviors, and validation commands.
  - Parfit should verify current official `@tauri-apps/api` v2 `invoke` usage/import paths and relevant Vitest mocking guidance from primary sources.
  - Turing should audit deprecated/API compatibility risks for Tauri v2 imports, TypeScript module patterns, and ESM mocking.
  - Euclid should define IPC/native-boundary security criteria, including command centralization, typed DTOs, no UI raw Tauri persistence calls, and no new permissions/capabilities in this task.
