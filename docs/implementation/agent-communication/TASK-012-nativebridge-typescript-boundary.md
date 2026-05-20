# TASK-012 Agent Communication - NativeBridge TypeScript Boundary

## Task

- Task ID: TASK-012.
- Task name: Add NativeBridge TypeScript boundary.
- Branch: `feat/task-012-nativebridge-typescript-boundary`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/architecture/06-filter-native-database.md#15-tauri--rust-边界`.
- `docs/architecture/01-overview-and-monorepo.md#11-分层结构`.
- `docs/architecture/07-runtime-flows.md`.
- `docs/implementation/task-index.md#task-012-add-nativebridge-typescript-boundary`.
- `docs/testing/strategy.md`.
- Current `@tauri-apps/api` v2 `invoke` documentation must be verified before tests.

## Acceptance Criteria

- Frontend calls Rust through a typed NativeBridge wrapper instead of raw invoke calls scattered through UI.
- Request and response DTOs are typed.
- Errors are normalized into typed app errors.
- No UI component calls Tauri APIs directly for persistence.

## Initial Parent Interpretation

- TASK-012 is a TypeScript frontend boundary task, not the Rust command, SQLite schema, persistence repository, or app-bootstrap implementation.
- The smallest useful shape is a typed NativeBridge module that owns all direct `@tauri-apps/api/core` `invoke` calls and exposes grouped bridge methods for database, shortcuts, notifications, and markdown file import/export as sketched in the architecture docs.
- Tests should mock Tauri invoke at the NativeBridge boundary and assert command names, DTO shapes, response typing behavior, and error normalization.
- Existing UI components should not call Tauri APIs directly for persistence. If no UI persistence calls exist yet, tests and scans should lock the boundary so future persistence calls route through NativeBridge.
- This task should avoid adding new Tauri permissions/capabilities, Rust commands, SQLite repositories, concrete persistence behavior, or runtime provider wiring. TASK-013 through TASK-015 own those surfaces.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully with 11 agent config files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK, plus the known desktop-terminal `TERM=dumb` failure. Parent treats this as non-blocking for repository agent work because configured agents and network reachability are available.

## Current Status

- Status: review-fix implementation green; docs handoff next.
- Active agents:
  - None.
- Next parent step: spawn a `doc_writer` to sync the concrete NativeBridge command/DTO/error contract into architecture docs before re-review.

## Agent Handoffs

### Pre-test Guidance Round

- Status: completed and closed.
- Agents:
  - Socrates (`planner`, `019e46af-56e2-7d60-acda-6e5010986619`).
  - Parfit (`docs_researcher`, `019e46af-5ac6-7ec0-82e2-b42db7892871`).
  - Turing (`deprecation_auditor`, `019e46af-5f7c-73d2-a0e9-cf63956a1350`).
  - Euclid (`security_reviewer`, `019e46af-6383-7ab0-94a4-8c01342a54e5`).
- Assignment:
  - Produce focused behavior, API, current-doc, deprecation, and security-boundary guidance before TDD tests.
  - Stay read-only and do not edit files.
  - Socrates should recommend the module/file surface, public API shape, DTO/error boundaries, out-of-scope items, acceptance-test behaviors, and validation commands.
  - Parfit should verify current official `@tauri-apps/api` v2 `invoke` usage/import paths and relevant Vitest mocking guidance from primary sources.
  - Turing should audit deprecated/API compatibility risks for Tauri v2 imports, TypeScript module patterns, and ESM mocking.
  - Euclid should define IPC/native-boundary security criteria, including command centralization, typed DTOs, no UI raw Tauri persistence calls, and no new permissions/capabilities in this task.

#### Outcomes

- Socrates recommended a TS-only NativeBridge surface under `src/core/native/`:
  - `src/core/native/native-bridge.ts` for pure types, DTOs, `NativeBridgeError`, and `createNativeBridge({ invoke })`.
  - `src/core/native/tauri-native-bridge.ts` as the only direct `@tauri-apps/api/core` import and production Tauri adapter.
  - `src/core/native/index.ts` and `src/core/index.ts` exports, following existing Core export style.
  - Focused tests in `src/test/native-bridge.test.ts`.
