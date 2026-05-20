# TASK-014 Agent Communication - Tauri IPC Core Persistence

## Task

- Task ID: TASK-014.
- Task name: Expose Tauri IPC commands for core persistence.
- Branch: `feat/task-014-tauri-ipc-core-persistence`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/architecture/06-filter-native-database.md#15-tauri--rust-边界`.
- `docs/architecture/07-runtime-flows.md`.
- `docs/implementation/task-index.md#task-014-expose-tauri-ipc-commands-for-core-persistence`.
- `docs/testing/strategy.md`.
- Current Tauri v2 command, capability, and test documentation must be verified before tests.

## Acceptance Criteria

- Tauri commands expose typed page, metadata, event, and filter persistence operations.
- Commands validate inputs and return typed errors.
- Frontend NativeBridge consumes these commands.
- Tauri capability changes are documented and reviewed.

## Initial Parent Interpretation

- TASK-014 is the first reviewed IPC exposure of Core persistence.
- It should use the private Rust repositories from TASK-013 rather than adding `tauri-plugin-sql`, frontend SQL, or generic SQL executors.
- NativeBridge command names and payload envelopes must match the existing TypeScript contract:
  - `db.execute(query)` -> `db_execute` with `{ query }`.
  - `db.transaction(queries)` -> `db_transaction` with `{ queries }`.
- `DbQuery` remains an operation DTO: `operation` is a Rust allowlist key and `payload` is JSON-compatible data.
- Stable boundary requirements:
  - No frontend/plugin raw SQL.
  - No `sql` / `params` shape in TypeScript `DbQuery`.
  - Tauri command failures map to typed/redacted frontend errors.
  - Tauri capability changes are explicit, documented, and security-reviewed.
- Out of scope unless agents identify a TASK-014-local-doc requirement: app bootstrap/runtime provider wiring, UI persistence flows, filesystem import/export, global shortcuts, notifications, plugin-owned business index lifecycle, release packaging, and concrete business-plugin behavior.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully with 11 agent config files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK, plus the known desktop-terminal `TERM=dumb` failure. Parent treats this as non-blocking for repository agent work because configured agents and network reachability are available.

## Current Status

- Status: review round complete; review-fix TDD needed.
- Active agents: none.
- Next parent step: spawn `test_writer` for review-fix tests.

## Agent Handoffs

### Pre-test Guidance Round

- Status: complete.
- Agents:
  - Turing the 2nd (`planner`) for TASK-014 scope, operation allowlist shape, test split, implementation boundaries, dependencies, and risks.
  - Franklin the 2nd (`docs_researcher`) for current Tauri v2 command, capability, test, Rust state, and IPC guidance.
  - Pascal the 2nd (`deprecation_auditor`) for Tauri v2 API/dependency risk, Rust/serde/rusqlite IPC integration risk, and stale patterns.
  - Herschel the 2nd (`security_reviewer`) for IPC boundary, capability permissions, database path/state ownership, error redaction, and no-raw-SQL enforcement.
- Assignment:
  - Stay read-only and do not edit files.
  - Produce guidance for the later `test_writer` before any tests are written.

#### Agent Outcomes

