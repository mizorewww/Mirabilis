# TASK-038 Agent Communication - Add Sidebar Page And Saved-Filter Navigation

## Task

- ID: TASK-038.
- Name: Add Sidebar Page And Saved-Filter Navigation.
- Branch: `feat/task-038-sidebar-page-saved-filter-navigation`.
- Started: 2026-05-26 05:25 CST.
- Parent role: orchestration only. Parent delegates planning, docs/current API research, TDD tests, implementation, review, docs sync, and release readiness to specialized agents.

## Source Docs And Code Read By Parent

- `docs/implementation/task-index.md#task-038-add-sidebar-page-and-saved-filter-navigation`.
- `docs/product/07-user-interface-design.md`.
- `docs/product/02-core-data-model.md`.
- `docs/product/05-built-in-plugins.md`.
- `docs/product/06-view-slots.md`.
- `docs/architecture/07-runtime-flows.md#185-用户打开-all-tasks--today-filter-result`.
- `docs/architecture/07-runtime-flows.md#1812-user-runs-quick-capture`.
- `docs/development/01-data-roadmap-and-mvp.md`.
- `docs/testing/strategy.md`.
- Current TASK-037 Home workspace editor and `ViewHost`/`SlotHost` guidance.

## Initial Parent Interpretation

- TASK-038 turns the left MUI Drawer from placeholder route buttons into the first real navigation surface.
- Home remains the real Markdown workspace delivered by TASK-037.
- Page routes should change the selected workspace page and keep rendering the registered editor through `ViewHost`, not by importing editor/plugin internals into App Shell.
- Saved filter routes should use the existing Core filter/query executor and registered view path; All Tasks and Today should resolve `viewType: "page.list"` to the Task Plugin's `task.page-list` view.
- Inbox should be represented through public Quick Capture-owned page/filter semantics, not by reaching into Quick Capture private code.
- Recent pages are session-scoped UI state derived from current runtime pages, not durable navigation storage.

## Initial Constraints

- Write failing tests first.
- Tests must use React Testing Library and `@testing-library/user-event` for real user drawer open/close, route clicks, saved-filter clicks, and keyboard navigation.
- Use accessible role/name assertions for navigation, active state, Home, Inbox, All Tasks, Today, recent pages, empty/loading/unavailable states, and result lists.
- Do not directly import Task, Tag, Quick Capture, Search, Markdown editor private code, native/Tauri/Rust modules, or plugin internals into App Shell.
- Do not add package, lockfile, Tauri config, capability, generated permission, Rust, IPC, filesystem, persistence schema, or release changes.
- Missing, empty, loading, and unavailable route states must be visible and must not leak raw errors, plugin IDs, SQL, filesystem paths, native details, or private page IDs.

## Validation At Start

- 11 `.codex/agents/*.toml` files parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/network/websocket OK with known non-blocking unrestricted sandbox/network notes and known `TERM=dumb` terminal failure.
- `master` was up to date before the branch was created.

## Current Next Action

- Delegate pre-test guidance to planner, docs_researcher, deprecation_auditor, and security_reviewer.
- After guidance is summarized, delegate failing TASK-038 acceptance and boundary tests to `test_writer`.