- Socrates recommended the architecture-doc public shape: grouped `db`, `shortcuts`, `notifications`, and `files` methods, plus `NativeInvoke`, command-name constants, `DbQuery`, `DbValue`, `NotificationInput`, `NativeBridgeError`, `NativeBridgeErrorCode`, `createNativeBridge({ invoke })`, and `createTauriNativeBridge()`.
- Socrates recommended object-shaped invoke DTOs:
  - `db.execute(query)` -> `{ query }`.
  - `db.transaction(queries)` -> `{ queries }`.
  - `shortcuts.register(shortcut, commandId)` -> `{ shortcut, commandId }`.
  - `shortcuts.unregister(shortcut)` -> `{ shortcut }`.
  - `notifications.notify(input)` -> `{ input }`.
  - `files.importMarkdown(path)` -> `{ path }`.
  - `files.exportMarkdown(pageId, path)` -> `{ pageId, path }`.
- Parfit verified official Tauri v2 guidance:
  - Command invocation imports `invoke` from `@tauri-apps/api/core`.
  - `invoke<T>(cmd, args, options?)` returns `Promise<T>`.
  - `InvokeArgs` is `Record<string, unknown> | number[] | ArrayBuffer | Uint8Array`.
  - Frontend command args are camelCase by default unless Rust uses `#[tauri::command(rename_all = "snake_case")]`.
  - Rust command `Result::Err` rejects the JS promise, and success/error values must be serializable.
  - Tauri `mockIPC` / `clearMocks()` and Vitest ESM module mocks are both valid test tools; injected invoker tests are less brittle for the pure boundary.
- Turing found P1 API/deprecation guidance:
  - Do not use v1 `@tauri-apps/api/tauri`, root `@tauri-apps/api` `invoke`, or `window.__TAURI__`.
  - Normalize caught values as `unknown`, not as trusted app errors.
  - Test string, structured object, `Error`, `null`, and unknown error cases.
  - Use camelCase invoke payload keys.
  - Remove or route the current template raw `invoke` in `src/App.tsx` before TASK-012 merges.
- Turing recommended an injectable invoker in `createNativeBridge` / `createTauriNativeBridge`, type-only DTO imports/exports under `isolatedModules`, no `const enum` or namespaces, and an architecture scan test for raw Tauri imports.
- Euclid recommended security acceptance criteria:
  - NativeBridge is the only production frontend raw Tauri import/call site.
  - Command names are centralized in typed constants/unions.
  - Public DTOs are explicit and serializable.
  - Native responses are validated before being returned as typed values where practical.
  - Rejected invoke values normalize into a stable `NativeBridgeError` without leaking raw SQL, filesystem paths, secrets, or backend objects.
  - Plugin API and `PluginContext` must not expose `NativeBridge`, `invoke`, `Resource`, `__TAURI__`, SQLite, filesystem, or Tauri types.
  - No new Tauri capabilities, Rust commands, `tauri.conf.json` security broadening, or fs/sql/shortcut/notification plugin dependencies in TASK-012.

#### Parent Decisions

- Implement TASK-012 as a TypeScript-only Core native boundary under `src/core/native/`.
- Use a pure `createNativeBridge({ invoke })` factory for tests and a thin `createTauriNativeBridge()` adapter that imports `invoke` from `@tauri-apps/api/core`.
- Define command names once as typed constants and export the command-name type for TASK-014 alignment.
- Keep DTO payload keys camelCase.
- Keep `DbQuery` narrow and serializable. Do not add a query builder, repositories, migrations, or SQL execution semantics.
- Keep NativeBridge out of `PluginContext` and `src/core/plugin-api`.
- Add broad production scan coverage that allows direct `@tauri-apps/api/core` / raw `invoke` only in `src/core/native/tauri-native-bridge.ts`. Do not add a `greet` bridge method just to preserve the scaffold demo; the implementation agent may remove the demo direct invoke from `src/App.tsx`.
- Run focused red/green with `bun run test:frontend -- src/test/native-bridge.test.ts`, `bun run typecheck`, `bun run lint`, and `git diff --check`. Use `bun run check:quick` before merge. `bun run check:full` is only required if a later edit touches Tauri config, Rust, capabilities, filesystem, persistence, packaging, or release behavior.

#### External Docs Verified

