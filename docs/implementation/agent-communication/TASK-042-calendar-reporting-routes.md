# TASK-042 - Add Calendar And Reporting Routes With Explicit Data Projections

## Orchestration State

- Started: 2026-05-31 21:21 CST.
- Branch: `feat/task-042-calendar-reporting-routes`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Status: review-fix code and docs sync committed; five post-doc review agents are running and parent is waiting for final statuses.

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
- Franklin (`test_writer`) added failing TASK-042 projection and route tests in commit `2491bad`. Files changed: `src/test/calendar-reporting-projections.test.ts` and `src/test/calendar-reporting-routes.test.tsx`.
- Popper (`implementer`) implemented Calendar/Reports routes, projection builders, and a narrow ViewHost command bridge in commit `6eb7365`; Popper fixed test compatibility without weakening assertions in commit `937af88`.
- Harvey (`pr_explorer`) mapped changed paths and found a Reports partial-state bug for omitted habit events and timer notes.
- Maxwell (`reviewer`) found merge-blocking correctness issues: Reports can generate Chart-incompatible 200+ category DTOs, habit/note overflow can be silently marked complete, and mounted Calendar/Reports snapshots can become stale after runtime store mutation.
- James (`security_reviewer`) found no security-blocking issue and no native/Tauri/Rust/SQLite/package/schema/IPC drift; it noted the same habit/note overflow partial-state issue as non-security and a local availability/performance risk for very large source arrays before caps apply.
- Zeno (`deprecation_auditor`) found no P0/P1/P2 API issue; it noted a P3 fake-timer cleanup hygiene gap in the TASK-042 route test.
- Aquinas (`docs_researcher`) found merge-blocking docs drift in product and architecture docs that still describe TASK-042 Calendar/Reports routes as deferred, plus missing documentation for the new narrow `ViewHost` `commandBridge`.
- McClintock (`test_quality_reviewer`) found merge-blocking test coverage gaps for Reports overflow bounds, plus P2 gaps for wrong-owner route coverage and stale async reject coverage.
- Carver (`test_writer`) added review regression coverage in commit `e0eee79` for Reports Chart compatibility, habit/note overflow partial status, mounted route snapshot refresh, wrong-owner route guards, stale rejected Reports results, and fake-timer cleanup.
- Bacon (`implementer`) fixed review regressions in commit `aa2413e`, bounding Reports projections for Chart compatibility and refreshing Calendar/Reports snapshots on user-triggered route changes.
- Bohr (`doc_writer`) was delegated TASK-042 docs sync but failed with `stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)`. It left a partial edit in `docs/product/07-user-interface-design.md`; parent will replace Bohr with a fresh `doc_writer` and require it to inspect, complete, or correct the partial edit before docs commit.
- McClintock (`doc_writer`) was spawned as the replacement docs sync agent at 2026-06-01 21:02 CST. It owns docs-writing for TASK-042 and is expected to inspect Bohr's partial `docs/product/07-user-interface-design.md` edit, update formal product/architecture/testing/task-index docs, and return final status before parent integrates.
- McClintock returned final status and completed docs sync in commit `9bfd714`. Changed docs: `docs/product/03-plugin-platform.md`, `docs/product/04-editor-and-workflows.md`, `docs/product/05-built-in-plugins.md`, `docs/product/06-view-slots.md`, `docs/product/07-user-interface-design.md`, `docs/architecture/04-slots-editor-task.md`, `docs/architecture/05-plugin-implementations.md`, `docs/architecture/07-runtime-flows.md`, `docs/development/01-data-roadmap-and-mvp.md`, `docs/development/02-implementation-roadmap-and-constraints.md`, `docs/testing/strategy.md`, and `docs/implementation/task-index.md`.
- Post-doc review running as of 2026-06-01 21:15 CST: Copernicus (`pr_explorer`, `019e8353-55ac-7ce1-8366-eaa2cb1ce0ed`), Chandrasekhar (`reviewer`, `019e8353-5995-7953-8923-b3d044ad7f01`), Laplace (`security_reviewer`, `019e8353-5ceb-7680-9580-77f7d0caa32a`), Godel (`deprecation_auditor`, `019e8353-6056-7533-a625-124422024c5e`), and Turing (`docs_researcher`, `019e8353-6420-7c90-8700-5ab9ec0a949e`). A `test_quality_reviewer` spawn hit the current agent thread limit and will be retried after capacity frees.

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
- 2026-05-31 21:40 CST: parent red validation ran `bun run test:frontend -- src/test/calendar-reporting-projections.test.ts src/test/calendar-reporting-routes.test.tsx src/test/app-shell-boundary.test.ts src/test/view-slot-hosts.test.tsx src/test/calendar-plugin-baseline.test.tsx src/test/stats-chart-plugins.test.tsx`. Expected red result: 2 failed files / 4 passed files, 10 failed / 84 passed tests. `calendar-reporting-projections.test.ts` fails because `../shell/projections/calendar-reporting` does not exist yet; route tests fail because Calendar route is absent and Reports still renders placeholder behavior. Adjacent suites passed. `git diff --check` passed.
- 2026-05-31 22:00 CST: parent implementation validation passed after `6eb7365` and `937af88`: `bun run test:frontend -- src/test/calendar-reporting-projections.test.ts src/test/calendar-reporting-routes.test.tsx src/test/app-shell-boundary.test.ts src/test/view-slot-hosts.test.tsx src/test/calendar-plugin-baseline.test.tsx src/test/stats-chart-plugins.test.tsx` passed with 6 files / 102 tests; `bun run typecheck`, `bun run lint`, and `git diff --check` passed.
- 2026-05-31 22:07 CST: post-implementation review completed. Merge is blocked by Reports Chart compatibility, habit/note overflow partial status, missing review regression coverage, and formal product/architecture/testing docs drift.
- 2026-05-31 22:22 CST: parent validation after `e0eee79` and `aa2413e` passed: `bun run test:frontend -- src/test/calendar-reporting-projections.test.ts src/test/calendar-reporting-routes.test.tsx src/test/app-shell-boundary.test.ts src/test/view-slot-hosts.test.tsx src/test/calendar-plugin-baseline.test.tsx src/test/stats-chart-plugins.test.tsx` passed with 6 files / 112 tests; `bun run typecheck`, `bun run lint`, and `git diff --check` passed.
- 2026-06-01 20:56 CST: Bohr (`doc_writer`) failed before final status due stream disconnect while syncing docs; partial product UI doc edits remain in the worktree for replacement doc writer review.
- 2026-06-01 21:02 CST: McClintock (`doc_writer`, agent `019e8347-33ae-7173-bed4-61344590f23a`) spawned for replacement docs sync. Parent state is waiting for completion/final status; no docs integration or commit until final status returns.
- 2026-06-01 21:14 CST: McClintock (`doc_writer`) returned final status. Parent verified docs-only paths, `git diff --check`, and targeted stale-route `rg` checks, then committed docs sync as `9bfd714`.
- 2026-06-01 21:15 CST: parent spawned five read-only post-doc review agents and is waiting for their final statuses. `test_quality_reviewer` spawn hit current agent thread limit and will be retried after capacity frees.

## Next Action

- Wait for the five running post-doc review agents' final statuses, then retry `test_quality_reviewer`, run focused validation/release gate, and merge when clear.
