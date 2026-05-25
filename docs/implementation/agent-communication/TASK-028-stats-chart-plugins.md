# TASK-028 Agent Communication - Stats and Chart Plugins

## Task

- ID: TASK-028.
- Name: Implement Stats and Chart plugins.
- Branch: `feat/task-028-stats-chart-plugins`.
- Started: 2026-05-25 10:36 CST.
- Parent role: orchestration only. Parent delegates planning, docs research, test writing, implementation, review, and docs sync to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-028-implement-stats-and-chart-plugins`.
- `docs/product/05-built-in-plugins.md#20-stats-plugin-与-chart-plugin`.
- `docs/architecture/05-plugin-implementations.md#13-stats--chart--ml-插件架构`.
- `docs/development/01-data-roadmap-and-mvp.md#phase-8stats--chart-plugin`.
- `docs/development/02-implementation-roadmap-and-constraints.md#phase-8stats--chart-plugins`.

## Initial Parent Interpretation

- Implement a built-in Stats Plugin baseline and a separate Chart Plugin baseline.
- Stats should expose aggregation behavior for time by tag, time by page, estimate vs actual, habit completion, task switching, and unnoted sessions, using existing metadata/event/filter/view primitives where possible.
- Chart should register plugin-owned chart views for supported normalized data shapes and handle empty/loading states.
- Core must stay free of stats/chart business behavior.
- Keep native/Tauri/package/Rust/schema changes, persistent stats indexes, app-shell dashboard routing, ML/AI insight generation, sync, release packaging, production charting-library adoption, and broad cross-plugin query facade out of scope unless agents identify an acceptance-critical dependency.

## Validation At Start

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK; non-blocking notes were unrestricted sandbox/network and the known `TERM=dumb` terminal failure.

## Parent Decisions

- Start from `master` commit `69684a8`, after TASK-027 merge validation.
- Use branch `feat/task-028-stats-chart-plugins`.
- Delegate pre-test planning/current-doc guidance, deprecation/API review, and security review before writing tests because TASK-028 touches React/Vitest plugin views, aggregation semantics, metadata/event inputs, and plugin isolation.
- Parent thread will not write TASK-028 tests, production implementation, review findings, or formal docs sync unless a delegated agent fails or is explicitly cancelled and the fallback reason is recorded.

## Current Next Action

- Pre-test guidance started 2026-05-25 10:38 CST.
- Hume (`planner`) is defining the smallest safe TASK-028 slice, canonical ids, acceptance criteria, risks, and TDD handoff.
- Lovelace (`docs_researcher`) is checking current React/Vitest/Testing Library/chart accessibility guidance for aggregation and chart view tests.
- Mencius (`deprecation_auditor`) is auditing canonical Stats/Chart identifiers, stale docs/API risks, and deprecated framework patterns.
- Socrates (`security_reviewer`) is reviewing aggregation input trust, chart DTO validation, plugin isolation, and native/package/Tauri/Rust/schema guardrails.

## Current Next Action

- Wait for pre-test guidance agents, then record parent decisions and delegate failing acceptance tests to `test_writer`.

## Pre-Test Guidance Outcomes

- Hume (`planner`) completed read-only planning. Recommendation: implement the smallest safe slice as built-in `stats` and `chart` plugins only. Stats owns aggregation; Chart owns rendering. No Core, native/Tauri/Rust/schema/package changes. Defer Stats dashboard/insight views, saved filters, persistent indexes, production charting libraries, app-shell routes, ML/AI insight generation, and broad cross-plugin query facade.
- Lovelace (`docs_researcher`) completed read-only current-doc/test guidance. Recommendation: use one focused `src/test/stats-chart-plugins.test.tsx` suite; test charts with semantic role/name/text queries, accessible regions/tables/lists/status states, and deterministic aggregation fixtures. Avoid snapshots, colors, SVG geometry, canvas pixel checks, and charting library dependencies. Current React `createElement`, Testing Library role queries, user-event setup/fake timer guidance, Vitest date timers, and W3C complex-image/status guidance require no P0/P1 changes.
- Mencius (`deprecation_auditor`) completed read-only API audit. Recommendation: do not test against a runtime `AlgorithmRegistry` or `ctx.algorithms`; current `PluginContext` has commands/views/slots/stores/transactions while manifest algorithm descriptors are inert. Use namespaced DTO kinds, kebab/dotted ids, and later docs sync for stale snake_case docs.
- Socrates (`security_reviewer`) completed read-only security guidance. P0/P1 constraints: no Core stats/chart business logic; no native/package/Rust/Tauri/schema changes; no raw runtime/store/registry/PluginHost/native imports; no private plugin data mutation; aggregation and Chart DTO inputs are untrusted and must be exact, bounded, finite, provenance-checked, and inert; no HTML/Markdown execution sinks.

