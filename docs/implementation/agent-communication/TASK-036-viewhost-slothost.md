# TASK-036 Agent Communication - Add Generic ViewHost And SlotHost

## Task

- ID: TASK-036.
- Name: Add Generic ViewHost And SlotHost.
- Branch: `feat/task-036-viewhost-slothost`.
- Started: 2026-05-26 02:05 CST.
- Parent role: orchestration only. Parent delegates current-doc/deprecation/security guidance, test writing, implementation, review, docs sync, and release readiness to specialized agents.

## Source Docs And Code Read By Parent

- `docs/implementation/task-index.md#task-036-add-generic-viewhost-and-slothost`.
- `docs/product/07-user-interface-design.md`.
- `docs/product/06-view-slots.md`.
- `docs/architecture/03-plugin-api-and-host.md`.
- `docs/architecture/04-slots-editor-task.md`.
- `docs/architecture/07-runtime-flows.md`.
- `docs/testing/strategy.md`.
- `src/core/registries/view-registry.ts`.
- `src/core/registries/slot-registry.ts`.
- Existing built-in plugin view/slot registration usages and tests.

## Initial Parent Interpretation

- TASK-036 should add trusted app-shell host components/helpers for rendering registry-owned views and slots, without yet mounting Home editor routes or real app data.
- `ViewHost` should resolve registered views by id/type, check caller-provided accepted data, and fail closed for missing, mismatched, malformed, thrown, unavailable, loading, empty, and error cases.
- `SlotHost` should render registered slot contributions by slot name in deterministic registry order, evaluate conditions only with controlled props, and isolate invalid/thrown contributions.
- Hosts must pass plugin-rendered React components only narrow controlled props/data. They must never expose full runtime handles or native/security surfaces.

## Initial Constraints

- Write failing tests before implementation.
- Tests should use React Testing Library and `@testing-library/user-event` where rendered slot controls are clicked and visible outcomes are asserted.
- Do not import business-plugin private implementations into app-shell host code.
- Do not add package, Tauri, Rust, IPC, capability, permission, persistence, schema, filesystem, release, or native behavior changes.
- Preserve public `useRuntime()` as the `{ app }` facade.

## Validation At Start

- 11 `.codex/agents/*.toml` files parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/WebSocket/reachability OK with known non-blocking unrestricted sandbox/network notes and known `TERM=dumb` terminal failure.

## Current Next Action

- Delegate implementation to `implementer`.

## Pre-Test Guidance Outcomes

- Pasteur (`docs_researcher`) verified current official guidance:
  - render registry components through JSX or `createElement`, not direct component function calls;
  - use real class Error Boundaries for render failures because parent `try/catch` cannot catch child render errors;
  - use Testing Library role/name queries and `userEvent.setup()` with awaited interactions;
  - use MUI v9 path imports for state/layout primitives such as `Alert`, `CircularProgress`, `Skeleton`, `Box`, and `Stack`;
  - avoid deprecated MUI patterns such as barrels, `@material-ui/*`, `GridLegacy`, `Hidden`, `components` / `componentsProps`, `createMuiTheme`, and `MuiThemeProvider`.
- Copernicus (`deprecation_auditor`) found no P0 and identified P1 risks:
  - plugin render-error isolation must use a real Error Boundary with `static getDerivedStateFromError`;
  - existing direct-render helper tests must not become the generic host pattern;
  - resolving by `viewType` must fail closed on zero or ambiguous matches unless explicitly disambiguated;
  - `SlotHost` must trust `SlotRegistry.list({ slot })` ordering and isolate each contribution's `when` and render failures.
- Singer (`security_reviewer`) defined security acceptance criteria:
  - plugin-rendered views/slots must receive only narrow controlled props/data/callbacks;
  - full runtime, Core stores, registries, Plugin Host, NativeBridge, raw invoke, DB/storage, filesystem/path, provider settings, secrets, and command mutation handles are P0 leaks;
  - `when` receives only the same narrow controlled props as the component and only literal `true` renders;
  - missing, malformed, wrong-kind, thrown, unavailable, and ambiguous view/slot states must fail closed with redacted UI;
  - TASK-036 must not touch package, lockfile, Tauri, Rust, IPC, capabilities, permissions, schema, or release surfaces.
- Bernoulli (`planner`) recommended the smallest safe implementation slice:
  - create app-shell infrastructure under `src/shell/hosts/`;
  - likely files: `ViewHost.tsx`, `SlotHost.tsx`, `PluginRenderBoundary.tsx`, and `index.ts`;
  - do not put React rendering in Core;
  - do not mount Home, Markdown editor, metadata/timeline, dialogs, Calendar/Reports, ML/AI, or route data in this task;
  - use optional `isPluginAvailable(pluginId)` predicates for availability until later shell integration can derive active plugin records.
- Parent decision: accept guidance. The test writer should add failing RTL tests and static guards before implementation.

## Test Writer Outcome

- Cicero (`test_writer`) added `src/test/view-slot-hosts.test.tsx`.
- Coverage added:
  - `ViewHost` exact-id render, unambiguous view-type render, ambiguous type fail-closed, missing/wrong/missing-kind/getter-backed/function-bearing DTO fail-closed, loading/empty/error states, thrown render boundary recovery, unavailable plugin, unsafe-prop redaction, and public `useRuntime()` facade boundary.
  - `SlotHost` ordering/default-tie behavior, condition true/false/thrown/non-boolean behavior, per-contribution render isolation, user-event callback flow, mutation isolation, and redacted fallbacks.
  - Static guards for no package/lock/native/Tauri/Rust/capability/release drift and no forbidden host imports/patterns.
- Parent red validation: `bun run test:frontend -- src/test/view-slot-hosts.test.tsx` failed as expected with 11 failures for missing `../shell/hosts` and missing expected host production files; 1 static native-surface guard test passed.
- `git diff --check` passed.
- Test commit: `80ad0f2 Cicero(test)(Add Generic ViewHost And SlotHost): add host boundary acceptance tests`.
- Parent decision: delegate implementation to `implementer`.
