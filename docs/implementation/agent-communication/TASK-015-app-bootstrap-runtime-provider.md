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

- Status: review-fix test handoff pending.
- Active agents: none.
- Completed agents:
  - Jason the 2nd (`pr_explorer`): changed-surface mapping completed.
  - Carver the 2nd (`reviewer`): correctness review completed.
  - Mendel the 2nd (`security_reviewer`): security boundary review completed.
  - Nash the 2nd (`deprecation_auditor`): API/deprecation review completed.
  - McClintock the 2nd (`test_quality_reviewer`): test-quality review completed.
  - Pasteur the 2nd (`docs_researcher`): docs/current-guidance review completed.
  - Hubble the 2nd (`doc_writer`): documentation gap review completed.
- Completed agents:
  - Huygens the 2nd (`planner`): read-only scope and implementation plan completed.
  - Parfit the 2nd (`security_reviewer`): read-only security boundary review completed.
  - Goodall the 2nd (`docs_researcher`): read-only current-docs guidance completed.
  - Feynman the 2nd (`deprecation_auditor`): read-only API/deprecation risk audit completed.
- Deferred agents:
  - `doc_writer` documentation gap review; initial spawn hit the agent thread limit and should be retried when a review slot frees.
- Next parent step: wait for review agents, summarize findings, then spawn deferred `doc_writer` if still needed.

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

### Ramanujan the 2nd (`test_writer`) Handoff

- Status: completed and closed.
- Ownership: failing TASK-015 frontend tests and test helpers only.
- Files changed:
  - `src/test/app-bootstrap-runtime.test.ts`.
  - `src/test/runtime-provider.test.tsx`.
  - `src/test/app-shell-boundary.test.ts`.
- Assertions added:
  - Bootstrap order, explicit built-in plugin list, injectable failure behavior, and safe plugin/runtime public surfaces.
  - Provider/hook consumer behavior, outside-provider error, StrictMode single-flight startup, and generic redacted startup failure UI.
  - App Shell boundary scans for direct Tauri imports, business behavior, and bootstrap-related native expansion.
- Parent focused red command:
  - `bun run test:frontend -- src/test/app-bootstrap-runtime.test.ts src/test/runtime-provider.test.tsx src/test/app-shell-boundary.test.ts`.
- Parent red-test result:
  - 8 tests failed for expected TASK-015 gaps.
  - `src/test/app-bootstrap-runtime.test.ts` failed because `src/bootstrap` does not exist yet.
  - `src/test/runtime-provider.test.tsx` failed because `src/providers` does not exist yet.
  - Startup failure UI failed because current `App` still renders the starter Tauri/Vite/React UI and no `role="alert"` state.
  - 3 App Shell boundary tests passed.
- Validation before commit: `git diff --cached --check` passed.
- Test commit: `75e3bc7 Ramanujan the 2nd(test)(Build app bootstrap and runtime provider): add bootstrap provider acceptance tests`.
- Parent decision: failures are expected and suitable for implementation handoff.

### Planck the 2nd (`implementer`) Handoff

- Status: completed and closed.
- Ownership: minimum production implementation for bootstrap/provider/App Shell behavior.
- Files changed:
  - `src/bootstrap/**`.
  - `src/providers/**`.
  - `src/App.tsx`.
  - `src/App.css`.
- Delivered:
  - Injectable `createAppRuntime()` with documented initialization order.
  - Honest in-memory storage facade marker; no persistence adapter or Tauri permission expansion.
  - Explicit empty production `BUILT_IN_PLUGINS` list, with tests able to inject fake plugins.
  - `RuntimeProvider` and `useRuntime()` with single-flight initialization for React StrictMode.
  - Neutral Mirabilis App Shell and generic startup failure alert without raw error details.
- Parent repeated green checks:
  - `bun run test:frontend -- src/test/app-bootstrap-runtime.test.ts src/test/runtime-provider.test.tsx src/test/app-shell-boundary.test.ts`.
  - `bun run typecheck`.
  - `bun run lint`.
  - `bun run build`.
  - `git diff --check`.
- Implementation commit: `96d229e Planck the 2nd(implementation)(Build app bootstrap and runtime provider): implement runtime bootstrap provider`.
- Remaining known gaps: runtime persistence is not wired yet, and production built-in plugin list is intentionally empty until later plugin tasks.

### Review Round 1

- Status: in progress.
- Active read-only agents:
  - Jason the 2nd (`pr_explorer`): changed-surface mapping, scope creep, and reviewer hotspots.
  - Carver the 2nd (`reviewer`): correctness/regression risks.
  - Mendel the 2nd (`security_reviewer`): Tauri permissions, raw bridge exposure, provider/plugin boundaries, and failure leakage.
  - Nash the 2nd (`deprecation_auditor`): React 19/Vitest/RTL/Vite/Tauri API and StrictMode pattern review.
  - Pasteur the 2nd (`docs_researcher`): local-doc/current-guidance alignment.
  - McClintock the 2nd (`test_quality_reviewer`): acceptance coverage and brittleness.
