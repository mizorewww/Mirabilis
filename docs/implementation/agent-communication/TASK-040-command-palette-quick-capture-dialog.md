# TASK-040 Agent Communication - Add Command Palette And Quick Capture Dialog

## Task

- ID: TASK-040.
- Name: Add Command Palette And Quick Capture Dialog.
- Branch: `feat/task-040-command-palette-quick-capture-dialog`.
- Started: 2026-05-31 18:59 CST.
- Parent role: orchestration only. Parent delegates planning, docs/current API research, TDD tests, implementation, review, docs sync, and release readiness to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-040-add-command-palette-and-quick-capture-dialog`.
- `docs/product/07-user-interface-design.md`.
- `docs/product/03-plugin-platform.md`.
- `docs/product/05-built-in-plugins.md#25-quick-capture-plugin`.
- `docs/product/06-view-slots.md`.
- `docs/architecture/03-plugin-api-and-host.md`.
- `docs/architecture/05-plugin-implementations.md#133-quick-capture--search-plugin`.
- `docs/architecture/07-runtime-flows.md#1812-user-runs-quick-capture`.
- `docs/testing/strategy.md`.
- TASK-039 metadata/timer/timeline slot mounting closeout.

## Initial Parent Interpretation

- TASK-040 turns the existing top-bar command and Quick Capture placeholder controls into real app-shell modal workflows.
- The Markdown workspace remains the first screen; dialogs overlay it rather than replacing the route.
- Command palette should list Command Registry descriptors, filter by typed input, and execute selected commands only through Command Registry.
- Quick Capture should open through `quick-capture.open`, render the registered `quick-capture.modal` view or a shell-owned MUI wrapper, save through `quick-capture.save`, and save-and-open through `quick-capture.save-and-open`.
- `save-and-open` is an app-shell navigation responsibility: the Quick Capture command returns the trusted Inbox page id, then App Shell navigates through normal page-route state.

## Initial Constraints

- Write failing tests first.
- Tests must use React Testing Library and `@testing-library/user-event` for real opening, typing, keyboard selection, clicking, save/cancel/error, Escape, and focus-return flows.
- Dialogs must have accessible names, initial focus, Escape/cancel handling, focus return, disabled/pending states, and non-leaky errors.
- Command execution must go through Command Registry only; App Shell must not import Quick Capture private implementation internals or mutate stores directly.
- Quick Capture captured Markdown remains inert structured text; Task/Tag/AI cleanup is deferred.
- Native/global shortcut, mobile toolbar mounting, background capture, persistence beyond current runtime, package, lockfile, Tauri config, capability, generated permission, Rust, IPC, filesystem, schema, release, and native changes are out of scope.

## Validation At Start

- 11 `.codex/agents/*.toml` files parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/network/websocket OK with known non-blocking unrestricted sandbox/network notes and known `TERM=dumb` terminal failure.
- `master` was clean and pushed after TASK-039 merge-result validation before the branch was created.

## Current Next Action

- Collect pre-test guidance from planner, current-doc, security, and deprecation agents before delegating failing TASK-040 acceptance tests.
