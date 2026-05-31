# TASK-042 - Add Calendar And Reporting Routes With Explicit Data Projections

## Orchestration State

- Started: 2026-05-31 21:21 CST.
- Branch: `feat/task-042-calendar-reporting-routes`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Status: pre-test guidance complete; red-test delegation pending.

## Scope

- Add MUI Calendar and Reports routes reachable from the app shell/sidebar.
- Calendar routes must build explicit bounded app-shell-owned `calendar.time-segments` projections from public current-runtime data and mount `calendar.day` / `calendar.week` through `ViewHost`.
- Reports routes must build explicit bounded Stats input projections, execute `stats.run-aggregation` through Command Registry, and render Chart views through `ViewHost` when chart DTOs are available.
- Empty, partial-data, loading, and unavailable states must be visible and non-leaky.

## Constraints

- Parent remains orchestration-only and must wait for child-agent completion/final status before dependent steps.
- Tests must be written before production implementation.
- Projection builders are app-shell owned integration code; they must not import plugin private stores, sibling plugin internals, raw Core stores from plugin-rendered UI, NativeBridge/Tauri APIs, SQLite APIs, package, lockfile, Rust, IPC, capability, permission, schema, native, or release surfaces.
- Broad cross-plugin query/feed facade, persistent indexes, Calendar drag/drop/manual segment editing, Stats dashboards beyond registered DTO views, charting dependency expansion, and native/schema changes remain deferred.

## Agent Notes

- Lovelace (`planner`) completed read-only guidance with no hard blocker. Recommendation: keep TASK-042 as a narrow app-shell route integration slice; add `src/shell/projections/calendar-reporting.ts`, `src/test/calendar-reporting-projections.test.ts`, and `src/test/calendar-reporting-routes.test.tsx`; expose Calendar/Reports through registered views/commands only; add red coverage for Calendar segment click because current `ViewHost` does not pass Calendar's expected `commands.execute`.
- Locke (`docs_researcher`) completed read-only current-doc guidance with no hard blocker. Official docs verified: React 19 upgrade/`act`, Vite 7 Node support, Vitest timers, Testing Library queries/async/user-event/setup, and MUI v9 Tabs/ToggleButton/Dialog/Paper/Stack/migration. Recommendation: use role/name queries, awaited `userEvent.setup()` actions, `findBy*` for route/aggregation transitions, and MUI v9 patterns.
- Plato (`security_reviewer`) completed read-only boundary guidance with no hard blocker. Recommendation: add static guards for no native/package/Tauri/Rust/IPC/capability/schema/release drift, no private plugin imports, no raw Core store/registry/plugin-host/native handles in plugin-rendered UI, no HTML/Markdown/code sinks, and no broad cross-plugin feed/query facade.
- Fermat (`deprecation_auditor`) completed read-only API guidance with no hard blocker. Official docs verified: MUI v9 install/path imports/migration, React 19 upgrade and test-utils warnings, Testing Library user-event/queries, Vite 7 migration, and Vitest 4 migration. Recommendation: keep MUI path imports, avoid stale MUI/React/testing APIs, and test the Calendar command bridge explicitly.

## Parent Decisions

- Archived and missing pages are excluded from Calendar and Reports projections for TASK-042. This keeps route data inert and avoids exposing stale private page bodies or orphan facts; historical archived summaries can be designed later.
- Calendar route segment cap is `1000` projected rows, matching the recommended upper bound and staying no higher than the Stats input cap. Overflow must be deterministic and surface a visible partial-data state rather than leaking raw data.
- Reports default aggregation is `stats.sum-time-by-page`; users can switch to other registered Stats aggregations covered by existing plugin descriptors.
- Task estimate projections are optional. If no public task-owned estimate metadata exists, the Reports route should provide empty/partial estimate input and visible partial/unavailable state rather than inferring from Task internals.
- The Calendar view command bridge must be narrow and controlled. The implementer may adapt `ViewHost` or the route integration so `calendar.open-time-segment` can execute exact `{ segmentId, pageId }`, but must not expose a raw command registry or generic `commands.execute` facade to arbitrary plugin views.

## Red-Test Guidance

- Add projection-builder unit tests for valid Timer events to `calendar.time-segments`, overlap/carryover, wrong owner/provenance, missing/archived pages, malformed/accessor/symbol/prototype/non-enumerable/custom-array data, bounds/caps, tag metadata, Timer note events, Habit events/summaries, optional task estimate data, and finite numeric caps.
- Add RTL route tests with `userEvent.setup()` for Calendar sidebar activation, `aria-current`, day/week switching, hosted Calendar regions, segment detail click through Command Registry, empty/partial/unavailable states, Reports route activation, default `stats.sum-time-by-page` execution, aggregation switching, Chart rendering through `ViewHost`, loading/error redaction, stale async aggregation results, and keyboard navigation.
- Add static boundary tests for no private plugin component/store imports, no native/Tauri/SQLite/filesystem/package/Rust/IPC/capability/schema/release drift, no charting dependency expansion, no stale MUI/React/testing APIs, no HTML/Markdown execution sinks, and no broad query/feed/index/dashboard facades.
- Focused expected red command should include the new TASK-042 tests plus adjacent app-shell/ViewHost/plugin tests.

## Validation

- 2026-05-31 21:21 CST: 11 project agent TOML files parsed successfully.
- 2026-05-31 21:21 CST: `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/network/websocket OK, with known unrestricted-sandbox notes and known `TERM=dumb` terminal failure.
- 2026-05-31 21:28 CST: pre-test planner, docs, security, and deprecation agents completed with no hard blockers.
