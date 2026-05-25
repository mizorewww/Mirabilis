# TASK-035 Agent Communication - Add MUI Substrate And First Shell Frame

## Task

- ID: TASK-035.
- Name: Add MUI Substrate And First Shell Frame.
- Branch: `feat/task-035-mui-shell-frame`.
- Started: 2026-05-26 01:16 CST.
- Parent role: orchestration only. Parent delegates current-doc/deprecation/security guidance, test writing, implementation, review, docs sync, and release readiness to specialized agents.

## Source Docs And Code Read By Parent

- `docs/implementation/task-index.md#task-035-add-mui-substrate-and-first-shell-frame`.
- `docs/product/07-user-interface-design.md`.
- `docs/testing/strategy.md#task-015-app-bootstrap-and-runtime-provider-guidance`.
- `src/App.tsx`.
- `src/App.css`.
- `src/providers/*`.
- `src/bootstrap/create-app-runtime.ts`.

## Current Official Guidance Already Gathered

- MUI default install uses `@mui/material`, `@emotion/react`, and `@emotion/styled`.
- `@mui/icons-material` is installed separately when using Material icons.
- MUI React peer ranges include React 19, and this repo already has React/React DOM 19.
- Use Emotion, MUI's default styling engine.
- Use `ThemeProvider` and `CssBaseline`.
- Prefer path imports for MUI components and icons.
- Use React Testing Library plus `@testing-library/user-event` for realistic user interactions.

## Initial Parent Interpretation

- TASK-035 should install the MUI substrate and replace the startup card with a real app frame, but not yet mount editor/page/filter/plugin routes.
- This task should render the visible shape of the product: top bar, left navigation frame, central workspace region, and placeholder affordances for later routes.
- The implementation must keep loading and startup failure states visible and redacted.

## Initial Constraints

- Write failing tests before implementation.
- Tests must simulate real user clicks/keyboard through RTL + user-event.
- Keep `useRuntime()` as the public `{ app }` facade.
- Do not expose full runtime handles to plugin-rendered descendants.
- Do not add Tauri/native/Rust/capability/permission/IPC/schema/release behavior changes.
- Package/lockfile changes must be limited to reviewed MUI dependencies.

## Validation At Start

- 11 `.codex/agents/*.toml` files parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/WebSocket/reachability OK with known non-blocking unrestricted sandbox/network notes and `TERM=dumb` terminal failure.

## Current Next Action

- Commit TASK-035 closeout, merge `feat/task-035-mui-shell-frame` to `master`, run merge-result validation, and continue to TASK-036.

## Pre-Test Guidance Outcomes

- Ohm (`deprecation_auditor`) found no P0. It found one P1: the existing native/package guard only recognizes old TASK-033 release diffs and would reject TASK-035's required MUI `package.json` / `bun.lock` changes. It recommended a narrow reviewed exception for only `@mui/material`, `@emotion/react`, `@emotion/styled`, `@mui/icons-material`, and generated lockfile changes.
- Ohm recommended avoiding stale/deprecated MUI patterns: `@material-ui/*`, `createMuiTheme`, `MuiThemeProvider`, `makeStyles`, `Hidden`, `GridLegacy`, `ListItem button`, deprecated `components/componentsProps`, and old system-prop patterns where `sx` should be used.
- Ohm recommended moving global reset/font/background behavior into MUI theme / `CssBaseline` where practical and keeping `App.css` for app-specific layout only.
- Pauli (`security_reviewer`) found no P0. It identified P1 hazards: TASK-035 is not acceptance-ready before implementation, the package/native guard must be tightened for TASK-035, and any trusted shell-internal full-runtime channel must not reuse or export the public provider.
- Pauli required tests for:
  - real user clicks/keyboard on shell controls with RTL + `userEvent.setup()`;
  - `banner`, `navigation`, `main`, visible loading, and redacted failure states;
  - `useRuntime()` remaining a public `{ app }` facade;
  - no Tauri/native/business-plugin/Core-owner imports in App Shell;
  - package/lockfile changes limited to the reviewed MUI dependency quartet and no native/release surface changes.
- Parent decision: accept the guidance. The test writer should write failing tests first, including the narrowed package/native guard and realistic user interaction tests.

## Test Writer Outcome

- Boyle (`test_writer`) added failing shell acceptance tests before implementation.
- Files changed by Boyle:
  - `src/test/mui-shell-frame.test.tsx`;
  - `src/test/native-surface-guard.ts`.
- Parent red validation: `bun run test:frontend -- src/test/mui-shell-frame.test.tsx src/test/app-shell-boundary.test.ts src/test/runtime-provider.test.tsx` failed as expected because the existing app still rendered the startup card and did not yet include the reviewed MUI dependencies/path imports.
- Test commit: `71999fa Boyle(test)(Add MUI Substrate And First Shell Frame): add MUI shell acceptance tests`.

## Implementation Outcome

- Turing (`implementer`) installed the reviewed MUI dependency quartet with Bun:
  - `@mui/material`;
  - `@emotion/react`;
  - `@emotion/styled`;
  - `@mui/icons-material`.
