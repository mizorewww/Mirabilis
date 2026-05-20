# TASK-009 Agent Communication - Transaction Manager and Core Runtime Composition

## Task

- Task ID: TASK-009.
- Task name: Add Transaction Manager and Core Runtime composition.
- Branch: `feat/task-009-transaction-manager-core-runtime-composition`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/architecture/02-core-kernel.md`.
- `docs/architecture/07-runtime-flows.md#17-启动流程`.
- `docs/architecture/03-plugin-api-and-host.md#5-plugin-context`.
- `docs/architecture/04-slots-editor-task.md#93-创建任务对应页面`.
- `docs/architecture/05-plugin-implementations.md#102-start-timer`.
- `docs/development/02-implementation-roadmap-and-constraints.md#19-开发顺序`.
- `docs/implementation/task-index.md#task-009-add-transaction-manager-and-core-runtime-composition`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- Core services and registries are composed into an app runtime object.
- Transactions can group page, metadata, event, and filter changes.
- Failed transaction handlers do not partially apply in the in-memory implementation.
- Runtime exposes services through documented names.

## Initial Parent Interpretation

- TASK-009 implements in-memory Core composition only.
- The runtime should compose the existing Page Store, Metadata Store, Event Store, Filter Store, Command Registry, View Registry, Slot Registry, and a Transaction Manager into a documented Core runtime object.
- Transactions should expose transactional versions of page, metadata, event, and filter services to a handler and commit all changes only if the handler succeeds.
- Failed transaction handlers must leave the original in-memory stores unchanged.
- The transaction implementation should be conservative and local to Core; no Plugin Host, native bridge, Tauri IPC, SQLite, UI rendering, persistence, filesystem, settings, storage, algorithm registry, markdown extension registry, metadata field registry, event type registry, query bus, or event bus implementation should be invented in this task.
- Runtime service names should line up with docs where implemented today, while missing future services should stay out of the concrete TASK-009 runtime unless tests/docs agents identify a clear placeholder contract.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network OK, noted Codex `0.132.0` is available, and reported the known desktop-terminal `TERM=dumb` failure. Parent treats this as non-blocking for repository agent work.

## Current Status

- Status: failing tests committed; implementation handoff pending.
- Active agents: none.

## Agent Handoffs

### Pre-test Guidance Round

- Status: completed and closed.
- Agents:
  - Copernicus (`planner`, `019e43ee-856d-7081-b768-58535541be8e`).
  - Sartre (`docs_researcher`, `019e43ee-8a02-74d3-956a-12a18d25e40f`).
  - Beauvoir (`deprecation_auditor`, `019e43ee-8fd5-7cc2-9d08-80ef815f5de1`).
- Assignment:
  - Copernicus: produce a focused TASK-009 API/test plan for in-memory Transaction Manager and Core Runtime composition.
  - Sartre: verify current official TypeScript, Vitest, and standard JS guidance relevant to tests and implementation.
  - Beauvoir: audit transaction/runtime type, rollback, cloning/snapshot, and exposure risks.
- Outcomes:
  - Copernicus recommended a factory-first Core runtime composition layer rather than a class-first `AppRuntime`: `createCoreStores`, `createCoreRegistries`, `createCoreServices`, and `createInMemoryAppRuntime`.
  - Runtime should expose grouped `stores`, `registries`, and `services`, plus documented top-level aliases: `pages`, `metadata`, `events`, `filters`, `commands`, `views`, `slots`, and `transaction`.
  - `transaction.run<T>(handler)` should return `Promise<T>` and pass a transaction context with `{ pages, metadata, events, filters }`.
  - Rollback scope is page, metadata, event, and filter stores only. Registries are composed into runtime by reference and are not part of TASK-009 rollback.
  - Rollback must cover page create/update/archive, metadata set/overwrite/delete, event append, and filter save/update/delete.
  - Failed sync throws and async rejections must leave the live runtime stores unchanged.
  - Handler writes should be visible through the transaction context, but not through the live runtime before the handler resolves and commit succeeds.
  - Public service names should stay limited to implemented documented names. Do not invent future Plugin Context APIs such as `metadata.getGlobal`, `pages.updateBlockAttrs`, `events.findTimerStart`, settings/storage, query/event bus, algorithm registry, markdown registry, metadata field registry, or event type registry.
  - Existing public store APIs are insufficient for lossless rollback because they keep private closure state and public writes regenerate IDs/timestamps. Implementation should use staged in-memory state or internal snapshot/restore hooks, not public replay and not live mutation followed by undo.
  - Snapshot/restore hooks, if introduced, must stay internal and must not be exposed on the runtime or public services.
  - Tests should assert observable store state, not rollback of external ID or clock generator side effects.
  - Type exports should be exact from public Core and subpaths: `CoreRuntime`, `CoreStores`, `CoreRegistries`, `CoreServices`, `CoreTransaction`, `TransactionManager`, and `TransactionHandler`. Avoid `any` and broad runtime index signatures.
- Suggested files:
  - Add `src/core/runtime/app-runtime.ts` and `src/core/runtime/index.ts`.
  - Add `src/core/services/transaction-manager.ts`, `src/core/services/index.ts`, and possibly an internal `src/core/services/transaction-participant.ts`.
  - Update `src/core/index.ts`, store modules as needed for internal transaction participants, and public barrels.
  - Add focused tests in `src/test/core-runtime-composition.test.ts` and `src/test/core-transaction-manager.test.ts`.