- Tauri v2 calling Rust docs: `https://v2.tauri.app/develop/calling-rust/`.
- Tauri v2 core API reference: `https://v2.tauri.app/reference/javascript/api/namespacecore/`.
- Tauri v2 mocks API: `https://v2.tauri.app/reference/javascript/api/namespacemocks/`.
- Tauri v2 migration docs for `core` naming: `https://v2.tauri.app/start/migrate/from-tauri-1/`.
- Vitest `vi.mock` and module mocking docs: `https://vitest.dev/api/vi` and `https://v4.vitest.dev/guide/mocking/modules`.
- TypeScript `isolatedModules` and `verbatimModuleSyntax` docs.
- Vite 7 migration notes.

### TDD Tests

- Status: completed and committed.
- Agent:
  - Boyle (`test_writer`, `019e46b4-4e48-7dc3-8bb5-535e59efc26d`).
- Ownership:
  - `src/test/native-bridge.test.ts`.
- Assignment:
  - Add focused red Vitest tests for NativeBridge public exports, grouped bridge methods, centralized command constants, exact camelCase DTO payloads, generic DB response typing, void methods, error normalization, malformed concrete native responses, production raw Tauri import/call boundary scanning, and absence of NativeBridge/raw native handles from Plugin API/PluginContext.
  - Do not edit production code, docs, config, package files, lockfiles, Rust/Tauri files, `src/App.tsx`, or existing tests.
- Initial outcome:
  - Boyle added `src/test/native-bridge.test.ts`.
  - Parent red check `bun run test:frontend -- src/test/native-bridge.test.ts` failed as expected because Vite cannot resolve `../core/native`.
  - Parent red check `bun run typecheck` also found test-internal TypeScript errors in a command-key type assertion and raw-invoke violation list typing.
- Follow-up:
  - Parent resumed Boyle to fix only `src/test/native-bridge.test.ts` so the red signal is clean before commit.
- Outcome:
  - Boyle added `src/test/native-bridge.test.ts`.
  - Tests cover public exports from `../core/native` and `../core`, grouped bridge surfaces, exact command constants and camelCase DTOs, DB generic response typing, void method behavior, `NativeBridgeError` normalization for typed object/string/`Error`/`null`/unknown rejection values, malformed markdown import response rejection, production raw Tauri import/call boundary scanning, Plugin API native-handle exclusion, and no `greet` bridge surface.
- Commit:
  - `9b9b204 Boyle(test)(Add NativeBridge TypeScript boundary): add native bridge boundary tests`.
- Red checks:
  - `bun run test:frontend -- src/test/native-bridge.test.ts` failed because Vite cannot resolve `../core/native`.
  - `bun run typecheck` failed only on missing `../core/native` and missing Core NativeBridge exports.
  - `bun run lint` passed.
  - `git diff --check` passed.

### Implementation

- Status: completed and committed.
- Agent:
  - Ramanujan (`implementer`, `019e46bd-7000-7eb3-b1d3-7a5bf6263565`).
- Ownership:
  - `src/core/native/native-bridge.ts`.
  - `src/core/native/tauri-native-bridge.ts`.
  - `src/core/native/index.ts`.
  - `src/core/index.ts`.
  - `src/App.tsx` only if needed to remove/reroute the existing template raw `invoke` without adding a `greet` NativeBridge API.
- Assignment:
  - Implement the minimum production NativeBridge boundary to satisfy Boyle's tests.
  - Keep direct `@tauri-apps/api/core` import isolated to `src/core/native/tauri-native-bridge.ts`.
  - Do not edit tests, docs, config, package files, lockfiles, Rust/Tauri files, capabilities, `tauri.conf.json`, Plugin API/Plugin Host, or unrelated files.
- Scope note:
  - Ramanujan adjusted `src/test/native-bridge.test.ts` after implementation revealed a Vitest `Mock<NativeInvoke>` generic erasure issue. Parent split that test-helper-only change into a separate `test-fix` commit and verified assertions were not weakened.
