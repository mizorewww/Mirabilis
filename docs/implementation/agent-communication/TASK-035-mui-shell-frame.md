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

- Delegate read-only deprecation/security guidance.
- Delegate failing tests to `test_writer`.
