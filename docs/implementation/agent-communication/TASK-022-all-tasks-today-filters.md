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

## Initial Implementation Handoff

- Status: completed by Ramanujan (`implementer`) on 2026-05-21 19:03 CST.
- Commit: `a9a07e9`.
- Files changed:
  - `src/core/filter-engine.ts`.
  - `src/core/index.ts`.
  - `src/core/stores/filter-store.ts`.
  - `src/plugins/task/plugin.ts`.
  - `src/plugins/task/components/TaskFilterViews.tsx`.
- Behavior implemented:
  - Public Core `executeFilterQuery`.
  - Data-only metadata query execution for `eq`, `neq`, `includes`, `exists`, `and`, and `or`.
  - Archived-page exclusion, stable input page order, no mutation, and fail-closed unknown/unsafe fields.
  - Metadata owner consistency for `metadata.task.*` and `metadata.tag.*`.
  - Relative today query value resolved against `currentDate` for date metadata.
  - Task Plugin default `All Tasks` and `Today` filters with `viewType: "page.list"`.
  - Registered `task.page-list` view and `task.filter-empty-state` slot.
  - Inert page-title rendering and accessible empty-state status text.
- Validation:

```bash
bun run test:frontend -- src/test/core-filter-engine.test.ts src/test/task-filters-view-rendering.test.tsx
bun run test:frontend -- src/test/core-view-slot-registry.test.ts src/test/task-plugin-syntax-page-creation.test.ts src/test/task-checkbox-toggle-events.test.tsx src/test/tag-plugin-baseline.test.tsx
bun run typecheck
bun run lint
git diff --check
git diff --name-only master -- package.json bun.lock src-tauri/Cargo.lock src-tauri/Cargo.toml src-tauri/build.rs src-tauri/capabilities src-tauri/permissions src-tauri/src/commands src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tauri.conf.json
```

- Result: all passed or clean. TASK-022 focused tests passed with 2 files / 22 tests. Adjacent view/task/tag coverage passed with 4 files / 69 tests. `bun run typecheck`, `bun run lint`, and `git diff --check` passed. Native/package/Tauri surface diff was empty.

## Focused Review Handoff

- Status: completed on 2026-05-21 19:12 CST by Maxwell (`pr_explorer`), Hubble (`reviewer`), Gibbs (`security_reviewer`), Schrodinger (`deprecation_auditor`), Planck (`test_quality_reviewer`), and Epicurus (`docs_researcher`).
- P0 findings: none.
- P1 findings:
  - Maxwell and Hubble found that Task Plugin default filter registration is not idempotent. `registerTaskFilters()` saves fixed IDs on every register while plugin deactivation leaves saved filters in the Filter Store, so deactivation followed by re-registration fails with `FILTER_ID_COLLISION: task.filter.all-tasks`.
  - Epicurus found docs drift where formal Filter and Task Plugin docs still conflict with the implemented `page.list`, `metadata.task.enabled eq true`, seeded `task.due` / `task.scheduled`, and default filter/view/slot behavior.
- P2 findings:
  - Maxwell and Schrodinger found hidden runtime support for `id` in filter save inputs while `SaveFilterInput` and `PluginSaveFilterInput` omit the public type contract.
  - Maxwell found the exported `executeFilterQuery` returns empty results for legal `gt`, `lt`, and `within` operators. Parent decision: cover and implement `gt`/`lt` for current page/metadata execution now; keep `within` deferred until Event/plugin-index semantics are documented by the docs sync agent because current local docs only use it for event history such as `events.timer.time_segment_created within 7 days`.
  - Planck found generic executor coverage is still too task/tag-specific and should include an arbitrary plugin namespace/key plus forged-owner exclusion.
  - Epicurus found TASK-021/Tag docs, relative Today/date semantics, slot docs, development docs, testing docs, and the TASK-022 task-index entry need synchronization.
- P3 findings accepted for opportunistic hardening:
  - Gibbs found `metadata.* neq relative-date(today)` can match wrong-typed metadata because `neq` negates a failed date comparison instead of failing closed.
  - Hubble found the empty-state copy is task-specific even though the slot is global. Parent decision: make the copy generic or prop-scoped during the review fix.
  - Planck found rendering tests hard-code `task.page-list` and `task.filter-empty-state`; add a regression proving `filter.viewType` drives view lookup and empty results route through the `filter.empty_state` slot.
