# TASK-046 - Wire SQLite-backed Runtime Persistence

## Orchestration State

- Started: 2026-06-14 18:29 CST.
- Branch: `feat/task-046-runtime-sqlite-persistence`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Status: started; parent is preparing pre-test agent guidance.

## Scope

- Wire runtime stores for pages, metadata, events, and filters to hydrate from SQLite through the existing allowlisted NativeBridge DB operations.
- Wire runtime store writes for pages, metadata, events, and filters through the same allowlisted NativeBridge DB operations.
- Update `storage.persistence` so it no longer reports `in-memory-core` when SQLite-backed runtime persistence is active.
- Preserve plugin-facing owner boundaries: no plugin or hosted UI may receive NativeBridge, raw SQLite, filesystem paths, SQL, full runtime handles, raw stores, or unrestricted DB facades.
- Keep startup, NativeBridge, IPC, and persistence errors typed and redacted.
- Preserve documented transaction rollback and result-order semantics across the async bridge.

## Constraints

- Parent remains orchestration-only and must wait for child-agent completion/final status before dependent steps.
- Tests must be written before production implementation.
- Native/IPC/runtime persistence work requires security review and final `bun run check:full` unless a review-backed reason to narrow the gate is recorded.
- Do not add `tauri-plugin-sql`, raw frontend SQL, caller-supplied DB paths, generic SQL DTOs, filesystem import/export, shortcuts, notifications, sync transport, provider secrets, network, package dependencies, schema migrations beyond the task scope, or release process changes unless agents identify a documented blocker and the parent records the decision first.

## Source Docs

- `docs/implementation/task-index.md#TASK-046`
- `docs/architecture/06-filter-native-database.md`
- `docs/architecture/07-runtime-flows.md`
- `docs/development/01-data-roadmap-and-mvp.md`
- `docs/testing/strategy.md`

## Parent Decisions

- Treat TASK-046 as the persistence foundation for later navigation, search FTS, settings, sync, and feed tasks.
- Preserve existing TASK-014 NativeBridge DB allowlist: `core.pages.*`, `core.metadata.*`, `core.events.*`, and `core.filters.*`.
- Reuse current NativeBridge DTO contract and redacted `NativeBridgeError` behavior.
- Do not broaden plugin or UI access to native handles; runtime-facing persistence must remain behind trusted Core/bootstrap code.
- Delegate docs research for current official Tauri command/capability/path guidance and current `rusqlite` transaction guidance before red tests.

## Validation

- 2026-06-14 18:29 CST: branch created from `master` commit `60c7e06`.
- 2026-06-14 18:29 CST: 11 project agent TOML files parsed successfully.
- 2026-06-14 18:29 CST: `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/network/websocket OK, with known unrestricted-sandbox notes and known `TERM=dumb` terminal failure.

## Agent Notes

- Pending pre-test guidance delegation.

## Next Action

- Delegate pre-test planning, official docs research, security boundary guidance, and deprecation/API guidance; then wait for final statuses before test writing.
