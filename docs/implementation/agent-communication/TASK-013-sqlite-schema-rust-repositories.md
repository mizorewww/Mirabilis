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

- Status: pre-test guidance complete; red test handoff next.
- Active agents:
  - None.
- Next parent step: commit pre-test guidance, then delegate Rust red tests to `test_writer`.

## Agent Handoffs

### Pre-test Guidance Round

- Status: complete.
- Agents:
  - Dewey the 2nd (`planner`): recommend Rust module/file surface, schema/migration shape, repository API, DTO/entity shape, temporary database tests, migration idempotency tests, validation commands, and out-of-scope boundaries.
  - Poincare the 2nd (`docs_researcher`): verify current official/primary guidance for Rust SQLite choices in a Tauri v2 app, including `rusqlite`, `sqlx`, `tauri-plugin-sql`, migrations, temp database testing, bundled SQLite, async/blocking considerations, and Tauri plugin options.
  - Raman the 2nd (`deprecation_auditor`): identify deprecated/problematic APIs, dependency/feature risks, crate tradeoffs, migration APIs, serde JSON concerns, and Rust edition/toolchain risks.
  - Epicurus the 2nd (`security_reviewer`): advise on persistence boundary safety, parameterized repository access, no raw SQL exposure, JSON/privacy boundaries, migration idempotency, plugin-owned index baseline risks, and future allowlist handoff.
- Assignment:
  - Produce focused behavior, schema, repository, migration, current-doc, dependency, and security guidance before TDD tests.
  - Stay read-only and do not edit files.

#### Agent Outcomes

- Dewey the 2nd (`planner`) recommended a Rust-only DB module under `src-tauri/src/db/` with `db/mod.rs`, `error.rs`, `entities.rs`, `migrations.rs`, `connection.rs`, and focused repository modules for pages, metadata, events, filters, plugins, commands, and views. It recommended versioned migration `1`, deterministic repository methods, JSON stored as `TEXT`, boolean checks, useful indexes, and no Tauri builder changes except module exposure.
- Poincare the 2nd (`docs_researcher`) verified current official/primary guidance and recommended `rusqlite = { version = "0.39", features = ["bundled", "serde_json"] }`, plus `tempfile` only for file-backed tests. It rejected `tauri-plugin-sql` for TASK-013 because the plugin exposes frontend SQL and capability permissions, while Mirabilis keeps frontend DB access as operation DTOs.
- Raman the 2nd (`deprecation_auditor`) confirmed no TASK-013 Rust code existed yet, recommended backend-only `rusqlite`, warned to enable and test `PRAGMA foreign_keys = ON` per connection if foreign keys are used, required explicit `ORDER BY` in list APIs, and called out JSON double-encoding / SQL `NULL` versus JSON `null` risks.
- Epicurus the 2nd (`security_reviewer`) required migration idempotency tests, schema tests for all accepted tables, typed CRUD and append/list events, invalid JSON typed errors, SQL injection regression strings persisted literally through all string fields, no public raw `*_json: String` repository inputs, no IPC/capability/frontend changes, and no dynamic plugin-owned DDL from plugin input.

#### Parent Decisions

- Use a private Rust persistence layer with `rusqlite` for TASK-013.
- Add `tempfile` for tests if the red tests need path-backed reopen/idempotency coverage.
- Include `core_commands` and `core_views` even though one architecture SQL section omits them, because task-index acceptance and the data roadmap require them.
- Interpret plugin-owned index baseline as neutral Core support, preferably a `core_plugin_indexes` registry/support table, not concrete task/timer/habit/stats/ml business tables.
- Persist command/view descriptors and plugin manifests/settings as inert JSON/descriptors only; never handlers, React components, executable paths, dynamic imports, or plugin code.
- Keep Tauri IPC commands, `invoke_handler`, capabilities, `tauri.conf.json`, frontend NativeBridge files, Plugin API files, app data path resolution, runtime provider wiring, and NativeBridge operation allowlisting out of scope.
- Require red tests for migration idempotency/version tracking, schema columns/indexes, typed CRUD, append/list events, JSON round trips including SQL `NULL` versus JSON `null`, corrupt JSON repository errors, SQL injection regression strings, foreign key pragma behavior if applicable, deterministic list ordering, and boundary scans proving no frontend raw SQL or TASK-013 IPC exposure.

#### External Docs Verified

- Tauri SQL plugin docs and `tauri-plugin-sql` 2.4.0 docs.rs.
- `rusqlite` 0.39 docs.rs, README, and feature documentation.
- SQLx 0.8 docs and migration macro docs.
- SQLite in-memory database, `PRAGMA user_version`, PRAGMA, and foreign key documentation.
- `tempfile` docs.
- `serde_json::Value` docs.