- P3 findings deferred:
  - Native/package guard tests shell out to `git diff master`; keep as a temporary task-scope guard and list as residual risk.
  - The `task.set_due` / `task.set-due` absence assertion is scope-coupled; keep unless the review-fix test writer chooses to replace it with a less brittle acceptance assertion.
- Checks reported by review agents:
  - Focused TASK-022 tests passed.
  - Full frontend tests passed in Hubble's review.
  - `bun run typecheck`, `bun run lint`, `git diff --check`, and native/package/Tauri diff guards passed.
  - Gibbs also ran `cargo fmt --manifest-path src-tauri/Cargo.toml --check` successfully.

## Parent Decisions For Review-Fix Cycle

- Delegate review-fix regression tests to a `test_writer` first. Parent thread will not write tests.
- Required test scope:
  - Task Plugin activation, deactivation, and re-activation must not fail or duplicate default filters.
  - Public `SaveFilterInput` and `PluginSaveFilterInput` must permit optional fixed `id` where runtime behavior supports it.
  - `executeFilterQuery` must prove generic metadata execution against a non-task/non-tag namespace and reject forged owner metadata.
  - `executeFilterQuery` must cover `gt` and `lt` for comparable page/metadata values and fail closed for wrong value types.
  - Relative-date `neq` must fail closed for wrong-typed date metadata.
  - Registered filter rendering should use a saved filter's `viewType` to resolve a view, and empty results should route through `filter.empty_state`.
- Required implementation scope after red tests:
  - Make Task Plugin default filter registration idempotent without deleting user-created filters.
  - Make optional fixed filter IDs a typed public contract for Core and plugin filter saves, or have the implementer justify a smaller replacement in the task communication file before coding.
  - Implement only the current page/metadata subset of comparison operators needed by the new tests.
  - Keep JS filters, native/Tauri/package/Rust changes, global saved-filter navigation, automatic scanning, persistence rewiring, and Event/plugin-index `within` execution out of scope.

## Review-Fix Regression Tests

- Status: completed by Hooke (`test_writer`) on 2026-05-21 19:23 CST.
- Commit: `c765349`.
- Files changed:
  - `src/test/core-filter-engine.test.ts`.
  - `src/test/task-filters-view-rendering.test.tsx`.
  - `src/test/core-filter-store.test.ts`.
  - `src/test/plugin-api-contracts.test.ts`.
- Coverage added:
  - Task Plugin deactivate, re-register, and reactivate regression for fixed default filters.
  - Runtime and typed public fixed filter `id` coverage for Core and plugin filter saves.
  - Generic non-task/non-tag metadata namespace execution plus forged-owner exclusion.
  - `gt`/`lt` numeric and date metadata comparisons plus wrong-value-type fail-closed behavior.
  - Relative-date `neq` fail-closed behavior for wrong-typed date metadata.
  - View lookup through a saved filter's `viewType`.
  - Empty results routed through `filter.empty_state`.
  - Generic empty-state copy that does not force task wording for all `page.list` filters.
- Parent validation:

```bash
bun run test:frontend -- src/test/core-filter-engine.test.ts src/test/task-filters-view-rendering.test.tsx src/test/core-filter-store.test.ts src/test/plugin-api-contracts.test.ts
bun run typecheck
bunx eslint src/test/core-filter-engine.test.ts src/test/task-filters-view-rendering.test.tsx src/test/core-filter-store.test.ts src/test/plugin-api-contracts.test.ts --max-warnings=0
git diff --check
```

- Result: expected red signal. Focused tests ran 4 files / 94 tests with 4 failed / 90 passed. Failures were missing `gt`/`lt` support, wrong-typed relative-date `neq` matching, Task Plugin re-register `FILTER_ID_COLLISION`, and task-specific empty-state copy. `bun run typecheck` failed because `SaveFilterInput` and `PluginSaveFilterInput` do not expose optional `id`. Focused eslint and `git diff --check` passed.

## Review-Fix Implementation

- Status: completed by Ampere (`implementer`) on 2026-05-21 19:28 CST.
- Commit: `a9b0579`.
- Files changed:
  - `src/core/filter-engine.ts`.
  - `src/core/stores/filter-store.ts`.
  - `src/core/plugin-api/context.ts`.
  - `src/plugins/task/plugin.ts`.
  - `src/plugins/task/components/TaskFilterViews.tsx`.