- Turing the 2nd (`planner`) recommended a shared TypeScript/Rust operation allowlist while keeping `DbQuery` top-level shape as `{ operation, payload? }`. Recommended operations: `core.pages.create`, `core.pages.get`, `core.pages.list`, `core.pages.update`, `core.pages.archive`, `core.metadata.set`, `core.metadata.get`, `core.metadata.listForPage`, `core.metadata.delete`, `core.events.append`, `core.events.list`, `core.filters.save`, `core.filters.get`, `core.filters.list`, and `core.filters.delete`. Recommended writes return `null`, reads return typed JSON records/lists, and `db_transaction` returns ordered per-operation results while rolling back all earlier writes on failure.
- Franklin the 2nd (`docs_researcher`) verified current Tauri v2 docs for `#[tauri::command]`, `invoke_handler`, camelCase args, serializable `Result` errors, `@tauri-apps/api/core` `invoke`, `tauri::State<T: Send + Sync + 'static>`, capabilities/ACL permissions, unstable Rust test utilities, frontend mocks, Serde `rename_all` / `deny_unknown_fields`, and `rusqlite` 0.39 connection APIs. Local versions: `tauri` 2.11.2, `tauri-build` 2.6.2, `@tauri-apps/api` 2.11.0, and `rusqlite` 0.39.0.
- Pascal the 2nd (`deprecation_auditor`) flagged P0 guardrails: do not manage `Database` directly in Tauri state because it wraps `rusqlite::Connection`, and do not expose raw SQL / `sql` / `params` / generic SQL executors. P1 guardrails: remove scaffold `greet`, use one `invoke_handler`, keep frontend invoke imports at `@tauri-apps/api/core`, use camelCase serde DTOs, avoid `unchecked_transaction`, and initialize app-owned DB state without caller-supplied paths.
- Herschel the 2nd (`security_reviewer`) required closed Rust dispatch for `db_execute` / `db_transaction`, no DB path or connection ownership through IPC, strict per-operation DTO validation with `deny_unknown_fields`, atomic `db_transaction`, typed/redacted serialized IPC errors, explicit capability review, removal of scaffold `greet`, and preserved frontend/plugin boundaries.

#### Parent Decisions

- Use one TASK-014 operation allowlist in both TypeScript and Rust. The frontend should export operation constants/type so `DbQuery.operation` is no longer broad `string`; Rust should dispatch the same strings through a closed match/enum.
- Red tests should cover the Turing operation set for pages, metadata, events, and filters. Avoid task/habit/timer/calendar business operations and plugin-owned index lifecycle.
- Include minimal Rust DB state/path ownership in TASK-014: app-managed database state with `Mutex<Database>` or a narrow service wrapper, initialized from an app-owned path with migrations applied. Do not expose any path/open/connect operation or caller-supplied database path through IPC. Leave React runtime/provider composition and UI persistence flows for TASK-015.
- `db_transaction` must be atomic and must not call `db_execute` in a way that commits partial writes. It should return ordered per-operation results.
- IPC errors must be stable typed/redacted DTOs. Do not serialize raw `DbError`, `rusqlite::Error`, debug/source details, SQL text, filesystem paths, or request payloads.
- Remove scaffold `greet` while adding reviewed commands. Keep one `invoke_handler`.
- Capability decision must be explicit and tested/documented. Prefer explicit app-command ACL for `db_execute` and `db_transaction` if practical; otherwise document and test the default custom-command exposure decision. In all cases, do not add SQL plugin, fs/path, shell, remote, broad wildcard, or unrelated permissions for DB persistence.
- Keep direct Tauri imports isolated to `src/core/native/tauri-native-bridge.ts`; plugins must not receive NativeBridge, raw invoke, database handles, native paths, or raw operation executors.
- Safe deferrals: React runtime provider/bootstrap wiring, UI persistence flows, WAL, `busy_timeout`, `PRAGMA trusted_schema = OFF`, operation-specific frontend response validation helpers, and concrete business plugin behavior.

#### External Docs Verified

- Tauri v2 command docs: `https://v2.tauri.app/develop/calling-rust/`.
- Tauri JS `@tauri-apps/api/core` invoke reference: `https://v2.tauri.app/reference/javascript/api/namespacecore/#invoke`.
- Tauri v2 state management: `https://v2.tauri.app/develop/state-management/`.
- `tauri::State` docs.rs.
- Tauri capabilities and ACL permission docs.
- Tauri v2 frontend mocking docs and Rust test utilities.
- Serde container attributes for `rename_all` and `deny_unknown_fields`.
- `rusqlite` 0.39 `Connection` / transaction APIs.

### Red Test Round

- Status: complete.
- Agent:
  - Bacon the 2nd (`test_writer`, id `019e473d-a698-7fc3-8975-ee6c95e82e8d`).
- Assignment:
  - Write failing tests only.
  - Avoid production implementation changes.
  - Cover shared operation allowlist, NativeBridge envelopes, Rust IPC command contract, temp DB state behavior, strict validation/redacted errors, transaction rollback, capability/config scans, `greet` removal, no raw SQL, and no native/plugin boundary leaks.
