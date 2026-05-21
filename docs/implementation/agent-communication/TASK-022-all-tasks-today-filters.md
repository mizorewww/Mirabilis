# TASK-022 Agent Communication - All Tasks And Today Filters

## Task

- Task ID: TASK-022.
- Task name: Implement All Tasks and Today filters.
- Branch: `feat/task-022-all-tasks-today-filters`.
- Parent role: orchestration only.
- Started: 2026-05-21 18:35 CST.

## Source Docs Read By Parent

- `.codex/skills/mirabilis-dev-runner/SKILL.md`.
- `docs/implementation/progress.md`.
- `docs/implementation/task-index.md#task-022-implement-all-tasks-and-today-filters`.
- `docs/development/01-data-roadmap-and-mvp.md#phase-3task-plugin`.
- `docs/product/05-built-in-plugins.md#23-filter-plugin`.
- `docs/architecture/02-core-kernel.md#44-filter-store`.
- `docs/architecture/06-filter-native-database.md#14-filter-engine-设计`.
- Related Task/Tag references in `docs/product/05-built-in-plugins.md`, `docs/architecture/07-runtime-flows.md`, `docs/development/02-implementation-roadmap-and-constraints.md`, and `docs/testing/strategy.md`.

## Initial Scope

- Implement the first Task/Filter/View slice after Task and Tag Plugin foundations.
- Acceptance criteria:
  - All Tasks filter lists task-enabled pages.
  - Today filter uses documented metadata/date semantics.
  - Filters render through the registered view system.
  - Empty states are provided through slots.
- Test plan from task index:
  - Filter engine tests for task queries.
  - UI tests for filter result rendering.

## Initial Out Of Scope

- Automatic save-time scanning/indexing of task blocks.
- New task metadata fields beyond current task metadata unless agents identify a narrow Today dependency.
- Rich editor behavior, global Metadata UI, Tag picker/autocomplete, Timer/Calendar/Stats aggregation, native/Tauri/package changes, broad persistence/schema changes, release packaging, or Core business behavior beyond generic filter/view/slot primitives.

## Known Risks For Agents

- The current Filter Store saves definitions, but TASK-022 may require the first executable filter/query engine surface.
- Product docs mention All Tasks and Today as default Task Plugin filters, but due/scheduled date metadata is still mostly future-facing after TASK-020.
- Filter rendering must go through the registered view system without hardcoding task UI into Core or App Shell.
- Empty states should be plugin/slot-driven rather than a one-off app-level placeholder if current APIs allow that.
- Keep native/Tauri/package/Cargo surfaces unchanged unless a task-critical dependency appears.

## Parent Start Decision

- Select TASK-022 because it is the first unblocked `[ ]` task after TASK-021 completed and merged.
- Start from `master` at merge commit `b5389cd`.
- Use branch `feat/task-022-all-tasks-today-filters`.
- Delegate planning, current-doc guidance, deprecation/API review, security review, tests, implementation, review, and docs sync to agents.

## Agent/Config Validation

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK.
- Non-blocking notes: unrestricted sandbox/network, known `TERM=dumb` terminal failure, and available Codex update.

## Pre-test Guidance

### Volta - Planner

- Status: completed read-only planning; no files edited, staged, committed, or pushed.
- Recommended scope:
  - Add a business-agnostic filter query executor for Core-owned filter primitives over pages and metadata.
  - Extend Task Plugin with two task-owned default filters: `All Tasks` and `Today`.
  - Register a task/page list view through View Registry and render filter results by resolving `filter.viewType` through registered views.
  - Register an empty-state contribution through Slot Registry using `filter.empty_state`.
  - Keep global saved-filter navigation, app shell runtime exposure, persistence rewiring, native/Tauri changes, automatic save-time scanning, metadata editors, date picker UI, and tag-filter UI out of scope.
- Recommended Today semantics:
  - `task.due` and `task.scheduled` are optional Task Plugin metadata keys.
  - Date metadata uses `valueType: "date"` and date-only ISO strings `YYYY-MM-DD`.
  - Today includes task-enabled, non-done pages where `task.scheduled` or `task.due` equals today's local date.
  - Overdue is separate and out of scope.