## Parent Decisions After Guidance

- TASK-028 current scope is a Stats Plugin baseline plus a Chart Plugin baseline.
- Plugin ids are `stats` and `chart`.
- Stats runtime command:
  - `stats.run-aggregation({ aggregationId, input })`
- Do not register per-aggregation commands or stale commands such as `stats.open_review`.
- Stats manifest declares inert algorithm descriptors:
  - `stats.sum-time-by-tag`
  - `stats.sum-time-by-page`
  - `stats.estimate-vs-actual`
  - `stats.habit-completion-rate`
  - `stats.task-switch-count`
  - `stats.unnoted-sessions-count`
- Stats exports pure aggregation helpers for implementation/test reuse, but test files must keep `bun run typecheck` green before production files exist.
- Stats views and saved filters are deferred because current runtime has no executable algorithm registry and the current Filter AST cannot express event aggregates.
- Aggregations consume caller-provided normalized DTO fixtures. Stats must not read Timer/Habit/Task/Tag internals or private data directly through plugin facades.
- Aggregation semantics:
  - Time by tag uses valid Timer segment provenance joined with trusted Tag metadata; assign full segment duration to each tag and use `No tag` when no valid tags exist.
  - Time by page groups valid Timer segment duration by page and labels from trusted page titles.
  - Estimate vs actual sums Timer actual seconds by task page and compares with trusted fixture metadata `task.estimate` as numeric seconds; Task Plugin remains unchanged.
  - Habit completion uses trusted Habit checked/unchecked events and terminal event semantics per habit/date over an explicit inclusive date range.
  - Task switching sorts valid Timer segments by `startAt` and counts adjacent page changes only.
  - Unnoted sessions counts valid Timer segments without matching Timer note-added events by `pageId + segmentId`; it returns counts by page, not a saved filter.
- Chart views:
  - `chart.bar`
  - `chart.line`
  - `chart.pie`
- Chart DTO kinds:
  - `chart.category-series`
  - `chart.time-series`
  - `chart.comparison-series`
- `chart.bar` may render category and comparison series; `chart.line` renders time series; `chart.pie` renders category series.
- Chart output is accessible, inert React markup with semantic text alternatives. Loading uses an accessible status/busy state; empty rows show `No chart data`.
- Do not introduce snake_case aliases such as `sum_time_by_tag`, `bar_chart`, `line_chart`, or `pie_chart`.
- Do not add package/native/Tauri/Rust/schema changes or production charting libraries in this slice.

## Test Writer Handoff

- Next agent: `test_writer`.
- Required red tests:
  - Built-ins include `stats` and `chart`.
  - Stats manifest declares the six inert algorithm descriptors and registers only the canonical `stats.run-aggregation` command.
  - Chart registers `chart.bar`, `chart.line`, and `chart.pie` with namespaced accepts for `chart.category-series`, `chart.time-series`, and `chart.comparison-series`.
  - Stale snake_case IDs and stale commands are absent.
  - `stats.run-aggregation` exact payload validation fails closed for extra/missing fields, accessors, symbols, non-enumerables, prototype-carried values, malformed ids, unknown aggregation ids, and wrong input kinds without mutating pages/metadata/events/filters.
  - Aggregations compute time by tag, time by page, estimate vs actual, habit completion, task switching, and unnoted sessions from normalized trusted fixtures and ignore forged/wrong-owner/malformed records.
  - Habit completion aggregation uses terminal event semantics for same-day checked/unchecked/rechecked events.
  - Chart views render category, time, and comparison data with accessible regions/tables/lists/text, plus loading and empty states, without relying on snapshots/colors/SVG geometry/canvas pixels.
  - Integration-style test passes Stats output DTO to Chart view; Chart does not query Stats internals or runtime stores.
  - Static guard: no Core stats/chart business terms, no raw runtime/store/registry/PluginHost/native/Tauri imports from Stats/Chart plugins, no HTML/Markdown sinks, no package/native/Tauri/Rust/schema diffs.

