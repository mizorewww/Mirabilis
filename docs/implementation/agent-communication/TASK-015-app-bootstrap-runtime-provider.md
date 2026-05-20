# TASK-015 Agent Communication - App Bootstrap Runtime Provider

## Task

- Task ID: TASK-015.
- Task name: Build app bootstrap and runtime provider.
- Branch: `feat/task-015-app-bootstrap-runtime-provider`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/architecture/01-overview-and-monorepo.md#2-monorepo-目录结构`.
- `docs/architecture/07-runtime-flows.md#17-启动流程`.
- `docs/implementation/task-index.md#task-015-build-app-bootstrap-and-runtime-provider`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- App initializes storage, Core services, registries, Plugin Host, built-in plugins, and React providers in documented order.
- Runtime is available to UI through a provider/hook.
- Startup failures surface a user-visible error state.
- No plugin business logic lives in App Shell.

## Initial Parent Interpretation

- TASK-015 should connect the existing NativeBridge and Core runtime/Plugin Host primitives into the React app startup path.
- The first implementation should be small and testable: a bootstrap function, runtime provider/hook, and user-visible startup states.
- Built-in plugins should be represented explicitly, but business plugin behavior remains out of scope unless current docs or agents find a TASK-015-specific minimum.
- App Shell may own lifecycle composition and error rendering; it must not implement task/tag/editor/timer/calendar behavior directly.
- Avoid new Tauri command/capability expansion unless bootstrap strictly requires it.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully with 11 agent config files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK, plus the known desktop-terminal `TERM=dumb` failure. Parent treats this as non-blocking for repository agent work.

## Current Status

- Status: pre-test guidance complete; red-test handoff pending.
- Active agents: none.
- Completed agents:
  - Huygens the 2nd (`planner`): read-only scope and implementation plan completed.
  - Parfit the 2nd (`security_reviewer`): read-only security boundary review completed.
  - Goodall the 2nd (`docs_researcher`): read-only current-docs guidance completed.
  - Feynman the 2nd (`deprecation_auditor`): read-only API/deprecation risk audit completed.
- Next parent step: hand off red tests to `test_writer`.

## Agent Handoffs

### Pre-test Guidance Round

- Status: in progress.
- Agents:
  - Huygens the 2nd (`planner`): read-only plan for TASK-015 scope, test split, implementation boundaries, dependencies, and risks.
  - Goodall the 2nd (`docs_researcher`): read-only current guidance for React providers/hooks, Testing Library/Vitest async tests, and Tauri v2 bootstrap considerations.
  - Feynman the 2nd (`deprecation_auditor`): read-only deprecation/API risk audit for likely touched frontend/runtime/bootstrap code.
  - Parfit the 2nd (`security_reviewer`): read-only review of NativeBridge exposure, plugin/runtime boundaries, startup error handling, and no business logic in App Shell.

### Parfit the 2nd (`security_reviewer`) Outcome

- Status: completed read-only review; no files edited and no tests run.
- Current-state finding: the TASK-015 branch currently only changes orchestration/docs files, so no implemented security regression exists yet.
- Hard constraints for test/implementation handoff:
  - Do not expand Tauri permissions unless a strict bootstrap need is documented.
  - Keep raw Tauri access confined to `createTauriNativeBridge`; current production scan found `@tauri-apps/api/core` only in `src/core/native/tauri-native-bridge.ts`.
  - Do not expose `NativeBridge`, raw `invoke`, raw `DbQuery`, storage drivers, SQLite handles, filesystem/path APIs, or Tauri objects through React provider values reachable by plugin code.
  - Plugin lifecycle code should receive only `PluginContext` facades, preserving scoped metadata/events/filter ownership.
  - UI actions should continue through Command Registry boundaries, not direct business functions or direct store mutation.
  - Startup failures should render a generic user-visible failure state, never raw errors, stacks, SQL fragments, tokens, or local paths.
- P0/P1 risks to prevent:
  - P0: adding broad Tauri permissions such as filesystem, shell, path, SQL plugin, wildcard window, or remote/webview permissions.
  - P0: exposing `NativeBridge.db.execute`, `NativeBridge.db.transaction`, or raw `invoke` to plugins, because caller-supplied plugin identifiers in DB payloads would allow data forgery or cross-plugin access.
  - P1: exposing full `CoreRuntime` to plugin-rendered components without a trusted-shell boundary.
  - P1: using NativeBridge file, shortcut, or notification methods in TASK-015 before Rust commands exist.
  - P1: stringifying raw bootstrap or plugin failure causes.
