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

- Status: task started; pre-test guidance agents pending.
- Active agents: none.
- Next parent step: spawn pre-test guidance agents.

## Agent Handoffs

### Pre-test Guidance Round

- Status: pending agent handoff.
- Planned agents:
  - `planner` for TASK-014 scope, operation allowlist shape, test split, implementation boundaries, dependencies, and risks.
  - `docs_researcher` for current Tauri v2 command, capability, test, Rust state, and IPC guidance.
  - `deprecation_auditor` for Tauri v2 API/dependency risk, Rust/serde/rusqlite IPC integration risk, and stale patterns.
  - `security_reviewer` for IPC boundary, capability permissions, database path/state ownership, error redaction, and no-raw-SQL enforcement.
- Assignment:
  - Stay read-only and do not edit files.
  - Produce guidance for the later `test_writer` before any tests are written.