## Current Next Action

- Locke (`test_writer`) completed failing TASK-028 acceptance tests in `src/test/stats-chart-plugins.test.tsx`.
- Scope covered:
  - Built-in `stats` / `chart` registration and canonical ids.
  - Six inert Stats algorithm descriptors and canonical `stats.run-aggregation` only.
  - Chart views `chart.bar`, `chart.line`, `chart.pie` and namespaced DTO kinds.
  - Stale snake_case/stale command absence.
  - Strict command payload validation and store non-mutation.
  - Aggregation fixtures for time by tag/page, estimate vs actual, habit completion, task switching, and unnoted sessions.
  - Forged/malformed/wrong-owner record filtering.
  - Accessible inert Chart rendering, loading, empty states, Stats-to-Chart DTO integration, and static boundary guards.
- Parent red validation passed:
  - `bun run test:frontend -- src/test/stats-chart-plugins.test.tsx` failed as expected with 10 failed / 1 passed because the production Stats and Chart plugin surfaces do not exist yet.
- Parent static validation passed:
  - `bun run typecheck`.
  - `./node_modules/.bin/eslint src/test/stats-chart-plugins.test.tsx --max-warnings=0`.
  - `.skip/.only` scan.
  - `git diff --check`.
  - Native/package/Tauri/Rust/schema diff guard.
- Test commit: `bbe138e Locke(test)(Implement Stats and Chart plugins): add stats chart acceptance tests`; post-commit auto-push succeeded.

## Current Next Action

- Galileo (`implementer`) completed minimum production code and parent committed it as `d17f954 Galileo(implementation)(Implement Stats and Chart plugins): implement stats chart baselines`.
- Files changed by implementation:
  - `src/bootstrap/built-in-plugins.ts`
  - `src/plugins/stats/index.ts`
  - `src/plugins/stats/plugin.ts`
  - `src/plugins/chart/index.ts`
  - `src/plugins/chart/plugin.ts`
- Parent validation after implementation:
  - `bun run test:frontend -- src/test/stats-chart-plugins.test.tsx` passed with 11 tests.
  - `bun run test:frontend -- src/test/stats-chart-plugins.test.tsx src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts src/test/core-architecture-boundary.test.ts src/test/habit-heatmap-plugins.test.tsx src/test/calendar-plugin-baseline.test.tsx` passed with 6 files / 117 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - Native/package/Tauri/Rust/schema diff guard was empty.
- Review wave started at 2026-05-25 11:03 CST:
  - Anscombe (`pr_explorer`) for changed-path mapping.
  - Ptolemy (`reviewer`) for correctness review.
  - Parfit (`deprecation_auditor`) for API/deprecation audit.
  - Tesla (`security_reviewer`) for trust-boundary review.
  - Arendt (`docs_researcher`) for current-doc guidance.
  - Epicurus (`test_quality_reviewer`) for test-quality review.
- Parent next action: wait for review findings and address P0/P1 findings before docs sync and the final local gate.

## Review Wave Outcomes

