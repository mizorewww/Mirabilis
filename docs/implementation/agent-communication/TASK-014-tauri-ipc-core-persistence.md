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

- Status: pre-test guidance complete; parent decisions recorded.
- Active agents: none.
- Next parent step: spawn `test_writer` for red tests.

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

- Status: pending agent handoff.
- Planned agent:
  - `test_writer` for Rust IPC/capability tests and frontend NativeBridge operation allowlist tests.
- Assignment:
  - Write failing tests only.
  - Avoid production implementation changes.
