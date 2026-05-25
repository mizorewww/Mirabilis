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

- Wait for Herschel (`implementer`) to fix the committed review regressions, then run focused and adjacent validation before re-review.

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

## Test Writer Outcome

- Heisenberg (`test_writer`) added failing TASK-038 acceptance and boundary coverage in commit `87d483a`.
- Changed files:
  - `src/test/sidebar-page-filter-navigation.test.tsx`.
- Coverage added:
  - Home and recent page navigation through registered `markdown.page-editor` / `page.editor` via `ViewHost`;
  - All Tasks, Today, and Inbox saved-filter route selection through user clicks;
  - All Tasks includes todo and done task pages while excluding archived pages and forged metadata;
  - Today uses deterministic local date semantics and shows only unfinished due/scheduled-today pages;
  - Inbox uses public `quick-capture.save` semantics and ignores title-only Inbox pages;
  - filter result views receive safe page-summary DTOs only;
  - empty filters render `filter.empty_state` through `SlotHost` with minimal props;
  - missing filter/view/unavailable plugin route states are generic, accessible, and redacted;
  - Drawer keyboard activation uses `Tab` and `Enter`;
  - static guards reject direct business-plugin private imports, raw Tauri/native imports, stale MUI/React APIs, and package/native/release drift.
- Parent red validation:
  - `bun run test:frontend -- src/test/sidebar-page-filter-navigation.test.tsx src/test/mui-shell-frame.test.tsx src/test/app-shell-boundary.test.ts` failed as expected with 1 failed file / 2 passed files and 7 failed / 22 passed tests because production still lacks recent page navigation, saved-filter rendering, and generic unavailable route states.
  - `bun run typecheck` passed.
  - `git diff --check` passed.
  - `.only/.skip` scan on `src/test/sidebar-page-filter-navigation.test.tsx` found no matches.
- Parent decision:
  - accept `87d483a` as the red baseline;
  - delegate production code to `implementer`, preserving the TASK-038 no-package/no-native/no-private-import/DTO-only constraints.

## Implementation Outcome

- Hypatia (`implementer`) updated production app-shell navigation/filter routing in commit `84eac3d`.
- Changed production files:
  - `src/App.tsx`.
- Delivered behavior:
  - Home and recent page routes render the registered Markdown page editor through `ViewHost`;
  - Inbox, Today, and All Tasks resolve public saved filters from `runtime.filters`;
  - saved filters execute through `executeFilterQuery` with metadata owner reservations derived from active public plugin manifests;
  - filter results render through registered `viewType` via `ViewHost` using DTO-only page summaries `{ id, title }`;
  - empty filters render `filter.empty_state` through `SlotHost` with minimal `filterName` props;
  - missing filter, missing view, and inactive plugin routes show generic redacted route-unavailable UI;
  - Drawer active state uses `aria-current="page"` and MUI `ListItemButton` keyboard activation remains intact.
- Boundary confirmations:
  - Inbox uses Quick Capture public saved-filter / metadata semantics and ignores title-only Inbox pages;
  - App Shell does not import Task, Tag, Quick Capture, Search, Markdown editor private modules, raw Tauri/native modules, or plugin view components;
  - no package, lockfile, Tauri config/capability/permission, Rust, IPC, schema, filesystem, native, or release files changed.
- Test follow-up:
  - Hypatia removed stale lint suppressions in `src/test/sidebar-page-filter-navigation.test.tsx` in commit `1c31a8c`.
  - Locke (`test_writer`) updated stale TASK-037 non-Home route assertions in `src/test/home-workspace-editor.test.tsx` in commit `f43b109`. The delayed hosted `openPage` regression still proves Today remains active, Home does not remount, and the returned task page body stays hidden; Inbox/Today/All Tasks now assert saved-filter empty states while Reports remains placeholder.
