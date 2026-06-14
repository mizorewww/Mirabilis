# TASK-046 - Wire SQLite-backed Runtime Persistence

## Orchestration State

- Started: 2026-06-14 18:29 CST.
- Branch: `feat/task-046-runtime-sqlite-persistence`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Status: red tests are validated; parent is preparing the test commit.

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

- Mendel (`planner`, agent `019ec5af-e817-7bd0-a143-e2ec3f5c0977`) was spawned at 2026-06-14 18:31 CST for TASK-046 implementation slicing and TDD plan.
- Kepler (`docs_researcher`, agent `019ec5af-fd6c-7b33-aeb9-a01c8585554d`) was spawned at 2026-06-14 18:31 CST for current official Tauri command/capability/path/state guidance and `rusqlite` transaction guidance.
- Linnaeus (`security_reviewer`, agent `019ec5af-ffda-7232-8825-34825fb124bf`) was spawned at 2026-06-14 18:31 CST for Tauri/IPC/NativeBridge/plugin-boundary security guidance.
- Hubble (`deprecation_auditor`, agent `019ec5b0-1579-7783-a631-379954e34c0e`) was spawned at 2026-06-14 18:31 CST for stale/deprecated API and version guidance.
- Linnaeus returned final status with security guidance and no file edits. It identified P0 red-test targets for exact 15-operation DB allowlist, no raw SQL/params/db path/generic executor fields, no NativeBridge/raw DB exposure through plugins or hosted UI, owner-boundary preservation after hydration/restart, atomic `db_transaction` rollback and ordered results, redacted startup/IPC/persistence errors, and Rust-owned app data DB path.
- Kepler returned final status with docs research and no upstream docs blocker. It verified official Tauri command/state/capability/path guidance and `rusqlite` transaction guidance. It confirmed `rusqlite::Transaction::new_unchecked(..., TransactionBehavior::Immediate)` remains valid in 0.39 for the current single app-owned DB state, and rollback-on-drop is documented. Official docs consulted include Tauri calling Rust, state management, permissions, capabilities, path API, Manager/PathResolver/AppManifest docs.rs, and rusqlite Connection/Transaction/TransactionBehavior docs.
- Hubble returned final status with no P0 deprecated API blockers. It flagged P1 design risks: synchronous Core/plugin store APIs conflict with async NativeBridge persistence, `FilterStore.update()` has no matching DB allowlist operation, and current transaction manager only works with in-memory transaction participants. It confirmed local versions `@tauri-apps/api@2.11.0`, `@tauri-apps/cli@2.11.2`, React `19.2.6`, Vite `7.3.3`, Vitest `4.1.6`, RTL `16.3.2`, user-event `14.6.1`, Tauri `2.11.2`, and `rusqlite@0.39.0`.
- Mendel returned final status with the accepted implementation slice: hydrate pages, metadata, events, and filters during `createAppRuntime()` from the existing NativeBridge DB allowlist; use hydrated synchronous Core stores for reads; route production durable writes through an awaited async persisted transaction path using `NativeBridge.db.transaction`; keep plugin facades intact; and change the runtime storage marker only when SQLite-backed runtime persistence is active.
- Parent decision: accept Mendel's slice for red tests. Full async Core Store API migration, arbitrary direct sync store write-through outside `transaction.run`, new DB operations such as global metadata list, WAL/busy_timeout/trusted_schema, FTS, plugin settings, route state, sync, keychain, shortcuts, and filesystem import/export remain deferred unless a child agent reports a blocker/final failure requiring scope reconsideration.
- Russell (`test_writer`, agent `019ec5b5-f552-7d73-8352-a7122c635240`) was spawned at 2026-06-14 18:38 CST to add failing TASK-046 tests only. Expected coverage: startup hydration, `storage.persistence` marker, transaction-backed durable writes/rollback, filter update persistence strategy, plugin facade owner boundaries, redacted startup/bridge failures, and static native/raw DB guardrails.
- Russell returned final status with test-only changes in `src/test/runtime-sqlite-persistence.test.ts`.
- Parent red validation matched the expected missing TASK-046 behavior: `bun run test:frontend -- src/test/runtime-sqlite-persistence.test.ts src/test/app-bootstrap-runtime.test.ts src/test/runtime-provider.test.tsx` failed with 7 new TASK-046 failures and 14 passing tests. Expected failures cover absent startup hydration, absent SQLite persistence marker, no native transaction call, rollback rejection not surfacing, missing filter hydration/update persistence strategy, missing durable plugin transaction batch, and startup hydration failure not redacting through the provider alert.
- Supporting checks passed: `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts src/test/native-bridge.test.ts` passed with 65 tests; `cargo test --manifest-path src-tauri/Cargo.toml --all-features --test ipc_persistence` passed with 13 tests; `bun run typecheck`, `bun run lint`, and `git diff --check` passed.

## Next Action

- Commit Russell's red tests, then delegate implementation to `implementer`.