- Outcome:
  - Added `src/core/native/native-bridge.ts`, `src/core/native/tauri-native-bridge.ts`, and `src/core/native/index.ts`.
  - Exported NativeBridge types, command constants, `NativeBridgeError`, `createNativeBridge`, and `createTauriNativeBridge` from the Core barrel.
  - Added grouped `db`, `shortcuts`, `notifications`, and `files` bridge surfaces over an injected invoker.
  - Isolated the only production `@tauri-apps/api/core` import to the Tauri adapter.
  - Normalized invoke rejections into `NativeBridgeError`.
  - Validated `files.importMarkdown` returns a string and rejects malformed values as `NATIVE_RESPONSE_INVALID`.
  - Removed the scaffold UI `invoke("greet")` form/state/import from `src/App.tsx` without adding `greet` to the NativeBridge API.
- Commits:
  - `98ac5b2 Ramanujan(test-fix)(Add NativeBridge TypeScript boundary): align native bridge test helper`.
  - `391c5d0 Ramanujan(implementation)(Add NativeBridge TypeScript boundary): implement typed invoke wrapper`.
- Green checks:
  - `bun run test:frontend -- src/test/native-bridge.test.ts` passed with 15 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.

### Review Round 1

- Status: completed and closed.
- Agents:
  - Kant (`pr_explorer`, `019e46c9-69d0-7d23-aedf-e287836824e8`).
  - Poincare (`reviewer`, `019e46c9-6da3-7152-96b8-2aa7c753a9dc`).
  - Pascal (`deprecation_auditor`, `019e46c9-71b6-7223-87a1-ac1934875de1`).
  - Confucius (`security_reviewer`, `019e46c9-7735-7632-9cc5-88772026d6f7`).
  - Kepler the 2nd (`docs_researcher`, `019e46c9-7b19-7721-aa9c-220423a9247b`).
  - Gauss the 2nd (`test_quality_reviewer`, `019e46c9-8010-7a40-b824-262d3523e4f5`).
- Assignment:
  - Read-only review against `master` for diff scope, correctness, API/deprecation risk, security/native boundary, docs/current-guidance drift, and test quality.
  - Report P0/P1/P2 findings with tight file/line references and no code edits.
- Outcomes:
  - Kant mapped the diff and found no scope creep into Rust, SQLite, Tauri capabilities/config, dependencies, Plugin API, or Plugin Host. Kant flagged command literal widening, raw error forwarding, and root `@tauri-apps/api` scan coverage as review points.
  - Poincare found two P1 issues: `NativeBridgeCommand` widens to `string`, and `NativeBridgeError.message` forwards native strings / `Error.message` / object `.message` verbatim.
  - Pascal independently found the same P1 command widening issue and cleared Tauri v2 import/deprecation usage.
  - Confucius found P1 issues for unredacted native errors and SQL-shaped `DbQuery`, plus P2 issues for widened command names and broad Core barrel NativeBridge exports.
  - Kepler the 2nd found no P1 docs/current-guidance issues and one P2 docs handoff gap: concrete command constants, camelCase DTO envelopes, and `NativeBridgeError` codes should be documented for TASK-014.
  - Gauss the 2nd found one P1 test-quality gap: `createTauriNativeBridge()` is not tested against a mocked `@tauri-apps/api/core` invoke. Gauss also noted P2 gaps for literal command type assertions, broader error normalization coverage, and brittle source scans.
- Parent decisions:
  - Fix the command constant type widening with tests first, then implementation.
  - Change public command-failure messages to a stable safe message and prevent raw native SQL/path/token details from becoming `NativeBridgeError.message`; tests should still ensure raw values are not thrown directly.
  - Replace SQL-shaped `DbQuery` (`sql` / SQL params) with an allowlist-friendly operation DTO such as `{ operation, payload? }` using JSON-compatible values. This keeps TASK-012 from freezing SQL strings into the frontend contract while leaving concrete Rust allowlists/repositories to TASK-013/TASK-014.
  - Add a Tauri adapter behavior test that mocks `@tauri-apps/api/core` and verifies `createTauriNativeBridge()` delegates to `invoke` with the exact command and DTO.
  - Extend raw-native scan coverage to catch root `@tauri-apps/api` imports in production files.
  - Accept the P2 broad Core barrel NativeBridge export for now because the existing project pattern exposes Core contracts through the Core barrel and Plugin API/PluginContext remain native-handle-free. Revisit if security re-review escalates it.
  - Defer the P2 architecture/task docs contract sync until code behavior settles after review fixes.
