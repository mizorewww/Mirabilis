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
- Parent next action: spawn parallel review/docs agents and address P0/P1 findings before docs sync and the final local gate.