- Risk: local docs are ambiguous around dynamic Today values and `task.list` versus `page.list`; tests should codify the selected contract first.

### Meitner - Docs Researcher

- Status: completed read-only current-doc/test guidance; no files edited, staged, committed, pushed, or tests run.
- Local constraints:
  - TASK-022 must satisfy All Tasks, Today, registered view rendering, and slot-provided empty states.
  - Core owns generic Filter, View Registry, and Slot Registry; task behavior stays in Task Plugin.
  - Filter Engine is documented as AST-based query execution over Core Store plus plugin indexes, not as `FilterStore.list()`.
  - Current runtime remains in-memory and should avoid NativeBridge/Tauri/package/Rust surface changes.
- Today warning:
  - Product docs mention `task.due`, `task.scheduled`, `task.set_due`, date picker, and task views, but also mark those broader features as future after TASK-020.
  - Recommended bounded TASK-022 scope: execute Today against already-present seeded date metadata with deterministic tests.
- External docs verified:
  - React 19.2 `act`, Testing Library query priority and async methods, user-event v14 setup, Vitest v4 CLI/jsdom, and Vite 7 CLI/config docs.

### Mill - API/Deprecation Auditor

- Status: completed read-only API/deprecation guidance; no files edited, staged, committed, pushed, or tests run.
- P0 guidance:
  - Do not treat `FilterStore.list()` as query execution; it only lists saved definitions.
  - Preserve the Tag Plugin filter contract from TASK-021: `tag.create-filter` stores filters with `viewType: "page.list"`, so TASK-022 should register/render `page.list`.
  - Keep task semantics out of Core; a Core filter engine may understand generic field paths like `metadata.<namespace>.<key>`.
  - Do not add Tauri/native/package/Cargo surface.
- P1 guidance:
  - Preserve strict Query AST operator semantics: `eq`, `neq`, `gt`, `lt`, `includes`, `exists`, `within`; `exists` has no value and other operators require one.
  - Date metadata stores JSON strings, not `Date` objects.
  - Plugin facades inject ownership; do not accept caller-supplied `pluginId` or `sourcePluginId`.
  - Register views/slots during plugin `register()`, not command time.
- Recommended IDs:
  - Default filters: `All Tasks`, `Today`.
  - View type: `page.list`.
  - View id/type recommendation: `task.page-list` with `type: "page.list"`.
  - Empty-state slot: `filter.empty_state`.
- External docs verified:
  - React 19 upgrade/test-utils deprecations, Testing Library/user-event v14 role queries, Vitest v4 `vi`, Vite 7 migration, and Tauri v2 capabilities/calling Rust.

### Darwin - Security Reviewer

- Status: completed read-only security guidance; no files edited, staged, committed, pushed, or tests run.
- P0/P1 boundaries:
  - No executable/JS filters: no `eval`, `new Function`, dynamic imports, regex-as-query execution, raw SQL, raw Tauri `invoke`, filesystem/path DTOs, new Tauri commands, new capabilities, new package/Cargo dependencies, or network exposure.
  - Plugin-rendered views/slots must not receive full runtime, Core stores/registries/services, NativeBridge, Tauri APIs, SQLite handles, or filesystem handles.
  - Filter execution must be a data-only AST interpreter with allowlisted field resolvers. Reject or fail closed for unknown fields and path-injection names such as `__proto__`, `constructor`, or `prototype`.
  - All Tasks must trust Task Plugin metadata, not page attrs, titles, source block text, or metadata from other plugin owners.
  - Today date semantics must be deterministic with fixed/injected current date in tests and canonical date strings only.
  - Task-specific UI belongs in Task Plugin registered views/slots, not Core.
  - Render untrusted titles/metadata as inert React text only.

## Parent Decisions After Pre-test Guidance

- Implement TASK-022 as:
  - a generic, data-only filter query executor over current Core pages and metadata;
  - Task Plugin-owned default filters for `All Tasks` and `Today`;
  - registered view rendering through a `page.list` view;
  - empty states through the `filter.empty_state` slot.