- Anscombe (`pr_explorer`) completed changed-path mapping. It confirmed the branch was clean at `cf05f2e` and highlighted input budgets, aggregation semantics, chart accessibility/rendering, boundary guard coupling, and Stats/Chart type drift as review risk surfaces.
- Tesla (`security_reviewer`) found one P1 security/trust-boundary issue: Stats and Chart DTOs are unbounded. Stats accepts unbounded arrays, non-magnitude-bounded finite numbers, and arbitrarily long labels/ids/titles; Chart renders unbounded rows/points/comparisons and long text. This can cause expensive sort/render work, large allocations, layout pressure, or numeric overflow.
- Epicurus (`test_quality_reviewer`) confirmed the bounded-input issue as a P1 test gap. It recommended tests defining accepted max row/input count and asserting fail-closed or bounded rendering for oversized Stats aggregation inputs and Chart DTOs.
- Ptolemy (`reviewer`) found two P1 correctness issues:
  - `stats.sum-time-by-page` and `stats.unnoted-sessions-count` group by page title rather than page identity, collapsing distinct pages with the same title.
  - `readTimerNote` rejects canonical Timer note events from the Timer Plugin shape. Timer note-added events use top-level `pageId` and payload keys `segmentId`, `notePageId`, `notedAt`; the current Stats reader expects payload `pageId`.
- Parfit (`deprecation_auditor`) found no P0/P1 API/deprecation blockers. P2 follow-ups: stale formal docs, canonical note drift around pure helper exports, and React dynamic children/duplicate key cleanup.
- Arendt (`docs_researcher`) found one P1 accessibility issue: comparison chart output is not sufficiently self-describing because expected/actual/delta/error values are positional table cells without programmatically clear column labels. It recommended column headers or equivalent labeled list text, plus tests with `columnheader` or user-visible labels. Non-blocking: add `aria-atomic="true"` to status and clean up dynamic child arrays while touching Chart markup.

## Parent Decisions After Review

- Treat all review-found P1s as required before the final local gate:
  - Bounded Stats/Chart DTO arrays, strings, numeric magnitudes, and aggregate totals.
  - Page identity grouping for time-by-page and unnoted sessions while preserving useful labels.
  - Canonical Timer note event support for unnoted sessions.
  - Accessible comparison chart labels/column headers.
- Add red regression tests first through `test_writer`.
- Then delegate the production fixes to `implementer`.
- Defer P2 stale docs until `doc_writer` after P1 fixes are green.

## Current Next Action

- Planck (`test_writer`) completed failing review-fix regression tests in `src/test/stats-chart-plugins.test.tsx`.
- Parent red validation:
  - `bun run test:frontend -- src/test/stats-chart-plugins.test.tsx` failed as expected with 8 failed / 10 passed.
  - Failure coverage: oversized Stats arrays resolve instead of rejecting; huge finite Stats values and overlong labels are not ignored; time-by-page collapses same-title pages; canonical Timer note events are not recognized; unnoted sessions collapse same-title pages; oversized Chart rows/points/comparisons render instead of emptying; Chart overlong labels/huge values render; comparison chart lacks Label/Expected/Actual/Delta/Error headers.
- Parent static validation passed:
  - `bun run typecheck`.
  - `./node_modules/.bin/eslint src/test/stats-chart-plugins.test.tsx --max-warnings=0`.
  - `.skip/.only` scan.
  - `git diff --check`.
  - Native/package/Tauri/Rust/schema diff guard.
- Test-fix commit: `9106bb4 Planck(test-fix)(Implement Stats and Chart plugins): cover stats chart review regressions`; post-commit auto-push succeeded.
- Boyle (`implementer`) started at 2026-05-25 11:15 CST for the P1 production fixes. Scope: production code only; expected fixes are bounded Stats/Chart DTOs, page identity grouping, canonical Timer note support, and accessible comparison chart headers.

## Review-Fix Implementation Outcome

- Boyle (`implementer`) completed the P1 production fixes in `src/plugins/stats/plugin.ts` and `src/plugins/chart/plugin.ts`.
- Fix scope:
  - Stats and Chart DTO arrays are bounded.
  - Labels, identifiers, and numeric magnitudes are constrained at plugin trust boundaries.
  - Stats aggregation totals are guarded against overflow or out-of-bound values.
  - Time-by-page and unnoted-session aggregations group by page identity while preserving useful page labels.
  - Unnoted sessions recognize canonical Timer `timer.note-added` events with top-level `pageId` and payload `segmentId`, `notePageId`, and `notedAt`.
  - Chart comparison output has explicit table column headers for Label, Expected, Actual, Delta, and Error.
  - Chart status output includes `aria-atomic`, and dynamic rows use stable keyed children.