- Behavior implemented:
  - Task default filters now upsert owned fixed IDs on re-register without deleting user filters.
  - `SaveFilterInput` and `PluginSaveFilterInput` now expose optional `id?: string`.
  - `executeFilterQuery` supports the current page/metadata subset of `gt` and `lt` for numeric and date metadata.
  - Wrong `valueType` or incompatible comparison value shapes fail closed.
  - Relative-date `neq` fails closed for wrong-typed date metadata.
  - `filter.empty_state` copy is generic rather than task-specific.
- Parent validation:

```bash
bun run test:frontend -- src/test/core-filter-engine.test.ts src/test/task-filters-view-rendering.test.tsx src/test/core-filter-store.test.ts src/test/plugin-api-contracts.test.ts
bun run test:frontend -- src/test/core-view-slot-registry.test.ts src/test/task-plugin-syntax-page-creation.test.ts src/test/task-checkbox-toggle-events.test.tsx src/test/tag-plugin-baseline.test.tsx
bun run typecheck
bun run lint
git diff --check
git diff --name-only master -- package.json bun.lock src-tauri/Cargo.lock src-tauri/Cargo.toml src-tauri/build.rs src-tauri/capabilities src-tauri/permissions src-tauri/src/commands src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tauri.conf.json
```

- Result: all passed or clean. Review-fix focused tests passed with 4 files / 94 tests. Adjacent view/task/tag coverage passed with 4 files / 69 tests. `bun run typecheck`, `bun run lint`, and `git diff --check` passed. Native/package/Tauri surface diff was empty.

## Post-Fix Focused Review

- Status: completed on 2026-05-21 19:36 CST by Hume (`pr_explorer`), Dewey (`reviewer`), Avicenna (`security_reviewer`), Beauvoir (`deprecation_auditor`), and Archimedes (`test_quality_reviewer`).
- P0 findings: none.
- P1 findings: none.
- Cleared findings:
  - Hume found the accepted Hooke/Ampere review-fix items addressed and the changed surface limited to expected TypeScript/docs/test files with no native/package/Tauri surface changes.
  - Archimedes found no `.only` / `.skip`, no weakened original TASK-022 assertions, and meaningful coverage for the first review-fix set.
- Accepted P2 findings for a second review-fix cycle:
  - Archimedes found the Task Plugin re-register regression does not prove user-created task-owned filters survive default filter upsert.
  - Avicenna found public `executeFilterQuery` can recurse without bound on cyclic unsaved query objects.
  - Avicenna found fixed task filter IDs can still be persistently blocked if another plugin creates a foreign-owned filter with a `task.*` fixed id.
  - Beauvoir found the current executor hard-binds `metadata.<namespace>.<key>` to `sourcePluginId === namespace`, which is stricter than the existing metadata contract where namespace and source owner are separate.
  - Dewey found `eq`, `neq`, and `includes` can match malformed metadata records whose `valueType` does not match the stored value shape.
- Accepted P3 findings for opportunistic coverage or docs:
  - Beauvoir found direct executor inputs do not enforce the same operator/value shape as `FilterStore`, for example `exists` with a value.
  - Archimedes found `gt`/`lt` coverage could cover the full number/date operator cross-product and wrong query operand types more tightly.
- Deferred to formal docs sync:
  - `within` remains a legal AST operator for future Event/plugin-index execution, but TASK-022's public `executeFilterQuery` only implements the current page/metadata subset. Formal docs must explicitly call out this current-executor subset before merge.
- Checks reported by post-fix reviewers:
  - Review-fix focused tests passed with 4 files / 94 tests.
  - Adjacent view/task/tag tests passed with 4 files / 69 tests.
  - `bun run typecheck`, `bun run lint`, focused eslint, `git diff --check`, Rust fmt, and native/package/Tauri diff guards were reported clean across the agents.
  - Beauvoir checked current official React, Testing Library, Vitest, and Tauri docs and found no deprecated touched API patterns.

## Parent Decisions For Second Review-Fix Cycle