- Canonical filter view contract:
  - `viewType: "page.list"` for TASK-022 task filters. This preserves TASK-021 Tag Plugin filter compatibility.
  - Recommended registered view id: `task.page-list`; view `type: "page.list"`; `accepts` should describe filter results over Markdown pages.
- All Tasks contract:
  - Task-owned default filter named `All Tasks`.
  - Query: `{ where: [{ field: "metadata.task.enabled", op: "eq", value: true }] }`.
  - Includes done tasks; excludes archived pages through the page listing/query execution surface.
- Today contract:
  - Task-owned default filter named `Today`.
  - Query requires `metadata.task.enabled eq true`, `metadata.task.status neq "done"`, and either `metadata.task.scheduled` or `metadata.task.due` equals the current local date.
  - Current local date must be deterministic/injectable in filter execution tests.
  - `task.scheduled` and `task.due` use `valueType: "date"` and `YYYY-MM-DD` strings.
  - No date picker, `@date` parser, `task.set_due`, automatic metadata extraction, `Overdue`, or `Done` filter in TASK-022.
- Generic filter engine boundaries:
  - Do not use arbitrary object-path traversal.
  - Allowlist fields needed for TASK-022 and generic compatibility, especially `metadata.<namespace>.<key>` and basic page fields if needed.
  - Metadata field resolution must fail closed for unknown fields and should prefer owner-consistent records, e.g. `metadata.task.enabled` resolves Task Plugin-owned metadata.
  - Query execution must not mutate stores.
- Rendering boundaries:
  - Tests should fetch view and slot components from registries to prove registration path.
  - View/slot props should be minimal data props, not full runtime/store/NativeBridge handles.
- Defer:
  - JS filters, cross-plugin Filter Plugin ownership changes, global saved-filter navigation, app-shell route integration, Tag filter UI beyond compatibility, native/Tauri/package/Rust changes, persistence rewiring, broad docs sync, and release packaging.

## Acceptance Test Handoff

- Status: completed by Wegener (`test_writer`) on 2026-05-21 18:54 CST.
- Commit: `b454680`.
- Files changed:
  - `src/test/core-filter-engine.test.ts`.
  - `src/test/task-filters-view-rendering.test.tsx`.
- Coverage added:
  - Public `executeFilterQuery` Core API over pages and metadata, not saved filter definitions.
  - Generic data-only execution for `eq`, `neq`, `includes`, `exists`, `or`, archived exclusion, stable ordering, no input mutation, owner-consistent metadata, and fail-closed path-injection fields.
  - TASK-021 tag filter compatibility for `metadata.tag.tags includes "product"`.
  - Relative today value `{ kind: "relative-date", value: "today" }` resolved with a fixed `currentDate`.
  - Task-owned `All Tasks` and `Today` filters with `viewType: "page.list"` and canonical query shapes.
  - Registered `task.page-list` view and `task.filter-empty-state` slot, minimal data props, inert unsafe titles, and native/package/Tauri/Cargo surface guard.
- Validation:

```bash
bun run test:frontend -- src/test/core-filter-engine.test.ts src/test/task-filters-view-rendering.test.tsx
bun run typecheck
bunx eslint src/test/core-filter-engine.test.ts src/test/task-filters-view-rendering.test.tsx --max-warnings=0
git diff --check
git diff --name-only master -- package.json bun.lock src-tauri/Cargo.lock src-tauri/Cargo.toml src-tauri/build.rs src-tauri/capabilities src-tauri/permissions src-tauri/src/commands src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tauri.conf.json
```

- Result: expected red signal. Focused tests ran 2 files / 22 tests with 21 failures and 1 pass. Failures were missing `executeFilterQuery` export and missing Task Plugin `All Tasks` / `Today` filters, `page.list` view, and `filter.empty_state` slot. `bun run typecheck`, focused eslint, `git diff --check`, and native/package/Tauri guard passed.

## Current Next Action

- Delegate implementation to `implementer`.
