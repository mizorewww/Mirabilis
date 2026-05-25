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

- Delegate failing tests to `test_writer`.

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