- Outcome:
  - Changed files: `src/test/native-bridge.test.ts`, `src-tauri/tests/ipc_boundary.rs`, and `src-tauri/tests/ipc_persistence.rs`.
  - No production code or dependency files changed.
  - Expected red checks:
    - `bun run test:frontend -- src/test/native-bridge.test.ts` fails because `DB_PERSISTENCE_OPERATIONS` is missing and 7 tests fail around operation constants.
    - `bun run typecheck` fails on missing `DB_PERSISTENCE_OPERATIONS` / `DbPersistenceOperation` exports and type leaks showing `DbQuery.operation` is still broad `string`.
    - `cargo test --manifest-path src-tauri/Cargo.toml --all-features --test ipc_boundary` fails because `greet` is still registered, `db_execute` / `db_transaction` are missing, and command exposure is not reviewed in capabilities/docs.
    - `cargo test --manifest-path src-tauri/Cargo.toml --all-features --test ipc_persistence` fails with `E0433 cannot find commands in mirabilis_lib`.
  - Green checks: `cargo fmt --manifest-path src-tauri/Cargo.toml --check` and `git diff --check`.
  - Commit: `463f23b Bacon the 2nd(test)(Expose Tauri IPC commands for core persistence): add ipc persistence acceptance tests`.

### Implementation Round

- Status: complete.
- Agent:
  - Laplace the 2nd (`implementer`, id `019e4746-d5db-7853-9550-075966adc658`).
- Ownership:
  - `src/core/native/native-bridge.ts`.
  - `src/core/native/index.ts`.
  - `src/core/index.ts`.
  - `src-tauri/src/lib.rs`.
  - New Rust command/state modules under `src-tauri/src/commands/**`.
  - `src-tauri/src/db/database.rs` and/or narrow DB helpers only if required for real transaction rollback.
  - `src-tauri/build.rs`, `src-tauri/capabilities/default.json`, and related generated/config capability files only if needed for reviewed command exposure.
  - `src-tauri/Cargo.toml` / `Cargo.lock` only if a production dependency is truly needed.
- Explicitly out of scope:
  - Test edits, docs, Plugin API, Plugin Host, UI/runtime provider, app bootstrap React code, filesystem import/export, shortcuts, notifications, business plugins, SQL plugin dependencies, and broad Tauri permissions.
- Outcome:
  - Changed files: `src/core/native/native-bridge.ts`, `src/core/native/index.ts`, `src/core/index.ts`, `src-tauri/src/commands/db.rs`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/db/database.rs`, `src-tauri/src/lib.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/default.json`, and generated app-command permission files under `src-tauri/permissions/autogenerated/`.
  - Commit: `3452616 Laplace the 2nd(implementation)(Expose Tauri IPC commands for core persistence): implement db ipc allowlist`.
  - Delivered TypeScript `DB_PERSISTENCE_OPERATIONS` / `DbPersistenceOperation`, narrowed `DbQuery.operation`, Rust `commands::db` allowlisted dispatch, `DbCommandState` with app-owned `Mutex<Database>`, pure dispatch helpers, Tauri commands `db_execute` / `db_transaction`, removal of scaffold `greet`, explicit app-command permission generation, reviewed capability entries, redacted typed IPC errors, strict DTO validation, and transaction rollback support.
  - Parent repeated focused green checks: `bun run test:frontend -- src/test/native-bridge.test.ts`, `bun run typecheck`, `cargo test --manifest-path src-tauri/Cargo.toml --all-features --test ipc_boundary`, `cargo test --manifest-path src-tauri/Cargo.toml --all-features --test ipc_persistence`, `cargo test --manifest-path src-tauri/Cargo.toml --all-features sqlite`, `cargo fmt --manifest-path src-tauri/Cargo.toml --check`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings`, and `git diff --check`.

### Review Round 1

- Status: complete.
- Agents:
  - Helmholtz the 2nd (`pr_explorer`) for changed-surface and hotspot mapping.
  - Popper the 2nd (`reviewer`) for correctness.
  - Euclid the 2nd (`deprecation_auditor`) for API/deprecation risk.
  - Mencius the 2nd (`security_reviewer`) for IPC/capability/security boundaries.
  - Rawls the 2nd (`docs_researcher`) for docs/current-guidance review.
  - Pauli the 2nd (`test_quality_reviewer`) for test quality.