- Deferred:
  - `doc_writer`: documentation gap review; retry after a thread slot opens.

### Jason the 2nd (`pr_explorer`) Outcome

- Status: completed read-only changed-surface mapping; no files edited and no tests run.
- Changed surface against `master`: committed changes are limited to TASK-015 frontend/bootstrap/provider/tests/docs surfaces; no committed `src-tauri`, Cargo, package, or lockfile changes.
- Runtime path mapped: `src/main.tsx` StrictMode -> `App` -> `RuntimeProvider` -> `createAppRuntime` -> NativeBridge/storage/Core stores/Core registries/Core services/PluginHost -> built-ins load/activate -> context -> shell.
- Hotspots for review:
  - `AppRuntime` includes `stores`, `registries`, `services`, and `pluginHost`, and `RuntimeProvider` exposes the whole runtime; acceptable only if strictly trusted App Shell UI and not plugin-rendered UI.
  - Storage is intentionally placeholder/in-memory; reviewers should verify TASK-015 acceptance allows initialized storage without persistence wiring.
  - Single-flight behavior is keyed by initializer identity and caches rejected promises indefinitely, matching current close/reopen failure UI but preventing same-initializer retry in-session.
  - `AppProps.initializeRuntime` is typed loosely as `Promise<object>` while `MirabilisShell` assumes `app.version`.
  - Boundary tests are mostly regex/file-list guards and do not prove future native/capability changes are absent beyond named files/patterns.
- Docs note: live `status.md` phase wording was stale while review-round state had already been added; parent should correct it in the next status update.

### Mendel the 2nd (`security_reviewer`) Outcome

- Status: completed read-only security review; no files edited and no tests run.
- P1 finding: public runtime provider exposes the full Core runtime to any React descendant. `AppRuntime` includes Core services plus `stores`, `registries`, `services`, and `pluginHost`; `RuntimeProvider` publishes that whole object through context; `useRuntime()` defaults to returning `AppRuntime`. A plugin-rendered component under this provider could import `useRuntime()` and bypass `PluginContext` ownership injection by directly using stores, registries, command register/unregister/execute, or plugin-host load/activation APIs.
- Required direction: narrow provider value to a shell/public runtime facade, or keep full runtime in a private app-shell module and pass plugin UI only controlled props or plugin-scoped facades.
- Confirmed no TASK-015 changes to Tauri config, capabilities, Rust commands, or generated permissions; no new raw `@tauri-apps/api` imports outside existing native bridge; startup failure UI is generic and does not stringify raw bootstrap errors.
- Residual preexisting risks unchanged from `master`: `csp: null` and main-window DB command capability.

### McClintock the 2nd (`test_quality_reviewer`) Outcome

- Status: completed read-only test-quality review; no files edited.
- Check run: `bun run test:frontend -- src/test/app-bootstrap-runtime.test.ts src/test/runtime-provider.test.tsx src/test/app-shell-boundary.test.ts` passed.
- P1 finding: plugin load/activation failure paths are not covered against real bootstrap. Current bootstrap rejection coverage fails before `PluginHost` exists, and the UI failure test injects a rejected initializer. A regression that swallows `loadBuiltInPlugins` or `activateAll` failures and returns a ready runtime could pass.
- P1 finding: native-expansion guard is too narrow for TASK-015's no-new-native-surface boundary. It scans fixed files and a small regex list, so new Tauri commands/capabilities with different names, new capability files, or broader permissions outside those patterns could pass. It should be diff-based against `master` or scan all relevant Tauri capability/Rust command surfaces.
- P2 finding: App Shell no-business-logic test is a useful smoke test but regex-only; consider import-boundary checks or a more explicit shell contract test.

### Pasteur the 2nd (`docs_researcher`) Outcome

- Status: completed read-only docs/current-guidance review; no files edited.
- Checks run: focused TASK-015 frontend tests passed; `bun run typecheck` passed.
- No P0/P1 docs or current-guidance mismatches found.
- Confirmed aligned:
  - Bootstrap order matches local runtime flow.
  - In-memory storage is honest via `persistence: "in-memory-core"`.
  - Built-ins are explicitly empty, matching current scope.
  - Failure UI is visible and generic.
  - No Tauri/capability/package dependency changes were introduced.
- P2/P1-related future boundary risk: `AppRuntime` exposes `stores`, `registries`, `services`, and `pluginHost`, and `RuntimeProvider` publishes that runtime to all React descendants. Pasteur considered this acceptable for the current trusted shell with an empty built-in plugin list, but required a trusted-shell boundary before plugin-provided views/slots render under the provider. Parent groups this with Mendel's P1 because TASK-015 acceptance includes runtime/provider boundary safety.
- P3 React 19 style drift: new code uses `<RuntimeContext.Provider>` rather than React 19's preferred `<RuntimeContext value={...}>`; still supported and non-blocking.
- Docs consulted: TASK-015 task index, runtime flow, plugin host/API boundary, NativeBridge/Tauri boundary, testing strategy, TASK-015 agent notes, plus current React, Testing Library, Vitest, and Tauri docs.

### Carver the 2nd (`reviewer`) Outcome

