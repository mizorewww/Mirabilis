# TASK-041 Agent Communication - Add Search Overlay And Results Route

## Task

- ID: TASK-041.
- Name: Add Search Overlay And Results Route.
- Branch: `feat/task-041-search-overlay-results-route`.
- Started: 2026-05-31 20:09 CST.
- Parent role: orchestration only. Parent delegates planning, docs/current API research, TDD tests, implementation, review, docs sync, and release readiness to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-041-add-search-overlay-and-results-route`.
- `docs/product/07-user-interface-design.md`.
- `docs/product/05-built-in-plugins.md#26-search-plugin`.
- `docs/product/06-view-slots.md`.
- `docs/architecture/05-plugin-implementations.md#search-plugin`.
- `docs/architecture/07-runtime-flows.md`.
- `docs/testing/strategy.md`.
- TASK-040 Command Palette / Quick Capture dialog closeout.

## Initial Parent Interpretation

- TASK-041 turns the existing top-bar Search placeholder into a real app-shell search workflow.
- The Markdown workspace remains the first screen; Search opens as a MUI Dialog or overlay rather than replacing the route immediately.
- Search must execute the existing `search.query` command through Command Registry with bounded plain query input and exact payload shape.
- Results should render through the registered `search.results` view or a bounded shell-owned DTO route, and selecting a result should navigate to that page through normal app-shell page route state.
- Route/dialog state must not store full page bodies or create any persistent index.

## Initial Constraints

- Write failing tests first.
- Tests must use React Testing Library and `@testing-library/user-event` for opening search, typing queries, keyboard submit, Escape/close, loading, empty, result, error, result click, navigation, and focus-return flows.
- Accessible names and roles must cover the search textbox, dialog/overlay, status, list/listitems, result buttons/links, and routed page content.
- Command Palette and Search keyboard/focus flows must not conflict.
- Persistent search indexing, background search worker, SQLite FTS, native/global search shortcuts, ranking beyond existing plugin behavior, package, lockfile, Tauri config, capability, generated permission, Rust, IPC, filesystem, schema, release, and native changes are out of scope.

## Validation At Start

- 11 `.codex/agents/*.toml` files parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/network/websocket OK with known non-blocking unrestricted sandbox/network notes and known `TERM=dumb` terminal failure.
- `master` was clean and pushed after TASK-040 merge-result validation before the branch was created.

## Current Next Action

- Run pre-test planner, docs/current API, security, and deprecation agents before delegating red tests.