- Parent validation:
  - `bun run test:frontend -- src/test/sidebar-page-filter-navigation.test.tsx src/test/mui-shell-frame.test.tsx src/test/app-shell-boundary.test.ts` passed with 3 files / 29 tests.
  - `bun run test:frontend -- src/test/sidebar-page-filter-navigation.test.tsx src/test/home-workspace-editor.test.tsx src/test/view-slot-hosts.test.tsx src/test/task-filters-view-rendering.test.tsx src/test/quick-capture-search-plugins.test.tsx` passed with 5 files / 82 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - package/native/Tauri/Rust/capability/release diff check returned no files.
- Parent decision:
  - accept implementation and test-sync commits;
  - run review agents before branch gate and closeout.

## Review And Regression-Test Outcome

- Review agents found no deprecated API blockers, but did find TASK-038 follow-ups that must close before branch gate:
  - filter result route props still exposed raw Markdown page IDs instead of opaque route tokens;
  - public saved filters such as `#today` could be hidden when their names contained primary route labels;
  - missing filter views could fall through to empty-state slots when result sets were empty;
  - metadata owner reservations were derived only from active plugins, leaving inactive/missing owner namespaces too open;
  - Recent pages title filtering hid user pages named like primary routes.
- Helmholtz (`test_writer`) added failing regression coverage in commit `a3e7b94`.
- Parent red validation confirmed the review regressions are red for the expected reasons, while adjacent MUI shell and app-shell boundary tests still pass.
- Parent decision:
  - keep the red tests as the new review-fix baseline;
  - delegate production fixes to Herschel (`implementer`) with write scope focused on `src/App.tsx` and no package/native/Tauri/Rust/release changes.

## Review-Fix Implementation Outcome

- Herschel (`implementer`) fixed the TASK-038 review regressions in commit `d58c236`.
- Changed production files:
  - `src/App.tsx`.
- Delivered fixes:
  - saved-filter views now receive `{ routeToken, title }` DTOs instead of real Markdown page IDs;
  - the Saved Filters Drawer excludes only primary filter IDs and no longer suppresses public filters such as `#today` by name substring;
  - saved-filter routes verify that the target view is available before executing filters or showing empty-state slots;
  - metadata owner reservations are collected from all plugin manifests exposed by the runtime instead of only active plugins;
  - Recent pages no longer hide user pages whose titles match primary route labels.
- Parent validation after Herschel:
  - `bun run test:frontend -- src/test/sidebar-page-filter-navigation.test.tsx src/test/mui-shell-frame.test.tsx src/test/app-shell-boundary.test.ts` passed with 3 files / 33 tests.
  - `bun run test:frontend -- src/test/sidebar-page-filter-navigation.test.tsx src/test/home-workspace-editor.test.tsx src/test/view-slot-hosts.test.tsx src/test/task-filters-view-rendering.test.tsx src/test/quick-capture-search-plugins.test.tsx` passed with 5 files / 86 tests.
  - `bun run typecheck`, `bun run lint`, and `git diff --check` passed.
- Parent decision:
  - accept `d58c236`;
  - run re-review agents for correctness, security, test quality, deprecation/API, changed-path exploration, and docs sync;
  - carry Descartes' M9 UI roadmap split into TASK-038 docs sync and TASK-039 kickoff.

## M9 Remaining UI Roadmap Split

- Descartes (`planner`) completed a read-only split of the remaining M9 UI work.
- TASK-039 remains next after TASK-038 closes: mount current-page metadata, timer, and timeline slots with MUI surfaces and page-scoped slot/command props.
- TASK-040 should add the command palette and Quick Capture dialog using MUI dialogs and realistic click/type/keyboard tests.
- TASK-041 should add a search overlay and result route using bounded result DTOs.
- TASK-042 should add Calendar and Reports routes with explicit data projections.
- TASK-043 should add ML and AI context panels without provider secrets, live network calls, or raw workspace dumps.
- TASK-044 should add Settings and Sync placeholders without accepting or persisting credentials.
- TASK-045 should polish responsive state and accessibility without adding new product behavior.
- Descartes' P1 docs-design gaps to consider during closeout or kickoff:
  - update TASK-038 delivered/deferred route model in product/testing/task-index/progress docs;
  - define TASK-039 metadata-header versus SlotHost boundaries before tests;
  - define TASK-040 executable command payload policy before tests;
  - define TASK-042 first Reports aggregation before tests;
  - define TASK-045 matchMedia/responsive testing strategy before tests.

