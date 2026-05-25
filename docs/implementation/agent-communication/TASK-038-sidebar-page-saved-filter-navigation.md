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

- Delegate failing TASK-038 acceptance and boundary tests to `test_writer`.

## Pre-Test Guidance Outcomes

- Kierkegaard (`planner`) recommended the narrow TASK-038 slice:
  - replace placeholder Drawer navigation with real Home, Inbox, All Tasks, Today, recent pages, and filter-backed plugin groups;
  - keep Home and recent pages as page routes rendered through `markdown.page-editor` / `page.editor` via `ViewHost`;
  - treat Inbox, All Tasks, and Today as aliases to public saved filters `quick-capture.filter.inbox`, `task.filter.all-tasks`, and `task.filter.today`;
  - execute saved filters through `executeFilterQuery`, render filter `viewType` through `ViewHost`, and render empty results through `SlotHost` on `filter.empty_state`;
  - defer metadata/timer/timeline/global slots, Quick Capture dialog, Search overlay, Calendar/Reports projections, ML/AI panels, Settings/Sync routes, responsive polish, persistent navigation, save-time indexing, Event `within`, native/Tauri/Rust/package changes, and arbitrary view routes.
- Kierkegaard recommended one shell-owned route state:

```ts
type ActiveRoute =
  | { kind: "page"; pageId: string; role: "home" | "recent" | "command-open" }
  | { kind: "filter"; filterId: string; role: "inbox" | "all-tasks" | "today" | "saved" };
```

- Anscombe (`docs_researcher`) verified official docs for MUI v9 Drawer/List/ListItemButton/Collapse/useMediaQuery/icons/path imports, MUI v9 migration, W3C `aria-current`, React 19, Testing Library/user-event, Vitest, and jsdom. Key recommendations:
  - use MUI path imports only;
  - use `selected` for MUI styling and `aria-current="page"` for active route semantics;
  - use `userEvent.setup()` with awaited `click`, `keyboard`, and `tab`;
  - assert visible route/view outcomes, not transition timing, pixel layout, or media-query geometry in jsdom;
  - `check:full` is not required for this TypeScript/MUI shell-navigation task unless forbidden native/package/release surfaces change.
- Ramanujan (`security_reviewer`) defined the strict route and filter boundary:
  - public `useRuntime()` remains frozen `{ app }`;
  - App Shell must not import Task, Tag, Quick Capture, Search, Markdown editor, native, or plugin-private components;
  - saved-filter routes must execute only public `FilterDefinition`s through `executeFilterQuery` with active plugin ownership and metadata owner reservations;
  - Inbox must use Quick Capture's public `quick-capture.filter.inbox` and Quick Capture-owned `quick-capture.unprocessed=true` semantics, never title-only Inbox lookup or Quick Capture private code;
  - filter result views must receive DTO projections only, not raw pages, bodies, metadata, events, filter query JSON, runtime handles, or native surfaces;
  - missing, malformed, inactive, ambiguous, thrown, or unavailable route/view/slot states must be accessible and non-leaky.
- Mill (`deprecation_auditor`) found no P0/P1 blockers. It advised avoiding MUI v9 removed props (`PaperProps`, `SlideProps`, `BackdropProps`, `TransitionComponent`, `componentsProps`, stale `ListItem button`, typography props), MUI/Icons barrel imports, React 19 removed test APIs, `legacyRoot`, and selected-state-only route assertions.

## Parent Decisions

- Interpret "plugin route groups" as filter-backed plugin groups only for TASK-038. Arbitrary registered plugin view routes remain deferred until explicit DTO projections are designed in later tasks.
- Adopt Ramanujan's stricter DTO boundary over the current full-page test helper pattern: saved-filter route `ViewHost` props should pass safe page summaries such as `{ id, title }`, not full `MarkdownPage` objects.
- Require red tests for user-visible route behavior, DTO-only filter props, Quick Capture Inbox trust semantics, forged metadata exclusion, missing/unavailable state redaction, keyboard activation, and static no-drift/no-private-import boundaries before production implementation.
