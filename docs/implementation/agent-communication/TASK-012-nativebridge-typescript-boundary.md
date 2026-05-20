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

- Status: implementation in progress.
- Active agents:
  - Ramanujan (`implementer`, `019e46bd-7000-7eb3-b1d3-7a5bf6263565`).
- Next parent step: wait for Ramanujan, run focused green checks, and commit the implementation patch if it stays within scope.

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

- Status: running.
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