- Parent validation after Boyle's fix:
  - `bun run test:frontend -- src/test/stats-chart-plugins.test.tsx` passed with 18 tests.
  - `bun run test:frontend -- src/test/stats-chart-plugins.test.tsx src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts src/test/core-architecture-boundary.test.ts src/test/habit-heatmap-plugins.test.tsx src/test/calendar-plugin-baseline.test.tsx` passed with 6 files / 124 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - Native/package/Tauri/Rust/schema diff guard was empty.
- Review-fix commit: `dc8739d Boyle(review-fix)(Implement Stats and Chart plugins): harden stats chart DTO boundaries`; post-commit auto-push succeeded.

## Current Next Action

- Focused re-review started at 2026-05-25 11:26 CST:
  - Kepler (`reviewer`) for correctness regression review.
  - Hypatia (`security_reviewer`) for trust-boundary hardening review.
  - Descartes (`test_quality_reviewer`) for review-fix coverage review.
  - Euler (`docs_researcher`) for Chart accessibility/current-doc review.
  - Nietzsche (`deprecation_auditor`) for API/deprecation and stale-pattern review.
- If no P0/P1 findings remain, delegate formal docs sync for stale Stats/Chart docs.

## Focused Re-Review Outcomes

- Kepler (`reviewer`) found no remaining P0/P1 correctness issues. It confirmed page identity grouping, canonical Timer note events, and comparison chart headers. P2: aggregate overflow guards can keep a partial subtotal when a later valid per-item value would exceed the aggregate cap.
- Hypatia (`security_reviewer`) found one remaining P1: Stats and Chart arrays are only length-bounded, not copied or validated as inert plain data before iteration and array method calls. Accessor-backed elements, custom iterators, or overridden array methods can execute during `stats.run-aggregation` or Chart rendering, keeping the DTO trust-boundary issue open.
- Descartes (`test_quality_reviewer`) found no P0/P1 test-quality blockers. P2/P3: page identity tests could assert labels more directly, boundary tests are representative rather than exhaustive, and the oversized Stats test proves rejection but not early rejection.
- Euler (`docs_researcher`) found no remaining P0/P1 accessibility/current-doc issue. It verified comparison tables expose Label, Expected, Actual, Delta, and Error headers. P2: duplicate untrusted optional Chart category `id` values can still duplicate React keys. It listed stale formal docs for doc sync.
- Nietzsche (`deprecation_auditor`) found no P0/P1 API/deprecation blockers. P2/P3: stale formal Stats/Chart identifiers remain in product docs, and a future table-rendering path for time series could have duplicate child keys.

## Parent Decision After Focused Re-Review

- Hypatia's array inertness finding is a required P1.
- Start a second review-fix TDD loop:
  - Delegate failing tests to `test_writer` first.
  - Required test coverage should prove Stats and Chart reject or sanitize non-inert arrays before invoking accessor elements, custom iterators, or overridden array methods.
  - The test patch must touch tests only.
  - After red validation, delegate production fixes to `implementer`.

## Second Review-Fix Test Handoff

- Sartre (`test_writer`) started at 2026-05-25 11:32 CST.
- Scope: add failing tests only in `src/test/stats-chart-plugins.test.tsx` for the remaining Stats/Chart array inertness P1.
- Required coverage:
  - Stats must reject or fail closed before invoking accessor-backed array elements.
  - Stats must not call caller-overridden array methods such as `flatMap` or `sort`.
  - Nested arrays such as Timer segment `tagIds` must not execute custom iterators.
  - Chart must reject or sanitize non-inert series rows before invoking accessor-backed rows or caller-overridden array methods.
- Parent next action: wait for Sartre, validate the expected red signal, commit the test-only patch, then delegate production fixes to `implementer`.

## Second Review-Fix Test Outcome

