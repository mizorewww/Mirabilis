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

- Status: task started; pre-test guidance handoff next.
- Active agents:
  - None yet.
- Next parent step: commit the start state, then spawn read-only planner/docs/deprecation/security agents for pre-test guidance.

## Agent Handoffs

### Pre-test Guidance Round

- Status: pending.
- Agents:
  - Pending.
- Assignment:
  - Produce focused behavior, API, current-doc, deprecation, and security-boundary guidance before TDD tests.
  - Stay read-only and do not edit files.

