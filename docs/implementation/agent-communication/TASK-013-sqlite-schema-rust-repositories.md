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

- Status: final P2 cleanup test agent running.
- Active agents:
  - Lovelace the 2nd (`test_writer`, id `019e4713-3b05-7f52-a3f2-765b08d583ab`).
- Next parent step: wait for Lovelace the 2nd, review the test patch, run focused checks, then commit if the red signal is clean.

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

### Red Test Round

- Status: complete.
- Agent:
  - Einstein the 2nd (`test_writer`, id `019e46ec-db58-7e33-a0c3-a778b295a5ab`).
- Ownership:
  - Rust acceptance tests, preferably under `src-tauri/tests/`.
  - `src-tauri/Cargo.toml` only for test-only dev-dependencies if required.
  - `src-tauri/Cargo.lock` only as a consequence of test-only dependency resolution.
- Explicitly out of scope:
  - Production Rust implementation under `src-tauri/src/`.
  - Tauri IPC commands, `invoke_handler` changes, capabilities, `tauri.conf.json`, frontend NativeBridge files, Plugin API files, app bootstrap wiring, `tauri-plugin-sql`, `sqlx`, and business plugin index tables.
- Required red-test coverage:
  - Migration idempotency/version tracking on a temp/file-backed database.
  - Schema tables/columns/indexes for pages, metadata, events, filters, plugins, commands, views, and neutral plugin-owned index baseline support.
  - Typed table-specific repositories, not a generic SQL executor.
  - JSON round trips through `serde_json::Value`, including SQL `NULL` versus JSON `null` where applicable.
  - Corrupt JSON typed errors.
  - SQL injection regression strings persisted literally with tables still intact.
  - Deterministic list ordering.
  - Boundary scans proving no frontend raw SQL package, no TASK-013 IPC command exposure, no capability additions, and no SQL-shaped TypeScript `DbQuery`.
