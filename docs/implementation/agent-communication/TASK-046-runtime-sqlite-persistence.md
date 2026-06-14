# TASK-046 - Wire SQLite-backed Runtime Persistence

## Orchestration State

- Started: 2026-06-14 18:29 CST.
- Branch: `feat/task-046-runtime-sqlite-persistence`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Status: targeted follow-up implementation committed; focused re-review is next.

## Scope

- Wire runtime stores for pages, metadata, events, and filters to hydrate from SQLite through the existing allowlisted NativeBridge DB operations.
- Wire transaction-managed runtime and plugin writes for pages, metadata, events, and filters through the same allowlisted NativeBridge DB operations.
- Cover reviewed direct runtime page writes and plugin-facing direct Core store writes through the Core persistence path without exposing native handles.
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
- Parent decision: accept Mendel's slice for red tests. Full async Core Store API migration, arbitrary future direct store surfaces outside the reviewed runtime/plugin paths, new DB operations such as global metadata list, WAL/busy_timeout/trusted_schema, FTS, plugin settings, route state, sync, keychain, shortcuts, and filesystem import/export remain deferred unless a child agent reports a blocker/final failure requiring scope reconsideration.
- Russell (`test_writer`, agent `019ec5b5-f552-7d73-8352-a7122c635240`) was spawned at 2026-06-14 18:38 CST to add failing TASK-046 tests only. Expected coverage: startup hydration, `storage.persistence` marker, transaction-backed durable writes/rollback, filter update persistence strategy, plugin facade owner boundaries, redacted startup/bridge failures, and static native/raw DB guardrails.
- Russell returned final status with test-only changes in `src/test/runtime-sqlite-persistence.test.ts`.
- Parent red validation matched the expected missing TASK-046 behavior: `bun run test:frontend -- src/test/runtime-sqlite-persistence.test.ts src/test/app-bootstrap-runtime.test.ts src/test/runtime-provider.test.tsx` failed with 7 new TASK-046 failures and 14 passing tests. Expected failures cover absent startup hydration, absent SQLite persistence marker, no native transaction call, rollback rejection not surfacing, missing filter hydration/update persistence strategy, missing durable plugin transaction batch, and startup hydration failure not redacting through the provider alert.
- Supporting checks passed: `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts src/test/native-bridge.test.ts` passed with 65 tests; `cargo test --manifest-path src-tauri/Cargo.toml --all-features --test ipc_persistence` passed with 13 tests; `bun run typecheck`, `bun run lint`, and `git diff --check` passed.
- Russell's red tests were committed in `d710e94` (`Russell(test)(Wire SQLite-backed Runtime Persistence): add runtime persistence red tests`).
- Gibbs (`implementer`, agent `019ec5be-77a8-73a0-8180-d71c75e63824`) was spawned at 2026-06-14 18:47 CST to make Russell's red tests pass with minimum production changes.
- Gibbs returned final status with production changes in `src/bootstrap/create-app-runtime.ts`, `src/core/runtime/sqlite-persistence.ts`, `src/core/services/index.ts`, `src/core/services/transaction-manager.ts`, and `src-tauri/src/commands/db.rs`.
- Commit `41d8dd3` (`Gibbs(implementation)(Wire SQLite-backed Runtime Persistence): add sqlite runtime persistence`) records the implementation.
- Parent implementation validation passed: `bun run test:frontend -- src/test/runtime-sqlite-persistence.test.ts src/test/app-bootstrap-runtime.test.ts src/test/runtime-provider.test.tsx` passed with 21 tests; `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts src/test/native-bridge.test.ts` passed with 65 tests; `cargo test --manifest-path src-tauri/Cargo.toml --all-features --test ipc_persistence` passed with 13 tests; `bun run typecheck`, `bun run lint`, and `git diff --check` passed.
- Aristotle (`pr_explorer`, agent `019ec5c7-94a3-7b32-abe0-0f00cb10833b`) was spawned at 2026-06-14 18:57 CST to map TASK-046 branch diff and risk hotspots.
- Dalton (`reviewer`, agent `019ec5c7-9756-7370-9e35-b32756017499`) was spawned at 2026-06-14 18:57 CST for correctness review.
- Nietzsche (`security_reviewer`, agent `019ec5c7-99e1-7ca1-b24e-793018402cfb`) was spawned at 2026-06-14 18:57 CST for security/native/IPC/plugin-boundary review.
- Hume (`deprecation_auditor`, agent `019ec5c7-9d14-7832-84b0-eaa8ecd364b8`) was spawned at 2026-06-14 18:57 CST for stale/deprecated API review.
- Godel (`docs_researcher`, agent `019ec5c7-a017-7f61-a405-6a538111e3d3`) was spawned at 2026-06-14 18:57 CST for docs sync review.
- Dirac (`test_quality_reviewer`, agent `019ec5c7-a377-7560-a463-c3445ac899ff`) was spawned at 2026-06-14 18:57 CST for test-quality review.
- `release_checker` spawn hit the current agent thread limit and will be retried after capacity frees.
- Aristotle returned final status with no file edits. It mapped the TASK-046 diff and highlighted the key risk surfaces: direct non-transaction App Shell/plugin writes, N+1 page metadata hydration, stale docs, and the still-required `check:full` gate.
- Hume returned final status with no P0/P1/P2 deprecation or API findings. It verified current Tauri v2 invoke/state/permissions/capabilities patterns, `rusqlite` 0.39 transaction compatibility, the event `type` alias, and ran focused frontend/native checks plus Rust fmt and diff-check.
- Dalton returned final status with one P1 correctness finding: direct App Shell Home creation and editor saves still use live runtime stores outside `transaction.run`, so fresh-DB pages can exist only in memory and later SQLite-backed transactions against them fail. Dalton also found P2s for missing archived-page hydration, filter update `get + save` not enforcing native update semantics, and an async interleaving window between live snapshot conflict check and live-state replacement.
- Nietzsche returned final status with one P1 security/persistence-boundary finding: plugin-facing direct store facades can bypass SQLite persistence and native transaction rollback because persistence wrapping only applies inside `transaction.run`. Nietzsche also found a P2 that native hydration response validation is too permissive and should fail closed instead of silently accepting null/undefined or malformed records.
- Dirac returned final status with P1 test-quality gaps: startup hydration coverage is too shallow, and durable transaction tests do not cover `pages.update`, `pages.archive`, `metadata.delete`, or `filters.delete`. Dirac also found a P2 brittle exact hydration-order assertion.
- Godel returned final status with no P0 but docs P1 findings: runtime-flow, native-database, development roadmap, and testing-strategy docs still describe the old in-memory bootstrap/runtime persistence model. Godel also found P2 wording drift in the task index and task communication notes around delivered write-through scope.
- Parent decision: TASK-046 is not merge-ready. Delegate review-fix red tests before production fixes for the Dalton/Nietzsche/Dirac P1s, then delegate implementation, then delegate docs sync for Godel's P1/P2. Do not merge until P1s are fixed, targeted re-review is clean, `release_checker` has run, and `bun run check:full` passes.
- Completed review agents were closed after their final statuses were recorded in the communication files.
- Kant (`test_writer`, agent `019ec5cd-18c1-7af0-a3d1-f9301305134c`) was spawned at 2026-06-14 19:03 CST for review-fix red tests only. Test targets: direct App/plugin persistence bypass, full hydration field preservation, transaction write-through for `pages.update`, `pages.archive`, `metadata.delete`, and `filters.delete`, and adjacent P2s where natural.
- Kant returned final status with test-only changes in `src/test/runtime-sqlite-persistence.test.ts`. Commit `50cfe52` (`Kant(test-fix)(Wire SQLite-backed Runtime Persistence): add persistence review-fix coverage`) records the test changes.
- Parent red validation confirmed the intended state: `bun run test:frontend -- src/test/runtime-sqlite-persistence.test.ts src/test/app-bootstrap-runtime.test.ts src/test/runtime-provider.test.tsx` failed with 3 failures and 23 passing tests. Failures cover missing direct runtime page create native transaction, missing plugin direct write native transaction batch, and null native hydration responses starting successfully instead of failing closed. `git diff --check` passed and an exact `.only` / `.skip` scan found no matches.
- Kant was closed after final status and red validation were recorded.
- Erdos (`implementer`, agent `019ec5d4-a5e0-7543-98cc-dac74be917c0`) was spawned at 2026-06-14 19:11 CST for production review fixes. Scope: make Kant's red tests pass, fix direct runtime/App and plugin direct write persistence bypass, fail closed on invalid hydration responses, and handle adjacent P2s in the same code paths without broadening NativeBridge or plugin-native access.
- Erdos returned final status with production changes in `src/bootstrap/create-app-runtime.ts`, `src/core/runtime/sqlite-persistence.ts`, `src/core/services/index.ts`, `src/core/plugin-host/plugin-host.ts`, and `src-tauri/src/commands/db.rs`.
- Commit `0b75f18` (`Erdos(implementation-fix)(Wire SQLite-backed Runtime Persistence): close persistence bypass findings`) records the implementation fix.
- Parent focused validation passed: TASK-046/app-bootstrap/runtime-provider suite passed with 26 tests; plugin-host/native-bridge suite passed with 65 tests; Rust `ipc_persistence` passed with 13 tests; typecheck, lint, Rust fmt check, Rust clippy, and diff-check passed.
- Full frontend probe is still red: `bun run test:frontend` failed with 27 failed files, 47 failed tests, and 779 passing tests. Failure categories: stale static native-drift guards, test helpers/no-op bridges that now provide invalid hydration responses, Quick Capture expecting no `db.transaction` despite durable plugin direct writes, and timer timeline behavior that needs targeted triage under the new plugin transaction path.
- Erdos was closed after final status and validation were recorded.
- Mencius (`test_writer`, agent `019ec5df-ad1c-7b60-b65b-6febd7322eaf`) was spawned at 2026-06-14 19:23 CST for full frontend test-fix/triage only. It must distinguish stale tests from real regressions, preserve TASK-046 review-fix coverage, and stop with a blocker if timer timeline behavior is a production regression.
- Mencius returned final status with test-only changes and no real-regression blockers. Commit `046b273` (`Mencius(test-fix)(Wire SQLite-backed Runtime Persistence): align frontend guards with durable runtime`) records the fixes.
- Parent validation passed after Mencius: `bun run test:frontend` passed with 52 files and 826 tests; `bun run typecheck`, `bun run lint`, `git diff --check`, and an exact `.only` / `.skip` scan on edited tests passed.
- Mencius was closed after final status and validation were recorded.
- Dewey (`doc_writer`, agent `019ec5e6-8ace-74b1-b160-5a4e623d6645`) was spawned at 2026-06-14 19:31 CST for Godel's docs P1/P2. Dewey owns docs only and must not mark TASK-046 complete.
- Dewey completed docs-only sync at 2026-06-14 19:37 CST. Files updated: `docs/architecture/07-runtime-flows.md`, `docs/architecture/06-filter-native-database.md`, `docs/development/02-implementation-roadmap-and-constraints.md`, `docs/testing/strategy.md`, `docs/implementation/task-index.md`, `docs/implementation/progress.md`, `docs/implementation/agent-communication/status.md`, and this TASK-046 communication file.
- Parent requested one follow-up for historical TASK-015 `in-memory-core` wording that could be misread as current state; Dewey fixed it. Commit `a032b7d` (`Dewey(docs-fix)(Wire SQLite-backed Runtime Persistence): sync runtime persistence docs`) records the docs sync and follow-up.
- Parent docs validation passed: `git diff --check`; focused stale wording scans for old `in-memory-core` / deferred runtime persistence claims returned no matches. Godel's docs P1/P2 are addressed, pending targeted re-review.
- Dewey was closed after final status and validation were recorded.
- Targeted re-review started at 2026-06-14 19:42 CST: Curie (`reviewer`, agent `019ec5f0-a139-7fb1-b9a0-2f3aaf449f44`), Singer (`security_reviewer`, agent `019ec5f0-f79f-72d0-8894-ef458fd79189`), Confucius (`test_quality_reviewer`, agent `019ec5f0-fa27-7661-8319-97b300b53e75`), Pauli (`docs_researcher`, agent `019ec5f0-fcc1-7de3-a3d3-eddf67fd0394`), and Turing (`deprecation_auditor`, agent `019ec5f0-ff46-7d53-a99c-30a245e792c4`).
- Targeted re-review completed by 2026-06-14 19:47 CST.
- Curie (`reviewer`) found no P0/P1 correctness blockers and verified Dalton's P1 is closed. Curie found two P2s to fix or explicitly accept: direct page writes can still be lost from live memory during an in-flight persisted transaction commit, and wrapping every plugin command/lifecycle handler in a transaction causes unrelated slow read-only commands to fail under the transaction lock.
- Singer (`security_reviewer`) found no P0/P1/P2 security/native-boundary issues and called the branch merge-ready from security scope.
- Confucius (`test_quality_reviewer`) found one P1: direct runtime and plugin direct-write tests still allow thrown-write behavior as a passing fallback instead of requiring successful native transaction persistence.
- Pauli (`docs_researcher`) found no P0/P1 docs issues and confirmed Godel's requested scope is closed. Pauli found one broader docs P2 in `docs/architecture/04-slots-editor-task.md` about stale current `in-memory-core` wording.
- Turing (`deprecation_auditor`) found no P0/P1/P2 API/deprecation issues and called the branch merge-ready from API/deprecation scope.
- Parent decision: fix Confucius's P1, Curie's two P2s, and Pauli's docs P2 before release checker/final gate.
- Targeted re-review agents were closed after their final statuses were recorded.
- Hilbert (`test_writer`, agent `019ec5f6-3113-7b90-b4ee-e55aadf857d4`) was spawned at 2026-06-14 19:48 CST for Confucius's direct-write test hardening and Curie's two P2 regression tests.
- Nash (`doc_writer`, agent `019ec5f6-337b-74c2-9e99-25422dc728ae`) was spawned at 2026-06-14 19:48 CST for Pauli's stale `docs/architecture/04-slots-editor-task.md` P2.
- Hilbert returned final status with test-only changes. Commit `41882da` (`Hilbert(test-fix)(Wire SQLite-backed Runtime Persistence): cover concurrency follow-up regressions`) records the test fix and red coverage. Parent red validation failed as expected with 2 failures: direct page created during an in-flight transaction is missing from live memory, and unrelated read-only plugin command rejects with `A Core transaction is already running`.
- Nash returned final status with docs-only changes. Commit `a7dbb0a` (`Nash(docs-fix)(Wire SQLite-backed Runtime Persistence): clarify editor facade persistence history`) records Pauli's docs P2 closure.
- Hilbert and Nash were closed after final statuses were recorded.
- Plato (`implementer`, agent `019ec5fa-b404-7561-b245-6976105a42f1`) was spawned at 2026-06-14 19:53 CST for Curie's two P2 production fixes.
- Plato returned final status with production changes. Commit `60bdf27` (`Plato(implementation-fix)(Wire SQLite-backed Runtime Persistence): resolve concurrency follow-up findings`) records the implementation follow-up.
- Parent validation passed after Plato: focused TASK-046/plugin-host/bootstrap/provider suite passed with 76 tests; native-bridge/Quick Capture/Markdown page persistence suite passed with 40 tests; core transaction manager suite passed with 17 tests; full frontend passed with 52 files and 828 tests; typecheck, lint, and diff-check passed.

## Next Action

- Close Plato after this status is recorded, then spawn focused targeted re-review for the follow-up findings. Do not mark TASK-046 complete until targeted fixes, re-review, release readiness, and final `check:full` pass.