- Delegate second review-fix regression tests to a `test_writer` first. Parent thread will not write tests.
- Required test scope:
  - Task Plugin default filter upsert must preserve an existing user-created task-owned filter.
  - A plugin must not be able to save a caller-provided fixed filter id in another plugin's id namespace, especially `task.filter.*` from a non-task plugin. A same-plugin fixed id should remain allowed.
  - `executeFilterQuery` must fail closed without throwing for cyclic or over-deep direct query objects.
  - Direct `executeFilterQuery` must enforce the same basic operator/value shape as saved filters for the covered subset, including `exists` with no value and non-`exists` operators requiring a value.
  - `eq`, `neq`, and `includes` must fail closed when the metadata record's `valueType` does not match the stored value shape.
  - Generic metadata execution should allow a namespace/source owner pair that is valid in the Metadata Store even when `sourcePluginId` is not exactly the namespace. Preserve the built-in Task/Tag trust boundary either through narrower tests for built-in namespaces or an explicit owner rule documented in the test.
  - If convenient, broaden `gt`/`lt` coverage for number/date operator cross-product and wrong query operand types.
- Required implementation scope after red tests:
  - Add validation or traversal guards to `executeFilterQuery` without changing saved filter store validation semantics.
  - Preserve Task/Tag built-in metadata trust boundaries while avoiding a hidden global assumption that all metadata source plugin IDs equal namespace.
  - Restrict plugin-provided fixed filter IDs enough to prevent cross-plugin fixed-id collisions.
  - Keep `within`, JS filters, native/Tauri/package/Rust changes, global saved-filter navigation, automatic scanning, persistence rewiring, and Event/plugin-index execution out of scope.

## Second Review-Fix Regression Tests

- Status: completed by Ptolemy (`test_writer`) on 2026-05-21 19:43 CST.
- Commit: `abbd9ff`.
- Push note: the post-commit auto-push initially failed with an SSH timeout, then parent retried `git push origin feat/task-022-all-tasks-today-filters` successfully.
- Files changed:
  - `src/test/core-filter-engine.test.ts`.
  - `src/test/plugin-api-contracts.test.ts`.
  - `src/test/task-filters-view-rendering.test.tsx`.
- Coverage added:
  - User-created task-owned filters survive Task Plugin default filter re-register/upsert.
  - Plugin-facing fixed filter IDs cannot claim another plugin namespace such as `task.filter.today` from a non-task plugin, while same-plugin fixed IDs remain allowed.
  - Direct cyclic or over-deep query objects fail closed without throwing.
  - Direct executor operator/value shapes align with saved filter expectations for the covered subset.
  - `eq`, `neq`, and `includes` fail closed for metadata `valueType` / stored value shape mismatches.
  - Generic metadata execution allows valid namespace/source owner pairs where `sourcePluginId` differs from namespace while preserving built-in Task/Tag owner boundaries.
  - `gt`/`lt` coverage is broadened for number/date comparisons and wrong query operand types.
- Parent validation:

```bash
bun run test:frontend -- src/test/core-filter-engine.test.ts src/test/task-filters-view-rendering.test.tsx src/test/plugin-api-contracts.test.ts src/test/core-filter-store.test.ts
bun run typecheck
bunx eslint src/test/core-filter-engine.test.ts src/test/task-filters-view-rendering.test.tsx src/test/plugin-api-contracts.test.ts --max-warnings=0
git diff --check
```

- Result: expected red signal. Focused tests ran 4 files / 110 tests with 10 failed / 100 passed. Failures were cross-plugin fixed task filter ids still being accepted, cyclic/deep direct queries not failing closed, malformed direct query/valueType cases matching, and generic metadata owner pairs with non-matching `sourcePluginId` being rejected. `bun run typecheck`, focused eslint, and `git diff --check` passed.

## Second Review-Fix Implementation

- Status: completed by Einstein (`implementer`) on 2026-05-21 19:51 CST.
- Commit: `2b61886`.
- Files changed:
  - `src/core/filter-engine.ts`.
  - `src/core/plugin-host/plugin-host.ts`.
- Behavior implemented:
  - `executeFilterQuery` fails closed for cyclic and over-deep direct query objects.
  - Direct query execution rejects `exists` with a value and non-`exists` operators without a value.
  - Metadata execution validates stored value shape against `valueType` before matching.
  - Generic metadata can match valid namespace/source-owner pairs such as `metadata.profile.visibility` from `profile-plugin`, while `task` and `tag` metadata still require their built-in owners.
  - Plugin-facing fixed filter IDs such as `task.filter.*` are rejected unless saved by the owning plugin namespace.
  - Task default-filter preservation was verified by Ptolemy's regression without requiring a Task Plugin implementation change.