- Recommended tests/review focus:
  - Provider/hook tests should assert plugin-reachable public provider values do not include raw bridge/storage/runtime internals.
  - Bootstrap tests should assert ordering through NativeBridge/private storage, Core stores/services/registries, PluginHost, explicit built-in plugin list, activation, and ready state.
  - Error tests should simulate NativeBridge and PluginHost failures and assert generic user text without sensitive leakage.
  - Boundary scans should keep raw Tauri imports limited to `src/core/native/tauri-native-bridge.ts`.
  - Re-run existing NativeBridge, plugin API, plugin-host lifecycle, IPC boundary, and SQLite boundary tests after implementation.

### Goodall the 2nd (`docs_researcher`) Outcome

- Status: completed read-only docs research; no files edited and no tests run.
- Official docs consulted:
  - React `createContext`, `useContext`, `useEffect`, `StrictMode`, and `createRoot`.
  - React Testing Library render API, Testing Library async queries, and query priority.
  - Vitest async tests and module mocking.
  - Tauri v2 calling Rust, IPC mocks, and capabilities.
- Guidance for `test_writer`:
  - Add focused tests for bootstrap order using injected factories/spies and Vitest `vi.fn()`, `mockResolvedValue`, and `mockRejectedValue`.
  - Test provider/hook behavior with React Testing Library `render` and a consumer component rather than `renderHook` by default.
  - Test startup failure UI with visible semantics such as `role="alert"` and async queries like `screen.findByRole(...)` or `waitFor(...)`.
  - If IPC behavior is touched, inject/mock Mirabilis `NativeBridge`; Tauri `mockIPC()` exists, but raw `invoke` should remain isolated to `src/core/native/tauri-native-bridge.ts`.
- Guidance for `implementer`:
  - Keep TASK-015 small: async bootstrap with injectable dependencies, existing primitives, explicit built-in plugin list, and `activateAll()`.
  - Add `RuntimeProvider` and `useRuntime()` with a context defaulting to `null`; `useRuntime()` should throw a clear error outside a provider.
  - React 19 docs allow `<RuntimeContext value={runtime}>`; `<RuntimeContext.Provider>` remains familiar but is described as legacy in current docs.
  - Avoid irreversible side effects during render. If bootstrap uses `useEffect`, account for StrictMode's development-only extra setup/cleanup cycle; safer options include an idempotent bootstrap function, singleton bootstrap promise, or bootstrapping from `main.tsx` before provider render.
  - Do not add task/editor/timer/calendar business behavior to App Shell. Built-ins may be explicit inert/plugin-shell entries only if needed for lifecycle wiring.
  - Do not add new Tauri commands/capabilities unless a true bootstrap requirement appears.
- Local mismatches/caveats:
  - Architecture docs mention future monorepo paths such as `apps/desktop/src/...`; current repo layout is flat `src/`.
  - `docs/architecture/07-runtime-flows.md` references future `TauriStorageDriver` and `AppRuntime` shapes that do not currently exist; adapt to current `createInMemoryAppRuntime`, Core services, and `PluginHost`.
  - Runtime-flow examples mention business plugins, but TASK-015 explicitly excludes plugin business logic in App Shell.

### Huygens the 2nd (`planner`) Outcome

- Status: completed read-only plan; no files edited and no tests run.
- Core recommendation: keep TASK-015 as app-level composition around existing Core runtime factories, `PluginHost`, and `NativeBridge`, not a Core rewrite. UI-facing runtime may expose trusted Core services/registries, `pluginHost`, and app info, but not raw `NativeBridge` or Tauri handles.
- Recommended design slices:
  - Bootstrap composition in `src/bootstrap/create-app-runtime.ts`, `src/bootstrap/register-builtin-plugins.ts`, and `src/bootstrap/index.ts`; add a small storage adapter only if a named storage facade is needed.
  - Runtime provider/hook in `src/providers/RuntimeProvider.tsx`, `src/providers/index.ts`, and `src/main.tsx`.
  - Explicit built-in plugin list in `src/bootstrap/register-builtin-plugins.ts` or `src/plugins/built-in.ts`; production list can be empty until later plugin tasks, while tests inject fake plugins.
  - App Shell boundary cleanup in `src/App.tsx`, `src/App.css`, and optionally `src/shell/AppShell.tsx`; remove Tauri/Vite scaffold UI without adding business plugin behavior.
- Recommended acceptance interpretation:
  - Initialize in order: `NativeBridge -> storage facade -> stores -> registries -> services -> PluginHost -> runtime object -> loadBuiltInPlugins -> activateAll`.
  - Rejected bootstrap should prevent ready UI and route through a visible startup failure state.
  - Provider/hook should expose the initialized runtime to trusted UI.
  - App Shell must not implement task, habit, timer, calendar, editor, or plugin business behavior and must not import Tauri directly.