## Final Re-Review Findings And Regression Tests

- Re-review agents after `d58c236` found no deprecated API blockers and no correctness P0/P1, but found remaining P1 gaps:
  - Helmholtz the 2nd (`test_quality_reviewer`) found that filter routes hid the Recent pages section even though TASK-038 acceptance requires Drawer recent pages to remain available.
  - Franklin (`security_reviewer`) found incomplete fail-closed behavior for inactive/missing metadata owner namespaces and for runtimes where plugin ownership data is unavailable.
- P2 cleanup accepted for the same final fix round:
  - keep saved filter accessible names equal to the visible saved filter names;
  - align the built-in task page-list view contract with hardened route-token DTOs instead of raw `MarkdownPage[]`.
- Carson the 2nd (`test_writer`) added failing final regression tests in commit `7454c9c`.
- Parent red validation:
  - `bun run test:frontend -- src/test/sidebar-page-filter-navigation.test.tsx` failed as expected with 17 tests, 3 failed, and 14 passed.
  - The failures matched Recent pages hidden on a filter route, inactive-owner legacy metadata leaking into a saved-filter result, and missing plugin ownership data failing open.
  - `bun run typecheck` and `git diff --check` passed.
- Parent decision:
  - accept `7454c9c` as the final red baseline;
  - delegate production fixes to Mendel the 2nd (`implementer`) with write scope limited to `src/App.tsx` and, if needed for DTO contract cleanup, `src/plugins/task/components/TaskFilterViews.tsx`.

## Final Review-Fix Implementation Outcome

- Mendel the 2nd (`implementer`) fixed the final P1 review regressions in commit `7b4d5c0`.
- Changed production files:
  - `src/App.tsx`;
  - `src/plugins/task/components/TaskFilterViews.tsx`.
- Delivered fixes:
  - Recent pages remain available on valid filter routes and still open registered page editor routes;
  - unavailable filter routes hide Recent pages to avoid leaking unrelated page titles when route ownership cannot be trusted;
  - filter source/view/plugin ownership checks fail closed when `pluginHost.listPlugins` ownership data is unavailable;
  - filter execution only considers active-plugin metadata and requires queried metadata namespaces to have active owner reservations;
  - the built-in task page-list view consumes `{ routeToken, title }` DTOs rather than raw `MarkdownPage[]`.
- Parent validation after Mendel the 2nd:
  - `bun run test:frontend -- src/test/sidebar-page-filter-navigation.test.tsx` passed with 1 file / 17 tests.
  - `bun run test:frontend -- src/test/sidebar-page-filter-navigation.test.tsx src/test/mui-shell-frame.test.tsx src/test/app-shell-boundary.test.ts` passed with 3 files / 36 tests.
  - `bun run test:frontend -- src/test/sidebar-page-filter-navigation.test.tsx src/test/home-workspace-editor.test.tsx src/test/view-slot-hosts.test.tsx src/test/task-filters-view-rendering.test.tsx src/test/quick-capture-search-plugins.test.tsx` passed with 5 files / 89 tests.
  - `bun run typecheck`, `bun run lint`, and `git diff --check` passed.
- Parent decision:
  - accept `7b4d5c0`;
  - run final targeted re-review for correctness, security, and test quality before docs sync and branch gate.

## Final Test-Hardening Outcome

- Final targeted re-review after `7b4d5c0`:
  - Nietzsche the 2nd (`security_reviewer`) found no P0/P1/P2.
  - Bernoulli the 2nd (`reviewer`) found no P0/P1 and one P2: saved-filter accessible names can diverge from visible labels.
  - Carver the 2nd (`test_quality_reviewer`) found P1 coverage gaps for exact `{ routeToken, title }` DTOs, the built-in task page-list contract, and unowned metadata namespace fail-closed behavior.
