# TASK-013 Agent Communication - SQLite Schema and Rust Repositories

## Task

- Task ID: TASK-013.
- Task name: Add SQLite schema and Rust repositories.
- Branch: `feat/task-013-sqlite-schema-rust-repositories`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/development/01-data-roadmap-and-mvp.md#27-数据表设计方向`.
- `docs/architecture/06-filter-native-database.md#16-sqlite-schema`.
- `docs/implementation/task-index.md#task-013-add-sqlite-schema-and-rust-repositories`.
- `docs/testing/strategy.md`.
- Current Rust SQLite crate and Tauri v2 plugin/storage guidance must be verified before tests.

## Acceptance Criteria

- SQLite schema exists for core pages, metadata, events, filters, plugins, commands, views, and plugin-owned indexes baseline.
- Rust repositories expose typed CRUD for core tables.
- JSON fields serialize and deserialize consistently.
- Migrations are repeatable and versioned.

## Initial Parent Interpretation

- TASK-013 is a Rust persistence-layer task, not a Tauri IPC command task.
- The implementation should add schema/migration and repository code under `src-tauri/src/` with temporary-database Rust tests.
- The schema must cover the Core tables listed in the local docs: pages, metadata, events, filters, plugins, commands, views, and plugin-owned index baseline support.
- Repository APIs should be typed Rust functions/structs for Core tables and should not expose raw SQL to the frontend or plugins.
- JSON columns should round-trip through typed Rust DTOs / `serde_json::Value` consistently.
- Migrations must be idempotent/repeatable and versioned.
- Out of scope: Tauri command exposure, capability/permission changes, NativeBridge operation allowlisting, frontend wiring, app bootstrap, real plugin-owned index table lifecycle, UI persistence flows, and sync/release behavior.

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
  - Produce focused behavior, schema, repository, migration, current-doc, dependency, and security guidance before TDD tests.
  - Stay read-only and do not edit files.