- Status: completed read-only correctness review; no files edited.
- Checks run: focused TASK-015 frontend tests passed; `bun run typecheck` passed; `bun run lint` passed.
- No P0/P1 correctness findings.
- P2 finding: `RuntimeProvider` permanently caches rejected startup promises. If bootstrap rejects once, remounting the provider with the same initializer immediately re-enters failure and cannot retry unless the app reloads. Carver considered this acceptable for the current close/reopen fallback, but a meaningful edge case before retry/reload UI or workspace switching.

### Nash the 2nd (`deprecation_auditor`) Outcome

- Status: completed read-only API/deprecation review; no files edited.
- Checks run: focused TASK-015 frontend tests passed; `git diff --check master...HEAD` passed.
- P1 finding: failed runtime initialization is cached permanently. The module `WeakMap` stores the initializer promise and never removes it; a rejected bootstrap poisons that initializer for the JS module lifetime. Safer: delete cache entry on rejection or model explicit reset/retry states.
- P2 finding: single-flight depends on stable initializer identity. Inline initializer functions can bypass the cache on parent rerenders and re-run bootstrap/plugin activation. Safer: require stable initializer, memoize with `useCallback`, accept a pre-created promise, or pin the mount-time initializer in a ref if changes are unsupported.
- P2 finding: new React 19 code uses the older `<RuntimeContext.Provider>` form. React 19 prefers `<RuntimeContext value={...}>`; current form still works.
- Checked/cleared: no deprecated Vitest/RTL APIs, no Tauri config/capability/Rust changes, Tauri API usage remains v2, and local Vite/Vitest Node requirements are satisfied.
- Docs verified: official React StrictMode/useEffect/createContext/React 19 notes, Vitest 4 migration, React Testing Library API, Vite 7 migration, and Tauri v2 migration/core API docs.

## Parent Decisions After Review Round 1

- P1 findings requiring delegated review-fix TDD:
  - Narrow or split the runtime provider surface so plugin/public descendants cannot access full Core runtime handles (`stores`, `registries`, `services`, `pluginHost`, raw bridge-like internals) through `useRuntime()`.
  - Add tests that real bootstrap rejects on `loadBuiltInPlugins` and `activateAll` failures and does not report ready when those plugin phases fail.
  - Strengthen the no-native-expansion guard so TASK-015 cannot add Tauri commands/capabilities/Rust command surfaces by changing names or files.
  - Fix rejected initialization caching so a failed initializer does not poison future mounts for the same initializer forever.
- P2 findings to include if small:
  - Guard or document stable initializer identity; prefer a pattern that avoids repeated bootstrap on parent rerenders with inline functions.
  - Strengthen App Shell no-business-logic checks beyond simple regex where practical.
  - Consider React 19 context provider syntax if the production fix naturally touches provider rendering.
- Parent next action: run a delegated review-fix red-test/implementation loop.

### Hubble the 2nd (`doc_writer`) Handoff

- Status: completed read-only review.
- Ownership: read-only documentation gap review for TASK-015 behavior and review findings.
- Focus: new bootstrap/provider modules, explicit empty built-in plugin list, in-memory storage facade honesty, startup failure UI, no Tauri permission expansion, App Shell boundaries, and review-fix need to narrow provider/public runtime surface.
- Restriction: no file edits.
- Recommendation: wait until after P1 review-fix narrows provider/public runtime surface before editing docs, because updating now would either document the unsafe current surface or pre-document behavior that is not implemented yet.
- P1 docs needed before merge after review-fix:
  - `docs/architecture/07-runtime-flows.md`: update startup flow to match `createAppRuntime()`, honest `persistence: "in-memory-core"` facade, in-memory Core stores, registries, services, Plugin Host, runtime, explicit `BUILT_IN_PLUGINS`, `loadBuiltInPlugins()`, and `activateAll()`.
  - `docs/architecture/07-runtime-flows.md`: replace concrete business built-in plugin examples with the TASK-015 reality that production built-ins are intentionally empty until later plugin tasks.
  - `docs/architecture/01-overview-and-monorepo.md`: add a current-layout note for `src/bootstrap/*` and `src/providers/*` without implying the future monorepo split exists today.
  - `docs/architecture/03-plugin-api-and-host.md`: document runtime-provider boundary after the review-fix, including that full Core runtime handles stay private to trusted bootstrap/App Shell code and plugin-rendered descendants receive plugin-scoped facades or controlled props.
- P2 docs recommended:
  - `docs/architecture/06-filter-native-database.md`: update TASK-014 note to say TASK-015 initializes NativeBridge during bootstrap but still does not wire Core stores to IPC persistence and adds no Tauri capability/permission expansion.
  - `docs/development/02-implementation-roadmap-and-constraints.md`: expand App Shell responsibilities to runtime bootstrap/provider, loading state, and generic startup failure UI while keeping plugin business logic out.
  - `docs/testing/strategy.md`: add durable TASK-015 guidance for bootstrap phase failures, provider surface narrowing, diff-based no-native-expansion guards, and failed-initialization retry/cache behavior.