- Recommended test coverage:
  - Public runtime/services exports from `../core`, `../core/runtime`, and `../core/services`.
  - Runtime service availability by documented names and identity links between top-level aliases, `services`, `stores`, and `registries`.
  - Command execution through `runtime.commands`.
  - Successful transaction commits page, metadata, event, and filter changes together and preserves the handler return value.
  - Transaction read-your-writes while keeping live runtime state unchanged before commit.
  - Sync throw rollback after multiple staged writes.
  - Async rejection rollback after awaited staged writes.
  - Store validation failure inside a transaction rolls back prior staged writes.
  - Defensive clone boundaries for transaction reads and returns.
  - Explicit nested/concurrent transaction behavior, preferably typed rejection rather than unspecified behavior.
- External docs verified:
  - Vitest `expectTypeOf`: https://v4.vitest.dev/api/expect-typeof
  - Vitest type tests: https://main.vitest.dev/guide/testing-types.html
  - Vitest async `expect` / `rejects`: https://main.vitest.dev/api/expect
  - Vitest `vi.stubGlobal`: https://vitest.dev/api/vi.html#vi-stubglobal
  - Node global `structuredClone`: https://nodejs.org/docs/latest/api/globals.html#structuredclonevalue-options
  - WHATWG structured data: https://html.spec.whatwg.org/multipage/structured-data.html
  - MDN structured clone algorithm: https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm
  - MDN `await`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await

### Kant (`test_writer`)

- Status: stopped and replaced.
- Agent id: `019e43f4-4602-7d40-958d-276cc6031bfc`.
- Ownership:
  - `src/test/core-runtime-composition.test.ts`.
  - `src/test/core-transaction-manager.test.ts`.
- Assignment:
  - Write failing tests for TASK-009 public runtime/services exports, runtime service availability by documented names, command execution through `runtime.commands`, successful transaction commit, read-your-writes, delayed live visibility while async transactions are pending, sync throw rollback, async rejection rollback, validation-error rollback, and defensive clone behavior.
  - Use Vitest runtime tests plus `expectTypeOf` assertions backed by `bun run typecheck`.
  - Do not edit production code, docs, config, lockfiles, or existing tests unless unavoidable for test-only support.
- Outcome:
  - Parent sent one status request after the first wait window and gave Kant a second wait window.
  - Kant produced no final output and no worktree changes, so parent stopped it and will spawn a replacement `test_writer`.

### Jason (`test_writer`)

- Status: stopped.
- Agent id: `019e43f8-fa95-7010-b235-8f1ae56cbe84`.
- Ownership:
  - `src/test/core-runtime-composition.test.ts`.
  - `src/test/core-transaction-manager.test.ts`.
- Assignment:
  - Replacement failing-test writer for TASK-009.
  - Add only tests for runtime/services exports, documented runtime aliases and identity links, command execution through runtime, successful transaction commit, read-your-writes, delayed live visibility while an async transaction is pending, sync throw rollback, async rejection rollback, validation-error rollback, and defensive clone behavior.
  - Do not edit production code, docs, config, lockfiles, or existing tests.
- Outcome:
  - Parent sent one status request after the first wait window and gave Jason a second wait window.
  - Jason produced no final output and no worktree changes, so parent stopped it.

### Parent Fallback Test Work

- Status: completed.
- Fallback reason:
  - Kant and Jason, both `test_writer` agents, produced no output and no worktree changes after status requests and second wait windows.
- Scope:
  - `src/test/core-runtime-composition.test.ts`.
  - `src/test/core-transaction-manager.test.ts`.
- Parent decision:
  - Continue with TDD by writing the failing TASK-009 tests directly, then run focused red checks and commit the tests if the failure is expected.
- Commit:
  - `de31382 Codex(test)(Add Transaction Manager and Core Runtime composition): add runtime transaction acceptance tests`.
- Red checks:
  - `bun run typecheck` failed as expected because `../core` does not yet export `createCoreStores`, `createCoreRegistries`, `createCoreServices`, `createInMemoryAppRuntime`, `CoreRuntime`, `CoreStores`, `CoreRegistries`, `CoreServices`, `CoreTransaction`, or `TransactionHandler`, and because `../core/runtime` and `../core/services` do not exist yet.
  - `bun run test:frontend -- src/test/core-runtime-composition.test.ts src/test/core-transaction-manager.test.ts` failed as expected because `../core/runtime` could not be resolved and `createCoreStores` is not yet implemented/exported.

## Parent Decisions

- Use the existing repository checkout and branch only; do not create a sibling worktree.
- Follow TDD: gather docs/API guidance, delegate failing tests to `test_writer`, confirm the red signal, then delegate production implementation to `implementer`.
- Persist agent outputs and parent decisions here instead of relying on chat history.
- Implement TASK-009 as in-memory Core only. Do not touch Tauri IPC, permissions, Rust, React runtime APIs, app UI, SQLite, persistence, filesystem, Plugin Host, native bridge, settings/storage, query/event bus, or future plugin registries.
- Use a staged/snapshot transaction design. Do not mutate live stores and undo, and do not replay public store APIs for rollback.
- Keep transaction scope to page, metadata, event, and filter stores.
- Compose command, view, and slot registries into the runtime by reference; do not structured-clone handlers or components.
- Treat `expectTypeOf` assertions as typecheck-backed; always run `bun run typecheck` in addition to focused runtime tests.

## Next Action

Record implementation handoff, spawn `implementer` for minimum production code, then run focused checks after it returns.