- Parent validation:

```bash
bun run test:frontend -- src/test/core-filter-engine.test.ts src/test/task-filters-view-rendering.test.tsx src/test/plugin-api-contracts.test.ts src/test/core-filter-store.test.ts
bun run test:frontend -- src/test/core-view-slot-registry.test.ts src/test/task-plugin-syntax-page-creation.test.ts src/test/task-checkbox-toggle-events.test.tsx src/test/tag-plugin-baseline.test.tsx
bun run typecheck
bun run lint
git diff --check
git diff --name-only master -- package.json bun.lock src-tauri/Cargo.lock src-tauri/Cargo.toml src-tauri/build.rs src-tauri/capabilities src-tauri/permissions src-tauri/src/commands src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tauri.conf.json
```

- Result: all passed or clean. Second review-fix focused tests passed with 4 files / 110 tests. Adjacent view/task/tag coverage passed with 4 files / 69 tests. `bun run typecheck`, `bun run lint`, and `git diff --check` passed. Native/package/Tauri surface diff was empty.

## Narrow Post-Second-Fix Review

- Status: completed on 2026-05-21 19:58 CST by Pauli (`reviewer`), Halley (`security_reviewer`), Helmholtz (`deprecation_auditor`), and Euclid (`test_quality_reviewer`).
- P0 findings: none.
- P1 findings:
  - Pauli and Helmholtz found plugin-facing fixed filter id namespace enforcement is bypassable with an accessor-backed `id`. The guard inspects the descriptor but later spreads the original input into `filters.save`, evaluating the getter and allowing a non-owner plugin to save `task.filter.today`.
- Accepted P2 findings:
  - Halley found non-owner plugins can squat built-in `task` / `tag` metadata identities before the owning plugin writes them, creating a cross-plugin denial-of-service and contradicting the built-in metadata owner trust boundary used by `executeFilterQuery`.
- Accepted P3 findings for opportunistic coverage:
  - Halley found raw `date` metadata equality accepts malformed date strings such as `not-a-date`.
- Deferred P3 findings:
  - Halley found direct filter execution has depth/cycle guards but no total node, branch, or condition budget for very wide acyclic queries. Parent decision: record this as residual risk for TASK-022 and leave broader execution-budget policy to a later filter hardening task unless subsequent agents find a concrete TASK-022 blocker.
- Cleared findings:
  - Euclid found no P0/P1/P2/P3 test-quality findings and confirmed Ptolemy's tests are meaningful, not brittle implementation overfit, and did not weaken prior tests.
  - Helmholtz found the `within` deferral coherent as long as formal docs call out the current executor subset.
- Checks reported by agents:
  - Second review-fix focused tests passed with 4 files / 110 tests.
  - `bun run typecheck`, focused eslint, `git diff --check`, and native/package/Tauri diff guards were reported clean.
  - Helmholtz checked current Vitest docs and noted TASK-022 changed tests use the current `toExtend` / `toEqualTypeOf` patterns.

## Parent Decisions For Third Review-Fix Cycle

- Delegate third review-fix regression tests to a `test_writer` first. Parent thread will not write tests.
- Required test scope:
  - A non-owner plugin cannot bypass fixed filter id namespace enforcement with accessor-backed or otherwise non-plain `id` inputs. The test should prove a `review` plugin cannot persist `task.filter.today` through a getter-backed `id`.
  - A non-owner plugin cannot create built-in `task` or `tag` metadata identities, including the first write before the owning plugin has created the record. Same-owner writes to `task`/`tag` metadata must remain allowed, and generic non-built-in namespaces must remain allowed.
  - If concise, add a raw date metadata equality fail-closed regression for malformed `valueType: "date"` values.
- Required implementation scope after red tests:
  - Normalize/read plugin-facing fixed filter `id` once before namespace validation and store save, or otherwise close accessor/proxy materialization gaps.
  - Reserve built-in metadata namespaces required by TASK-022's trust boundary.
  - Keep native/Tauri/package/Rust changes, broad plugin namespace policy, `within`, JS filters, and wide-query execution budgets out of scope.

## Current Next Action

- Spawn third review-fix `test_writer` for the remaining P1/P2 plugin-host boundary regressions, then validate the expected red signal before committing the tests.