- Turing replaced the ready-state startup card with a MUI themed shell using `ThemeProvider`, `CssBaseline`, a named `banner`, named workspace `navigation`, central named `main`, top-bar action buttons, placeholder route regions, and a minimal drawer/nav interaction.
- Loading and startup failure states remain visible and redacted.
- `useRuntime()` still exposes the public frozen `{ app }` facade.
- Files changed by Turing:
  - `package.json`;
  - `bun.lock`;
  - `src/App.tsx`;
  - `src/App.css`;
  - `src/test/mui-shell-frame.test.tsx`.
- Turing reported these checks passing:
  - `bun run test:frontend -- src/test/mui-shell-frame.test.tsx src/test/app-shell-boundary.test.ts src/test/runtime-provider.test.tsx`;
  - `bun run typecheck`;
  - `bun run lint`;
  - `bun run build`;
  - `git diff --check`.
- Parent validation passed:
  - `bun run test:frontend -- src/test/mui-shell-frame.test.tsx src/test/app-shell-boundary.test.ts src/test/runtime-provider.test.tsx` passed with 3 files / 20 tests;
  - `bun run typecheck`;
  - `bun run lint`;
  - `git diff --check`;
  - `bun run build`;
  - `bun run check:quick` passed with 39 frontend test files / 597 tests, Rust fmt, Rust clippy, and Rust tests.
- Build note: `bun run build` succeeds but emits the existing Vite/Rollup warning that the generated JS chunk is larger than 500 kB after adding MUI.
- Implementation commit: `b9cb0e7 Turing(implementation)(Add MUI Substrate And First Shell Frame): implement MUI shell frame`.

## Review Notes Received

- Nash (`doc_writer` / docs sync review) reported no production-code change request, but found documentation-sync gaps to fix before TASK-035 closeout.
- P1: `docs/implementation/progress.md` only recorded the start state. It needs an implementation validation / review-pending run-log entry with delivered scope, checks, the MUI build chunk warning, and review status, while keeping TASK-035 `[~]` until final merge closeout.
- P1: `docs/implementation/agent-communication/status.md` was stale. It needs the current phase, received review notes, corrected M9 snapshot, and accurate active/pending docs-fix work.
- P2: `docs/product/07-user-interface-design.md` needs a current-status note explaining that TASK-035 now provides the baseline MUI substrate and shell frame, while ViewHost/SlotHost, editor mounting, dialogs, Portal slots, responsive polish, and real route data remain TASK-036+.
- P2: `docs/implementation/task-index.md` needs a concise delivered/deferred note for TASK-035: MUI quartet, `ThemeProvider`/`CssBaseline`, `AppBar`/`Drawer`/`main` shell, placeholder Home/Inbox/Today/All Tasks/Reports routes, top-bar placeholder tools, no full runtime channel, and no IPC/Tauri/native/security surface change.
- P2: `docs/testing/strategy.md` needs TASK-035 guidance for `src/test/mui-shell-frame.test.tsx`, RTL/user-event shell interactions, runtime facade/failure redaction, MUI path/deprecated guards, and the narrow MUI package/lock guard exception.
- Parent decision: accept Nash's findings and perform a docs-only fix in the allowed documentation files, then validate with `git diff --check`.

## Review Fixes And Closeout

- Carver (`test_writer`) closed the test-quality/security package-boundary findings by:
  - adding user-event coverage for drawer hide/restore;
  - adding user-event coverage for Command/Search/Quick Capture/Settings action state and visible status;
  - tightening placeholder assertions;
  - validating the exact reviewed TASK-035 Bun lock package graph through parsed lockfile sections and package-entry fingerprints.
- Peirce (`doc_writer`) closed Nash's docs-sync findings by updating the progress ledger, live status, TASK-035 communication, product UI design status note, TASK-035 task-index delivered/deferred note, and testing strategy guidance.
- Plato (`test_writer`) closed the final test-quality P2 by proving Command can be reactivated from an inactive state.
- Narrow re-reviews:
  - Dewey (`doc_writer`) found no remaining docs-sync findings.
  - Socrates (`security_reviewer`) found no remaining package/lock/native/runtime boundary findings.
  - Dirac (`release_checker`) found no P0/P1 readiness blockers and confirmed `check:full` is not required for TASK-035.
  - Gauss (`test_quality_reviewer`) found no P0/P1 blockers before Plato's final P2 test hardening.
- Parent final validation:
  - `bun run test:frontend -- src/test/mui-shell-frame.test.tsx src/test/app-shell-boundary.test.ts src/test/runtime-provider.test.tsx` passed with 3 files / 22 tests.
  - `bun run typecheck`, `bun run lint`, `git diff --check`, and `bun run build` passed.
  - `bun run check:quick` passed with 39 frontend test files / 599 tests, Rust fmt, Rust clippy, and Rust tests.
- Remaining accepted P2: `bun run build` emits the Vite/Rollup warning that one generated JavaScript chunk is larger than 500 kB after adding MUI. This is deferred until real route/view mounting and should use current Vite 7 guidance if it becomes actionable.
- Parent decision: TASK-035 is complete and ready to merge into `master`.