- Deferred:
  - `doc_writer` could not be spawned initially because the agent thread limit was reached. Parent will spawn it after a review slot is available.
- Assignment:
  - Stay read-only and do not edit files.
  - Review commits `463f23b` and `3452616` against TASK-014 acceptance, local docs, and current official guidance.
- Outcomes:
  - Helmholtz the 2nd (`pr_explorer`) found no scope creep or suspicious changed paths. Hotspots: duplicated TypeScript/Rust operation allowlists, manual transaction helper, generated permissions synchronization, and string-scan boundary tests.
  - Mencius the 2nd (`security_reviewer`) found no P0/P1/P2 security findings. Residual risks: Tauri app-command capability is per main window, so future untrusted plugin code must remain away from raw `invoke` / `NativeBridge`; existing `tauri.conf.json` has preexisting `csp: null`.
  - Popper the 2nd (`reviewer`) found one P1: `core.metadata.get` / `core.metadata.delete` dispatch by row `id`, but Core metadata access is documented by `(pageId, namespace, key)` and TASK-013 repositories expose logical-key methods. Popper also found P2s: missing-target page update/archive and metadata/filter delete silently succeed, and payload validation accepts whitespace/empty identities, arbitrary metadata `valueType` mismatches, and arbitrary filter query/sort/group JSON.
  - Pauli the 2nd (`test_quality_reviewer`) found one P1: `ipc_boundary.rs` capability exposure checks raw capability text for command names, which can false-pass because command names appear in descriptions; tests should parse permissions and verify generated TOML maps allow IDs to `commands.allow`. Pauli also found P2s for insufficient per-operation validation coverage and brittle long-lived command-registration scans.
  - Euclid the 2nd (`deprecation_auditor`) found no P0/P1 API findings. P2s: prefer a `&mut self` `rusqlite::Connection::transaction_with_behavior(TransactionBehavior::Immediate)` helper or transaction facade over raw `BEGIN IMMEDIATE` on `&self`; keep `commands` module private rather than public crate API if possible; type frontend `db.transaction` as returning ordered arrays rather than unconstrained `Promise<Response>`.
  - Rawls the 2nd (`docs_researcher`) found no P0/P1 current-guidance issues. P2 docs drift: architecture docs still show `DbQuery.operation: string`; docs do not describe the 15-operation allowlist, Rust `INVALID_REQUEST` / `PERSISTENCE_FAILED` error DTOs, ordered transaction result arrays, rollback semantics, app-owned `app_data_dir()/mirabilis.sqlite3`, app-command ACL generation, or capability grants.
  - Focused checks run by agents passed: NativeBridge frontend test, `typecheck`, `lint`, IPC boundary/persistence tests, SQLite tests, Rust fmt/clippy, and diff checks in various combinations.

#### Parent Decisions After Review Round 1

- Run a delegated review-fix TDD loop before merge.
- `test_writer` should add failing tests for:
  - metadata get/delete by logical key payloads (`pageId`, `namespace`, `key`) and no row-id-only metadata IPC contract;
  - missing-target page update/archive and metadata/filter delete returning typed errors and rolling back transactions;
  - stricter payload validation for empty/whitespace IDs and representative metadata/filter semantic mismatches;
  - capability tests parsing `permissions` and generated `src-tauri/permissions/autogenerated/*.toml` `commands.allow` instead of matching descriptions;
  - frontend `db.transaction` typed as ordered result arrays;
  - preferably reduced brittleness in command registration scans while keeping TASK-014 scope guard.
- `implementer` should then update Rust/TS production code, including logical-key metadata dispatch, not-found errors, validation, transaction helper/module visibility/API typing as needed.
- Defer docs patching until after review-fix behavior stabilizes, then update architecture/runtime/testing docs.

### Review-Fix Test Round

- Status: pending agent handoff.
- Planned agent:
  - `test_writer` for review-fix red tests.
- Assignment:
  - Write failing tests only.
  - Do not edit production implementation.