- Review checks reported by agents:
  - `bun run test:frontend -- src/test/native-bridge.test.ts` passed with 15 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check master...HEAD` passed.

### Review-Fix TDD

- Status: completed and committed.
- Agent:
  - Halley the 2nd (`test_writer`, `019e46d0-83be-7440-8b99-9a01fb27560d`).
- Ownership:
  - `src/test/native-bridge.test.ts`.
- Assignment:
  - Add red tests for exact `NativeBridgeCommand` literal union and no arbitrary string / `greet` command assignability.
  - Add red tests that `DbQuery` is not SQL-shaped and uses an allowlist-friendly operation/payload DTO.
  - Add red tests for safe stable `NativeBridgeError.message` values that do not include raw SQL/path/token details.
  - Add at least one non-DB path error normalization test.
  - Add a mocked Tauri adapter test for `createTauriNativeBridge()` delegating to `@tauri-apps/api/core` `invoke` with exact command/DTO.
  - Extend raw-native scan coverage for root `@tauri-apps/api` imports.
  - Do not edit production code, docs, config, package files, lockfiles, Rust/Tauri files, `src/App.tsx`, or other tests.
- Initial outcome:
  - Halley the 2nd added review-fix tests in `src/test/native-bridge.test.ts`.
  - Parent red check `bun run test:frontend -- src/test/native-bridge.test.ts` failed with four expected raw-error-message failures.
  - Parent red check `bun run typecheck` failed for expected command literal and SQL-shaped `DbQuery` issues, but also produced noisy test-design failures around `ExpectedDbValue` and object payload examples.
- Follow-up:
  - Parent resumed Halley the 2nd to refine only `src/test/native-bridge.test.ts` so the red signal is clean before commit.
- Outcome:
  - Halley the 2nd updated `src/test/native-bridge.test.ts` with review-fix red coverage for exact command literal types, no `string` / `greet` command leaks, non-SQL operation-shaped `DbQuery`, JSON-compatible payload support, stable safe command-failure messages, non-DB error normalization, Tauri adapter delegation through mocked `@tauri-apps/api/core` `invoke`, and root `@tauri-apps/api` scan coverage.
- Commit:
  - `6d5b98b Halley the 2nd(test)(Add NativeBridge TypeScript boundary): cover review boundary gaps`.
- Red checks:
  - `bun run test:frontend -- src/test/native-bridge.test.ts` failed with four expected raw-error-message failures.
  - `bun run typecheck` failed only on command literal widening, SQL-shaped `DbQuery`, and `DbValue` JSON object payload support.
  - `bun run lint` passed.
  - `git diff --check` passed.

### Review-Fix Implementation

- Status: completed and committed.
- Agent:
  - Darwin the 2nd (`implementer`, `019e46d8-7847-76e3-9b77-fc9d392a47e7`).
- Ownership:
  - `src/core/native/native-bridge.ts`.
  - `src/core/native/index.ts` / `src/core/index.ts` only if required for exports.
- Assignment:
  - Preserve exact command literal values so `NativeBridgeCommand` is not `string`.
  - Replace SQL-shaped `DbQuery` with an operation/payload DTO and JSON-compatible `DbValue`.
  - Make public command-failure messages stable and safe without leaking raw SQL, filesystem paths, tokens, or backend messages.
  - Preserve command/code on `NativeBridgeError` and keep adapter delegation behavior intact.
  - Do not edit tests, docs, config, package files, lockfiles, Rust/Tauri files, `src/App.tsx`, Plugin API/Plugin Host, or unrelated files.
- Outcome:
  - Preserved `NATIVE_BRIDGE_COMMANDS` as exact literal values using `as const satisfies`.
  - Replaced SQL-shaped `DbQuery` with an operation/payload DTO.
  - Expanded `DbValue` to JSON-compatible primitive, array, and object payloads.
  - Changed command-failure public messages to stable `Native command failed` while retaining `code` and `command`.
- Commit:
  - `0351f17 Darwin the 2nd(review-fix)(Add NativeBridge TypeScript boundary): harden native bridge contracts`.
- Green checks:
  - `bun run test:frontend -- src/test/native-bridge.test.ts` passed with 17 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - Raw Tauri scan confirmed the only production `@tauri-apps/api/core` import is `src/core/native/tauri-native-bridge.ts`.