- Sartre (`test_writer`) added a test-only patch in `src/test/stats-chart-plugins.test.tsx`.
- Coverage added:
  - Stats accessor-backed top-level arrays must not be read before fail-closed handling.
  - Stats caller-overridden top-level array methods must not be invoked.
  - Stats nested `tagIds` custom iterators must not be invoked.
  - Chart accessor-backed category rows must not be read before empty fail-closed rendering.
  - Chart caller-overridden category-series array methods must not be invoked.
- Parent red validation:
  - `bun run test:frontend -- src/test/stats-chart-plugins.test.tsx` failed as expected with 5 failed / 18 passed.
  - Failure symptoms: sentinel assertions expected `0` but observed Stats sentinel counts of `1` and Chart sentinel counts of `2`, proving current production invokes hostile accessor/method/iterator paths.
- Parent static validation passed:
  - `bun run typecheck`.
  - `./node_modules/.bin/eslint src/test/stats-chart-plugins.test.tsx --max-warnings=0`.
  - `git diff --check`.
  - `.skip/.only` scan.
  - Native/package/Tauri/Rust/schema diff guard.
- Test-fix commit: `f449039 Sartre(test-fix)(Implement Stats and Chart plugins): cover inert stats chart arrays`; post-commit auto-push succeeded.

## Current Next Action

- Delegate production fixes to `implementer`.
- Expected production scope: copy/validate Stats and Chart DTO arrays as inert plain arrays before iteration, avoid caller-overridden array methods and custom iterators, preserve existing valid aggregation/rendering behavior, and keep changes limited to Stats/Chart production files unless the implementer reports a blocker.

## Second Review-Fix Implementation Handoff

- Mill (`implementer`) started at 2026-05-25 11:39 CST.
- Scope: production fix only for the five failing array inertness tests.
- Expected changed files: `src/plugins/stats/plugin.ts` and `src/plugins/chart/plugin.ts`.
- Constraints: do not edit tests/docs/progress/package/native/Tauri/Rust/schema files; do not commit, merge, or push.
- Parent next action: wait for Mill, validate focused green checks, then commit the production fix separately.

## Second Review-Fix Implementation Outcome

- Mill (`implementer`) completed the production-only array inertness fix in `src/plugins/stats/plugin.ts` and `src/plugins/chart/plugin.ts`.
- Fix scope:
  - Descriptor-based plain-array copying before Stats/Chart DTO arrays are iterated or rendered.
  - Fail-closed handling for accessor-backed arrays, sparse arrays, arrays with custom own methods/properties, custom iterators, and nested hostile `tagIds` arrays.
  - Replaced Chart DTO `flatMap` validation paths with loops over copied local arrays.
- Parent validation after Mill's fix:
  - `bun run test:frontend -- src/test/stats-chart-plugins.test.tsx` passed with 23 tests.
  - `bun run test:frontend -- src/test/stats-chart-plugins.test.tsx src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts src/test/core-architecture-boundary.test.ts src/test/habit-heatmap-plugins.test.tsx src/test/calendar-plugin-baseline.test.tsx` passed with 6 files / 129 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - Native/package/Tauri/Rust/schema diff guard was empty.
- Review-fix commit: `e48380a Mill(review-fix)(Implement Stats and Chart plugins): reject hostile stats chart arrays`; post-commit auto-push succeeded.

## Current Next Action

- Delegate a narrow re-review to confirm Hypatia's array inertness P1 is closed.
- If no P0/P1 findings remain, delegate formal docs sync for the stale Stats/Chart docs.

## Narrow Array Inertness Re-Review Handoff

- Hubble (`security_reviewer`) started at 2026-05-25 11:45 CST to re-check the Stats/Chart array inertness security boundary.
- Kuhn (`test_quality_reviewer`) started at 2026-05-25 11:45 CST to re-check Sartre's regression tests and Mill's fix coverage.
- Both agents are read-only and must not edit files, commit, merge, or push.
- Parent next action: wait for Hubble and Kuhn, then proceed to docs sync only if no P0/P1 findings remain.