- Confucius the 2nd (`test_writer`) added test-hardening coverage in commit `1304174`.
- New coverage:
  - route result DTO helpers now require `routeToken` plus `title` and reject previous `id`/`key`/`routeKey` aliases;
  - real built-in `task.page-list` rendering is exercised through All Tasks and Today user routes without leaking raw page IDs or bodies;
  - `TaskPageListViewProps` must match the route-token DTO contract;
  - saved filters over unowned metadata namespaces must fail closed without leaking matched page data;
  - visible saved-filter labels such as `Today Review` must remain available as accessible names.
- Parent red validation:
  - `bun run test:frontend -- src/test/sidebar-page-filter-navigation.test.tsx` failed as expected with 1 failure for `Today Review` label-in-name accessibility.
  - `bun run typecheck` failed as expected because the task page-list DTO still allowed an optional `routeToken`.
  - `git diff --check` passed.
- Parent decision:
  - accept `1304174` as the final test-hardening baseline;
  - delegate final production polish to Poincare the 2nd (`implementer`) with write scope limited to `src/App.tsx` and `src/plugins/task/components/TaskFilterViews.tsx`.

## Branch Gate And Closeout

- Poincare the 2nd (`implementer`) completed final production polish in commit `9dbbaeb`.
- Franklin the 2nd (`doc_writer`) completed TASK-038 docs sync in commit `2c33021`.
- Kant the 2nd (`release_checker`) found no P0/P1/P2 release blockers, confirmed no package, lockfile, native, Tauri, Rust, IPC, capability, permission, schema, or release drift, and confirmed `check:full` is not required for TASK-038.
- Parent branch gate:
  - `bun run build` passed with the known Vite chunk-size warning.
  - `bun run check:quick` passed with 42 frontend test files / 672 tests, Rust fmt, Rust clippy, and Rust tests.
- Parent decision:
  - mark TASK-038 `[x]`;
  - merge the branch to `master`;
  - validate the merge result on `master`;
  - continue to TASK-039.

## Final Production Polish Outcome

- Poincare the 2nd (`implementer`) completed final TASK-038 production polish in commit `9dbbaeb`.
- Changed production files:
  - `src/App.tsx`;
  - `src/plugins/task/components/TaskFilterViews.tsx`.
- Delivered final polish:
  - saved-filter rows whose visible labels contain primary route names, such as `Today Review`, remain visible and keep their visible labels as accessible names;
  - active saved-filter rows continue to expose `aria-current="page"`;
  - the built-in `task.page-list` view contract requires exact `{ routeToken, title }` page DTOs;
  - filter result rendering does not use raw page IDs, page bodies, metadata, runtime handles, or native handles.
- Parent handoff for this docs sync says TASK-038 code and tests are complete and identifies `9dbbaeb` as the last production commit.

## Docs Sync Outcome

- Current docs sync agent updated documentation only, with no production code, tests, package, native, Tauri, Rust, IPC, capability, permission, schema, or release changes.
- Updated documentation scope:
  - `docs/product/07-user-interface-design.md`;
  - `docs/architecture/07-runtime-flows.md`;
  - `docs/testing/strategy.md`;
  - `docs/implementation/task-index.md`;
  - `docs/architecture/04-slots-editor-task.md`;
  - `docs/development/02-implementation-roadmap-and-constraints.md`;
  - `docs/implementation/progress.md`;
  - `docs/implementation/agent-communication/status.md`;
  - `docs/implementation/agent-communication/TASK-038-sidebar-page-saved-filter-navigation.md`.
- Docs now record TASK-038 as delivered for MUI Drawer page/saved-filter navigation, public filter execution, route-token DTOs, label-in-name saved filters, active `aria-current`, and fail-closed ownership/view boundaries.
- Docs keep TASK-039+ deferred for Reports/top-bar dialogs, metadata/timer/timeline/global slots, Calendar/Reports projections, search overlay/result route, ML/AI panels, Settings/Sync placeholders, responsive/persistent navigation polish, save-time indexing, Event/plugin-index `within`, arbitrary plugin view routes without DTO designs, native/package/Tauri/Rust/security surface changes, and branch closeout/merge.
- Validation: docs-only `git diff --check` passed.
- Current next action: parent runs release readiness and branch gate, then marks TASK-038 `[x]` only after the gate/merge criteria are satisfied and merges to `master`.