- Outcome:
  - Changed files: `src-tauri/tests/sqlite_repositories.rs`, `src-tauri/tests/sqlite_boundary.rs`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`.
  - Commit: `3092b67 Einstein the 2nd(test)(Add SQLite schema and Rust repositories): add sqlite repository acceptance tests`.
  - Expected red check: `cargo test --manifest-path src-tauri/Cargo.toml --all-features sqlite` fails because `mirabilis_lib::db` is missing.
  - Green checks: `cargo test --manifest-path src-tauri/Cargo.toml --all-features --test sqlite_boundary sqlite`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, and `git diff --check`.
  - Test-surface assumptions for implementation: public Rust surface under `mirabilis_lib::db`; `DbError::InvalidJson { table, column, record_id, .. }`; migration `001_core_schema`; schema version `1`; migration ledger table `core_schema_migrations`; event repository is append/get/list oriented.

### Implementation Round

- Status: complete.
- Agent:
  - James the 2nd (`implementer`, id `019e46f5-1b48-7de0-9a0a-48420cc3740f`).
- Ownership:
  - Production Rust DB layer under `src-tauri/src/db/`.
  - `src-tauri/src/lib.rs` only for module exposure if needed.
  - `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock` only for moving/adding production `rusqlite` dependency and keeping `tempfile` test-only.
- Explicitly out of scope:
  - Test edits unless a blocker is reported first.
  - Frontend files, NativeBridge files, Plugin API files, docs, capabilities, `tauri.conf.json`, package files, app bootstrap/provider wiring, Tauri IPC commands, `invoke_handler` changes, `tauri-plugin-sql`, `sqlx`, and concrete business plugin index tables.
- Target checks:
  - `cargo test --manifest-path src-tauri/Cargo.toml --all-features sqlite`.
  - `cargo fmt --manifest-path src-tauri/Cargo.toml --check`.
  - `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`.
  - `git diff --check`.
- Outcome:
  - Changed files: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/src/db/mod.rs`, `src-tauri/src/db/database.rs`, `src-tauri/src/db/error.rs`, `src-tauri/src/db/migrations.rs`, `src-tauri/src/db/repositories.rs`, and `src-tauri/src/db/types.rs`.
  - Commit: `ef3583c James the 2nd(implementation)(Add SQLite schema and Rust repositories): implement core sqlite repositories`.
  - Delivered `mirabilis_lib::db` with `Database`, `DbError`, migration helpers, typed records/DTOs, and table-specific repositories for the accepted Core tables.
  - Delivered schema version `1` / `001_core_schema`, `core_schema_migrations`, `PRAGMA user_version`, and neutral `core_plugin_indexes` baseline table.
  - Parent repeated green checks: `cargo test --manifest-path src-tauri/Cargo.toml --all-features sqlite`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`, and `git diff --check`.

### Focused Re-Review Round

- Status: complete.
- Agents:
  - Copernicus the 2nd (`reviewer`) for correctness re-review.
  - Erdos the 2nd (`security_reviewer`) for security/boundary re-review.
  - Bohr the 2nd (`deprecation_auditor`) for API/deprecation re-review.
  - Boole the 2nd (`docs_researcher`) for docs/current-guidance re-review.
  - Archimedes the 2nd (`test_quality_reviewer`) for test-quality re-review.
- Assignment:
  - Stay read-only and do not edit files.
  - Focus on review-fix commits `daa4385`, `97ee8b2`, and `ca2c461`, especially whether the prior P1s are cleared and whether the targeted P2 fixes introduced regressions.
- Outcomes:
  - Copernicus the 2nd (`reviewer`) found no P0/P1 correctness findings. P2: changed v1 schema still uses the prior checksum so older branch-local v1 DBs without the `core_plugin_indexes` FK can pass validation; future ledger rows greater than `LATEST_SCHEMA_VERSION` are not rejected when `PRAGMA user_version` is stale/lower.
  - Erdos the 2nd (`security_reviewer`) found no P0/P1 security findings. P2: `sqlite_boundary.rs` should not require `operation: string`, because TASK-014 may narrow operations to an allowlisted type, and capability permission scanning should not assume all permission entries are strings.
  - Bohr the 2nd (`deprecation_auditor`) found no P0/P1 API/deprecation findings. P2: migration 001 should use an immutable `MIGRATION_001_VERSION` constant instead of coupling validation to `LATEST_SCHEMA_VERSION`.
  - Boole the 2nd (`docs_researcher`) found no P0/P1/P2 docs drift. It verified docs match `core_commands`, `core_views`, `core_plugin_indexes` FK, private Rust `rusqlite` layer, migration ledger/user_version, and TASK-014 boundaries.
  - Archimedes the 2nd (`test_quality_reviewer`) confirmed the prior P1 boundary-test issue is fixed. P2: `core_plugin_indexes` FK coverage checks declaration but not `ON DELETE CASCADE` behavior.

#### Parent Decisions After Focused Re-Review

- Run a final delegated P2 cleanup loop before local gate.
- Test cleanup targets:
  - Assert `core_plugin_indexes` FK has cascade behavior, not just a declaration.
  - Keep `sqlite_boundary.rs` focused on no raw SQL fields / no `tauri-plugin-sql`; do not freeze `DbQuery.operation` to `string`.
  - Make capability permission scans tolerate future reviewed non-SQL object permissions while still rejecting SQL plugin permissions.
  - Add red checks for old v1 checksum/schema drift and future ledger rows with stale/lower `PRAGMA user_version`.
  - Match specific migration error variants where useful.
- Implementation cleanup targets:
  - Introduce immutable `MIGRATION_001_VERSION`.
  - Update migration 001 checksum to reflect the final v1 schema.
  - Reject future ledger versions independent of `PRAGMA user_version`.

### Final P2 Cleanup Test Round

- Status: running.
- Agent:
  - Lovelace the 2nd (`test_writer`, id `019e4713-3b05-7f52-a3f2-765b08d583ab`).
- Ownership:
  - `src-tauri/tests/sqlite_repositories.rs`.
  - `src-tauri/tests/sqlite_boundary.rs`.
- Assignment:
  - Strengthen FK cascade behavior coverage for `core_plugin_indexes`.
  - Relax boundary scans so TASK-014 can narrow `DbQuery.operation` and add reviewed non-SQL object permissions.
  - Add red checks for old v1 checksum/schema drift, future ledger rows, and specific migration error variants.
  - Scope preserved: no IPC commands, Tauri capabilities, frontend wiring, NativeBridge changes, Plugin API changes, `tauri-plugin-sql`, `sqlx`, app data path resolution, or business plugin index tables.

### Review Round 1

- Status: complete.
- Agents:
  - Hegel the 2nd (`pr_explorer`) for changed-surface and hotspot mapping.
  - Galileo the 2nd (`reviewer`) for correctness.
  - Hooke the 2nd (`deprecation_auditor`) for API/deprecation/dependency risks.
  - Faraday the 2nd (`security_reviewer`) for persistence boundary/security.
  - Plato the 2nd (`docs_researcher`) for current docs and local docs drift.
  - Heisenberg the 2nd (`test_quality_reviewer`) for test quality.
  - Wegener the 2nd (`doc_writer`) for documentation gaps.
- Deferred:
  - `doc_writer` could not be spawned initially because the agent thread limit was reached. Parent spawned Wegener the 2nd after Faraday the 2nd completed.
- Assignment:
  - Stay read-only and do not edit files.
  - Review commits `3092b67` and `ef3583c` against TASK-013 acceptance, local docs, and current official/primary guidance.
- Partial outcome:
  - Faraday the 2nd (`security_reviewer`) found no P0/P1/P2 security or boundary issues. It confirmed the DB layer remains Rust-only, repository SQL is table-specific/static with bound values, migrations use fixed SQL, `core_plugin_indexes` is an inert registry baseline, `DbError` display is redacted, corrupt JSON becomes typed `InvalidJson`, and temp DB tests stay in `tempfile` paths. Residual TASK-014 handoff risks: constrain DB path selection and avoid exposing `DbError` debug/source details through IPC.
- Final outcomes:
  - Hegel the 2nd (`pr_explorer`) found no scope creep. Hotspots: `core_plugin_indexes` is schema-only, list option APIs cannot distinguish no-filter from NULL filters, logical-key upserts may conflict, migration ledger drift is not verified, and CRUD is intentionally partial for events/plugin index baseline.
  - Galileo the 2nd (`reviewer`) found one P1 correctness issue: `MetadataRepository::upsert` conflicts on `id` while Core metadata identity is `(page_id, namespace, key)`. A second set with a new id for the same key fails instead of replacing the metadata. Galileo also found P2 issues for migration checksum/version drift and upserts overwriting `created_at` / `installed_at`.
  - Hooke the 2nd (`deprecation_auditor`) found no P0/P1 API/deprecation issues and one P2 migration-integrity issue: migration ledger rows are not checksum/name validated and migration steps are not transactional. It verified current `rusqlite 0.39` usage and no `tauri-plugin-sql`, `sqlx`, SQL capability permission, or raw frontend SQL route.
  - Plato the 2nd (`docs_researcher`) found no P0/P1 docs/current-guidance issues. P2 gaps: architecture schema omits `core_commands`, `core_views`, and `core_plugin_indexes`; `core_plugin_indexes.plugin_id` ownership is not documented/enforced; `trusted_schema` hardening is not documented.
  - Heisenberg the 2nd (`test_quality_reviewer`) found one P1 test-quality issue: `sqlite_boundary.rs` encodes TASK-013's temporary no-IPC/no-capability state as a long-lived invariant that would block TASK-014. P2 test gaps include missing literal round-trip assertions for injection strings, weak update/upsert observable assertions, over-specific index/ledger assertions, and brittle `DbQuery` string parsing.
  - Wegener the 2nd (`doc_writer`) recommended P1 architecture docs sync for implemented schema/repositories, `core_commands`, `core_views`, `core_plugin_indexes`, migration ledger, private `rusqlite` layer, and explicit TASK-013 out-of-scope IPC/capability/frontend wiring. Wegener also recommended P2 development/testing docs updates.

#### Parent Decisions After Review Round 1

- Fix P1s before merge:
  - Adjust `sqlite_boundary.rs` so stable no-frontend-raw-SQL / no `tauri-plugin-sql` guards remain, but TASK-014 can legally add reviewed DB IPC/capability changes.
  - Add red tests and implementation for metadata logical-key behavior by `(page_id, namespace, key)`.
- Include targeted P2s in the review-fix loop:
  - Add tests/implementation for migration checksum/name and future-version drift detection.
  - Preserve creation/install timestamps on metadata/filter/plugin upsert updates.
  - Strengthen injection literal and update/upsert observable assertions.
  - Add `core_plugin_indexes.plugin_id` ownership FK unless the implementer reports a concrete migration/design blocker.
- Delegate docs sync before merge:
  - Update architecture docs for `core_schema_migrations`, `core_commands`, `core_views`, neutral `core_plugin_indexes`, private Rust `rusqlite` repositories, migration ledger/user_version, and TASK-013 out-of-scope boundaries.
  - Update development/testing docs only if the docs agent can do it without broadening beyond TASK-013.
- Defer to TASK-014/bootstrap unless escalated by re-review:
  - `PRAGMA trusted_schema = OFF`, app DB path ownership, WAL/busy timeout, and list APIs that distinguish no-filter from SQL NULL filters.

### Review-Fix Test Round

- Status: complete.
- Agent:
  - Dalton the 2nd (`test_writer`, id `019e4702-a9e1-73b0-bbf8-10791d21ac54`).
- Ownership:
  - `src-tauri/tests/sqlite_repositories.rs`.
  - `src-tauri/tests/sqlite_boundary.rs`.
- Assignment:
  - Remove the long-lived no-DB-IPC/no-capability assertions that would block TASK-014 while preserving stable no-frontend-raw-SQL / no `tauri-plugin-sql` guards.
  - Add red tests for metadata logical-key behavior by `(page_id, namespace, key)`.
  - Add targeted tests for migration drift detection, timestamp preservation, injection literal assertions, observable upsert replacement, and `core_plugin_indexes` ownership FK.
- Outcome:
  - Changed files: `src-tauri/tests/sqlite_repositories.rs` and `src-tauri/tests/sqlite_boundary.rs`.
  - Commit: `daa4385 Dalton the 2nd(test)(Add SQLite schema and Rust repositories): cover review fix expectations`.
  - Expected red check: `cargo test --manifest-path src-tauri/Cargo.toml --all-features sqlite` fails because `MetadataRepository` lacks `get_by_logical_key` and `delete_by_logical_key`.
  - Green checks: `cargo test --manifest-path src-tauri/Cargo.toml --all-features --test sqlite_boundary sqlite`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, and `git diff --check`.

### Docs Sync Round

- Status: complete.
- Agent:
  - Arendt the 2nd (`doc_writer`, id `019e4702-c094-7e60-8a0a-fcdc4cd7b04f`).
- Ownership:
  - `docs/architecture/06-filter-native-database.md`.
  - `docs/development/01-data-roadmap-and-mvp.md`.
  - `docs/testing/strategy.md`.
- Assignment:
  - Sync architecture/development/testing docs to TASK-013's private Rust `rusqlite` repository layer, implemented schema, migration ledger/user_version, neutral plugin index baseline, and out-of-scope TASK-014 boundaries.
- Outcome:
  - Changed files: `docs/architecture/06-filter-native-database.md`, `docs/development/01-data-roadmap-and-mvp.md`, and `docs/testing/strategy.md`.
  - Arendt's patch was reconciled after Beauvoir added the `core_plugin_indexes.plugin_id` foreign key.
  - Commit: `ca2c461 Arendt the 2nd(docs)(Add SQLite schema and Rust repositories): sync sqlite persistence docs`.

### Review-Fix Implementation Round

- Status: complete.
- Agent:
  - Beauvoir the 2nd (`implementer`, id `019e4709-70c9-77d2-949f-e61df480eb37`).
- Ownership:
  - `src-tauri/src/db/**`.
- Assignment:
  - Implement metadata logical-key behavior and methods expected by Dalton's red tests.
  - Reject migration checksum/name drift and future `user_version` without downgrading.
  - Preserve metadata/filter/plugin creation or install timestamps on updates.
  - Add `core_plugin_indexes.plugin_id REFERENCES core_plugins(id) ON DELETE CASCADE`.
  - Preserve scope boundaries: no tests, docs, Cargo files, IPC commands, capabilities, frontend, NativeBridge, Plugin API, or app bootstrap changes.
- Outcome:
  - Changed files: `src-tauri/src/db/error.rs`, `src-tauri/src/db/migrations.rs`, and `src-tauri/src/db/repositories.rs`.
  - Commit: `97ee8b2 Beauvoir the 2nd(review-fix)(Add SQLite schema and Rust repositories): address repository review findings`.
  - Delivered metadata logical-key upsert/get/delete, migration future-version and checksum/name drift errors, timestamp preservation for metadata/filter/plugin upsert updates, and `core_plugin_indexes.plugin_id` FK to `core_plugins(id)`.
  - Parent repeated green checks: `cargo test --manifest-path src-tauri/Cargo.toml --all-features sqlite`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`, and `git diff --check`.
