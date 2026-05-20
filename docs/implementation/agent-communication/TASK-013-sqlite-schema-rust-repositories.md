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

- Status: pre-test guidance agents running.
- Active agents:
  - Dewey the 2nd (`planner`, id `019e46e5-ec64-7473-ba01-8aacba8f1423`).
  - Poincare the 2nd (`docs_researcher`, id `019e46e5-f1c9-76f0-a37c-91ef5dae86ab`).
  - Raman the 2nd (`deprecation_auditor`, id `019e46e6-0938-7a03-a25b-92cdca3808bf`).
  - Epicurus the 2nd (`security_reviewer`, id `019e46e6-0e3f-7c22-8767-d33b76cd0ced`).
- Next parent step: wait for pre-test guidance, record parent decisions, then delegate Rust red tests to `test_writer`.

## Agent Handoffs

### Pre-test Guidance Round

- Status: running.
- Agents:
  - Dewey the 2nd (`planner`): recommend Rust module/file surface, schema/migration shape, repository API, DTO/entity shape, temporary database tests, migration idempotency tests, validation commands, and out-of-scope boundaries.
  - Poincare the 2nd (`docs_researcher`): verify current official/primary guidance for Rust SQLite choices in a Tauri v2 app, including `rusqlite`, `sqlx`, `tauri-plugin-sql`, migrations, temp database testing, bundled SQLite, async/blocking considerations, and Tauri plugin options.
  - Raman the 2nd (`deprecation_auditor`): identify deprecated/problematic APIs, dependency/feature risks, crate tradeoffs, migration APIs, serde JSON concerns, and Rust edition/toolchain risks.
  - Epicurus the 2nd (`security_reviewer`): advise on persistence boundary safety, parameterized repository access, no raw SQL exposure, JSON/privacy boundaries, migration idempotency, plugin-owned index baseline risks, and future allowlist handoff.
- Assignment:
  - Produce focused behavior, schema, repository, migration, current-doc, dependency, and security guidance before TDD tests.
  - Stay read-only and do not edit files.