- Recommended red-test files:
  - `src/test/app-bootstrap-runtime.test.ts`.
  - `src/test/runtime-provider.test.tsx`.
  - `src/test/app-shell-boundary.test.ts`.
- Recommended focused command:
  - `bun run test:frontend -- src/test/app-bootstrap-runtime.test.ts src/test/runtime-provider.test.tsx src/test/app-shell-boundary.test.ts`.
- Suggested follow-up checks after implementation:
  - `bun run typecheck`.
  - `bun run lint`.
  - `bun run check:quick`.
  - Attempt `check:full` only if implementation materially wires Tauri/app-runtime persistence or touches Tauri config, noting the TASK-014 AppImage environment limitation if it recurs.
- Out of scope: persistent store rewrite, async Core store API changes, Markdown editor behavior, task/tag/timer/calendar plugins, dynamic plugin discovery/imports, new Tauri commands/capabilities, filesystem import/export, shortcut/notification behavior, and release packaging fixes.

### Feynman the 2nd (`deprecation_auditor`) Outcome

- Status: completed read-only audit; no files edited and no tests run.
- Current versions verified: React/ReactDOM `19.2.6`, `@tauri-apps/api` `2.11.0`, Tauri CLI/Rust `2.11.x`, Vite `7.3.3`, Vitest `4.1.6`, RTL `16.3.2`, user-event `14.6.1`, TypeScript `5.8.3`, rusqlite `0.39.0`, local Node `26.1.0`, Bun `1.3.14`, Rust/Cargo `1.95.0`.
- P1 findings to carry into red tests:
  - React StrictMode wraps `src/main.tsx`, so bootstrap effects can double-run in dev. TASK-015 must use a single-flight/idempotent bootstrap or otherwise guard duplicate runtime/plugin-host creation and stale resolution; tests should cover StrictMode.
  - Runtime provider must not expose `NativeBridge` or raw Tauri `invoke`; bridge access should remain behind storage/services.
  - Existing `createInMemoryAppRuntime` and `createCoreStores` are in-memory only and do not use TASK-014 DB IPC. TASK-015 may initialize a storage facade before Core, but it must not claim persistence unless a NativeBridge-backed storage adapter is actually implemented.
- P2 findings/guidance:
  - Keep current Tauri v2 command shape `{ query }` / `{ queries }`; do not switch to snake_case without explicit Rust/caller changes. If new commands are ever added, update command permission generation and capabilities.
  - Prefer React 19 context provider syntax for new code, with `createContext<RuntimeState | null>(null)` and a `useRuntime()` guard.
  - Current Vitest/RTL setup is appropriate; isolate/reset singleton bootstrap state between tests.
  - Vite 7 compatibility is OK locally.
  - rusqlite `Transaction::new_unchecked` is not deprecated but remains a maintenance hazard; keep the existing mutex/single-connection assumption if startup touches persistence.
- Deprecated APIs not found: `ReactDOM.render`, v1 `@tauri-apps/api/tauri`, `window.__TAURI__`, removed Vitest config options, and removed Vite 7 config hooks.
- External docs verified: React 19 `createRoot`, `StrictMode`, `createContext`, `useSyncExternalStore`; Vite 7 migration/server options; Vitest 4 migration/config/mocking; Testing Library React/user-event/jest-dom; Tauri v2 `invoke`, commands, state, permissions/capabilities; rusqlite `Transaction`.

## Parent Decisions For Red Tests

- Delegate red tests to `test_writer`; parent remains orchestration-only and will not write test/production files directly.
- Test files should cover:
  - Bootstrap order and failure behavior with injected factories/spies.
  - Single-flight/idempotent bootstrap under React StrictMode or equivalent duplicate-start protection.
  - Runtime provider/hook availability via React Testing Library render + consumer component.
  - `useRuntime()` outside provider throws a clear error.
  - Startup failure renders a visible generic alert and does not leak stack/path/SQL/token/raw cause details.
  - Public/provider-reachable runtime values do not expose raw `NativeBridge`, `invoke`, `db`, `storage`, `sqlite`, filesystem/path APIs, stores, registries, or services unless the surface is clearly trusted shell only.
  - App Shell has no direct Tauri import, no task/habit/timer/calendar/editor business behavior, and no new Tauri capability/config changes.
  - Bootstrap uses an explicit built-in plugin list; production can be empty while tests inject fake plugins.
- Red-test ownership should stay in frontend test files and test helpers only. Production files, docs, Tauri config/capabilities, Rust code, and package/Cargo dependency changes are out of scope for `test_writer`.
