# Agent Communication Status

Last updated: 2026-05-25 13:09 CST.

## Current Task

- Task: TASK-030 - Implement ML Plugin baseline predictions.
- Branch: `feat/task-030-ml-plugin-baseline-predictions`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Current phase: TASK-030 pre-test guidance delegated.

## Active Agents

- Pasteur (`planner`) is defining the smallest safe TASK-030 slice.
- Averroes (`docs_researcher`) is checking current React/Vitest/Testing Library and Tauri guidance.
- Chandrasekhar (`deprecation_auditor`) is auditing stale ML API/runtime assumptions.
- Hegel (`security_reviewer`) is reviewing ML feature/prediction trust boundaries.

## Current TASK-030 State

- TASK-030 follows TASK-028 and owns the first ML plugin baseline:
  - ML Plugin builds features from pages, metadata, and events.
  - Remaining-time prediction has a deterministic baseline model.
  - Prediction panel renders as a plugin view or slot contribution.
  - Model limitations and confidence are documented.
- Initial parent interpretation:
  - Keep ML behavior in a built-in plugin, not Core.
  - Use current plugin runtime primitives and caller-visible page/metadata/event data only.
  - Treat manifest algorithm descriptors as inert unless agents identify an existing executable runtime hook.
  - Prefer a deterministic TypeScript-only baseline and defer real model training, background jobs, persistent model/index storage, AI/provider calls, app-shell route polish, broad cross-plugin private reads, and native/Tauri/package/Rust/schema/capability changes.
- Agent/config validation passed for orchestration start: 11 agent TOML files parsed; `codex doctor` OK except the known `TERM=dumb` terminal failure plus non-blocking sandbox/network notes.
- Pre-test guidance delegated:
  - Pasteur (`planner`) should define canonical ids, DTO/result shapes, minimal acceptance criteria, expected production files, and deferred scope.
  - Averroes (`docs_researcher`) should verify current official docs for deterministic Vitest tests, React/Testing Library accessible prediction panel rendering, and Tauri no-native implications.
  - Chandrasekhar (`deprecation_auditor`) should check whether ML algorithm descriptors are inert and identify stale ids/API assumptions.
  - Hegel (`security_reviewer`) should define payload, feature, prediction, rendering, and static-guard constraints.

## Current TASK-029 State

- TASK-029 follows TASK-018 and TASK-021 and owns the first Quick Capture + Search plugin slice:
  - Quick Capture creates or appends to an Inbox page.
  - Captured Markdown may include existing Task and Tag syntax, which should remain available for those plugins to process through their existing flows.
  - Search can query page titles and body text at baseline.
  - Desktop entry points need documentation and security review for Tauri permission impact.
- Initial parent interpretation:
  - Keep Quick Capture and Search behavior in built-in plugins, not Core.
  - Use existing page store/service, command registry, view registry, and plugin host primitives where possible.
  - Prefer a no-native baseline unless agents identify an acceptance-critical desktop entry point requiring Tauri capability changes.
  - Keep package/native/Tauri/Rust/schema changes, persistent full-text indexes, background workers, global shortcuts, app-shell route polish, rich mobile toolbar mounting, ML/AI cleanup commands, sync, and packaging out of scope unless agents identify a blocker.
- Agent/config validation passed for orchestration start: 11 agent TOML files parsed; `codex doctor` OK except the known `TERM=dumb` terminal failure plus non-blocking sandbox/network notes.
- Pre-test guidance completed:
  - Gibbs (`planner`) recommended the smallest safe slice as pure TypeScript built-in `quick-capture` and `search` plugins. Native/Tauri/global-shortcut wiring is deferred; desktop entry-point acceptance is documentation and static permission-impact review.
  - Franklin (`docs_researcher`) recommended one focused `src/test/quick-capture-search-plugins.test.tsx` suite, Testing Library role/name/user-event assertions for views, and a native/Tauri/package static guard. Its local-doc examples using `quick_capture.*` were treated as stale because planner/API review and current repo style prefer kebab/dotted ids.
  - Hilbert (`deprecation_auditor`) found no P0 blockers and required canonical ids over stale underscore aliases. It also noted `PluginContext` has no public command execute API, no native shortcut API, no query facade, and no executable indexer registry.
  - Newton (`security_reviewer`) required no native/package/Tauri/Rust/schema changes, exact bounded plain payloads, inert Markdown/result text, fixed Inbox target only, no Task/Tag private writes, bounded literal search, capped snippets/results, no raw runtime/store/native imports, and no HTML/Markdown execution sinks.
- Parent decisions after guidance:
  - Plugin ids are `quick-capture` and `search`.
  - Quick Capture commands are `quick-capture.open`, `quick-capture.save`, and `quick-capture.save-and-open`; do not register `quick_capture.*` aliases.
  - Quick Capture views are `quick-capture.modal` and `quick-capture.mobile-input`.
  - Quick Capture uses plugin-owned metadata/filter ids `quick-capture.unprocessed` and `quick-capture.filter.inbox`; do not use stale `inbox.unprocessed`.
  - Search command is `search.query`; Search view and DTO kind are `search.results`.
  - Quick Capture must create/append only a trusted plugin-marked `Inbox` page. If a title-only Inbox already exists without Quick Capture metadata, leave it alone and create a trusted Inbox.
  - Quick Capture preserves Markdown as structured text and does not auto-create Task/Tag pages or metadata. Tests may explicitly run existing `tag.refresh-tags` and `task.resolve-task-block` / `task.open-task-page` afterward to prove handoff.
  - Search is transient/on-demand over unarchived pages only; no persistent index, worker, SQLite/FTS, package, native, Tauri, Rust, schema, or capability changes.
- Test writer completed:
  - Aquinas (`test_writer`) added `src/test/quick-capture-search-plugins.test.tsx` with 10 TASK-029 acceptance tests.
  - Parent validated the expected red signal: focused TASK-029 tests failed with 9 failed / 1 passed because the `quick-capture` and `search` built-ins, commands, views, and plugin files do not exist yet.
  - Parent static validation passed: `bun run typecheck`, focused ESLint for `src/test/quick-capture-search-plugins.test.tsx`, `git diff --check`, `.skip/.only` scan, and native/package/Tauri/Rust/schema diff guard.
  - Test commit: `8248f65 Aquinas(test)(Implement Quick Capture and Search plugins): add capture search acceptance tests`; post-commit auto-push succeeded.
- Implementation completed:
  - Schrodinger (`implementer`) added the Quick Capture and Search production baselines.
  - Changed files: `src/bootstrap/built-in-plugins.ts`, `src/plugins/quick-capture/index.ts`, `src/plugins/quick-capture/plugin.ts`, `src/plugins/search/index.ts`, and `src/plugins/search/plugin.ts`.
  - Parent validated: focused TASK-029 tests passed (10 tests), adjacent plugin/API/Task/Tag/Stats suite passed (9 files / 174 tests), `bun run typecheck` passed, `bun run lint` passed, `git diff --check` passed, and native/package/Tauri/Rust/schema diff guard was empty.
  - Implementation commit: `a174efb Schrodinger(implementation)(Implement Quick Capture and Search plugins): implement capture search baselines`; post-commit auto-push succeeded.
- Review wave completed:
  - Carson (`pr_explorer`) mapped changed paths and highlighted Quick Capture trust boundary, Search limits/ordering, UI scope, and docs drift as review surfaces.
  - Confucius (`security_reviewer`) found no P0/P1 issues and confirmed the no-native/no-package/no-Tauri baseline.
  - Ohm (`test_quality_reviewer`) found P1 test gaps: malformed/hostile `search.query` payloads are not covered, and Search title/scanned page/body caps are not locked by tests.
  - Dirac (`docs_researcher`) found one P1 accessibility issue: `quick-capture.modal` exposes `role="dialog"` without real dialog semantics. Parent decision: make this baseline a labelled `region`; real modal/focus behavior remains app-shell work.
  - Herschel (`reviewer`) found no P0/P1 correctness issues. P2: trusted Inbox rename behavior, Search ordering, and Search hostile-payload coverage.
  - Raman (`deprecation_auditor`) found no P0/P1 API/deprecation issues. P2: formal docs still contain stale Quick Capture ids and native shortcut wording.
  - Parent decision: add review-fix tests first, then delegate production fixes. Include P2 Search status/empty result and `save-and-open` payload parity tests if cheap while touching the suite.
- Review-fix tests completed:
  - Lagrange (`test_writer`) added focused review-fix coverage in `src/test/quick-capture-search-plugins.test.tsx`.
  - Parent validated the expected red signal: focused TASK-029 tests failed with 2 failed / 13 passed because `quick-capture.modal` still exposes `role="dialog"` and `search.results` lacks a `role="status"` summary.
  - Search hostile payload, Search caps, save-and-open hostile payload parity, and static import guard hardening already pass against the current implementation.
  - Static validation passed: `bun run typecheck`, focused ESLint for `src/test/quick-capture-search-plugins.test.tsx`, `git diff --check`, `.skip/.only` scan, and native/package/Tauri/Rust/schema diff guard.
  - Test-fix commit: `8a36751 Lagrange(test-fix)(Implement Quick Capture and Search plugins): cover capture search review gaps`; post-commit auto-push succeeded.
- Review-fix implementation completed:
  - Jason (`implementer`) changed `quick-capture.modal` to a labelled region and added Search result status summaries for empty/non-empty results.
  - Changed files: `src/plugins/quick-capture/plugin.ts` and `src/plugins/search/plugin.ts`.
  - Parent validated: focused TASK-029 tests passed (15 tests), adjacent plugin/API/Task/Tag/Stats suite passed (9 files / 179 tests), `bun run typecheck` passed, `bun run lint` passed, `git diff --check` passed, and native/package/Tauri/Rust/schema diff guard was empty.
  - Review-fix commit: `376ab21 Jason(review-fix)(Implement Quick Capture and Search plugins): fix capture search accessibility`; post-commit auto-push succeeded.
- Narrow re-review completed:
  - Sagan (`test_quality_reviewer`) found no P0/P1/P2/P3 findings for the review-fix gaps.
  - Volta (`docs_researcher`) found no P0/P1 accessibility issues; prior Quick Capture dialog and Search status issues are fixed. It listed stale formal docs for doc sync.
  - Rawls (`security_reviewer`) found no P0/P1 security issues and confirmed Search hostile payload/cap boundaries remain strict.
  - Parent decision: proceed to formal docs sync.
- Docs sync completed:
  - McClintock (`doc_writer`) synced formal Quick Capture/Search product, architecture, development, and task-index docs to the TASK-029 implementation.
  - Changed docs: `docs/product/05-built-in-plugins.md`, `docs/product/03-plugin-platform.md`, `docs/product/06-view-slots.md`, `docs/architecture/01-overview-and-monorepo.md`, `docs/architecture/05-plugin-implementations.md`, `docs/architecture/06-filter-native-database.md`, `docs/architecture/07-runtime-flows.md`, `docs/development/01-data-roadmap-and-mvp.md`, `docs/development/02-implementation-roadmap-and-constraints.md`, and `docs/implementation/task-index.md`.
  - Parent validation: `git diff --check` passed, stale-id scan found no remaining `quick_capture` or `inbox.unprocessed` references, broader deferred-scope scan only found explicit future/deferred native shortcut and Search indexing wording, and source/package/native/Tauri/Rust/schema diff guard was empty.
  - Docs commit: `b9cdbe7 McClintock(docs)(Implement Quick Capture and Search plugins): sync capture search docs`; post-commit auto-push succeeded.
- Final branch gate completed:
  - `bun run check:quick` passed with typecheck, lint, 34 frontend test files / 534 tests, Rust fmt, Rust clippy, and Rust tests.
  - `docs/implementation/progress.md` marks TASK-029 complete and records the ready-to-merge branch state.
- Merge completed:
  - TASK-029 merged to `master` in commit `da9a96f`.
  - Merge-result `bun run check:quick` passed with typecheck, lint, 34 frontend test files / 534 tests, Rust fmt, Rust clippy, and Rust tests.

## Current TASK-028 State

- TASK-028 follows TASK-025 and TASK-027 and owns the first Stats + Chart plugin slice:
  - Stats Plugin can aggregate time by tag, time by page, estimate vs actual, habit completion, task switching, and unnoted sessions.
  - Chart Plugin registers plugin-owned chart views for supported data shapes.
  - Empty and loading states are handled.
- Initial parent interpretation:
  - Keep Stats/Chart business behavior in built-in plugins, not Core.
  - Prefer explicit normalized DTOs and command/view registry primitives already used by Calendar and Heatmap.
  - Keep native/Tauri/package/Rust/schema changes, persistent indexes, app-shell dashboard routing, ML/AI insight generation, sync, release packaging, and broad cross-plugin query facade out of scope unless agents identify an acceptance-critical dependency.
- Agent/config validation passed for orchestration start: 11 agent TOML files parsed; `codex doctor` OK except the known `TERM=dumb` terminal failure plus non-blocking sandbox/network notes.
- Pre-test guidance completed:
  - Hume (`planner`) recommended the smallest safe slice as built-in `stats` and `chart` plugins only: Stats owns aggregation, Chart owns rendering, Core/native/package/Rust/schema remain unchanged, Stats views/filters and production charting libraries are deferred.
  - Lovelace (`docs_researcher`) recommended one focused `src/test/stats-chart-plugins.test.tsx` suite using semantic RTL queries, no snapshots/color/SVG geometry assertions, accessible chart regions/tables/lists/status states, deterministic aggregation fixtures, and no charting library in the baseline.
  - Mencius (`deprecation_auditor`) confirmed no current API/deprecation blocker. It warned not to test against a runtime AlgorithmRegistry, because manifest `contributes.algorithms` is inert today, and recommended namespaced DTO kinds plus stale-doc cleanup later.
  - Socrates (`security_reviewer`) required PluginContext/DTO boundaries only, no raw runtime/store/registry/native imports, exact DTO validation, forged provenance rejection, bounded chart inputs, no HTML/Markdown sinks, and no package/native/Tauri/Rust/schema changes.
- Parent decisions after guidance:
  - Use plugin ids `stats` and `chart`.
  - Stats runtime command is `stats.run-aggregation({ aggregationId, input })`; do not add per-aggregation commands or `stats.open_review`.
  - Stats manifest includes inert algorithm descriptors: `stats.sum-time-by-tag`, `stats.sum-time-by-page`, `stats.estimate-vs-actual`, `stats.habit-completion-rate`, `stats.task-switch-count`, and `stats.unnoted-sessions-count`.
  - Stats exports pure aggregation helpers for implementation/test reuse, but tests must preserve green typecheck while production files are absent.
  - Stats does not register views or filters in this slice.
  - Chart views are `chart.bar`, `chart.line`, and `chart.pie`; Chart DTO kinds are `chart.category-series`, `chart.time-series`, and `chart.comparison-series`.
  - `chart.bar` may render category and comparison series; `chart.line` renders time series; `chart.pie` renders category series.
  - No snake_case aliases such as `sum_time_by_tag`, `bar_chart`, `line_chart`, or `pie_chart`.
  - Aggregations consume caller-provided normalized DTO fixtures and must not directly read Timer/Habit/Task/Tag internals or private data through plugin facades.
  - Output maps to Chart DTOs: time-by-tag/page, habit completion, task switching, and unnoted sessions return category series; estimate-vs-actual returns comparison series.
- Test writer completed:
  - Locke (`test_writer`) added `src/test/stats-chart-plugins.test.tsx` with 11 TASK-028 acceptance tests and did not edit production code, docs, progress, branch state, commits, or pushes.
  - Parent validated the expected red signal: `bun run test:frontend -- src/test/stats-chart-plugins.test.tsx` failed with 10 failed / 1 passed because the Stats and Chart production surfaces are intentionally missing.
  - Parent validated static green checks: `bun run typecheck`, focused ESLint for the new test file, `git diff --check`, `.skip/.only` scan, and native/package/Tauri/Rust/schema diff guard.
  - Test commit: `bbe138e Locke(test)(Implement Stats and Chart plugins): add stats chart acceptance tests`; post-commit auto-push succeeded.
- Implementation completed:
  - Galileo (`implementer`) added built-in Stats and Chart plugin baselines in production code only.
  - Changed files: `src/bootstrap/built-in-plugins.ts`, `src/plugins/stats/index.ts`, `src/plugins/stats/plugin.ts`, `src/plugins/chart/index.ts`, and `src/plugins/chart/plugin.ts`.
  - Parent validated: focused TASK-028 tests passed (11 tests), adjacent plugin/core suite passed (6 files / 117 tests), `bun run typecheck` passed, `bun run lint` passed, `git diff --check` passed, and native/package/Tauri/Rust/schema diff guard was empty.
  - Implementation commit: `d17f954 Galileo(implementation)(Implement Stats and Chart plugins): implement stats chart baselines`; post-commit auto-push succeeded.
- Review wave outcomes:
  - Anscombe (`pr_explorer`) mapped changed files and highlighted input budgets, aggregation semantics, chart accessibility, boundary guard coupling, and type drift as review risk surfaces.
  - Tesla (`security_reviewer`) found one P1: Stats/Chart DTOs lack bounded array, label, and numeric magnitude handling, allowing large allocation/render/sort work or aggregate overflow at command/view trust boundaries.
  - Epicurus (`test_quality_reviewer`) confirmed the bounded-input issue as a P1 test gap.
  - Ptolemy (`reviewer`) found two P1 correctness issues: `sum-time-by-page` and `unnoted-sessions` group by page title rather than page identity, collapsing distinct pages with the same title; and `readTimerNote` rejects canonical Timer note events from the Timer Plugin shape.
  - Parfit (`deprecation_auditor`) found no P0/P1 API/deprecation issues. P2 follow-ups: stale docs, Stats helper export note drift, and React dynamic children/duplicate key cleanup.
  - Arendt (`docs_researcher`) found one P1 accessibility issue: comparison chart output uses unlabeled positional table cells without programmatically clear column labels. It also recommended explicit `aria-atomic` on status and React dynamic-child cleanup as non-blocking improvements.
- Review-fix regression tests completed:
  - Planck (`test_writer`) added focused tests for bounded Stats arrays, bounded Stats numbers/labels, page identity grouping, canonical Timer note shape, bounded Chart DTOs, bounded Chart rows, and comparison chart headers.
  - Parent validated the expected red signal: focused TASK-028 tests failed with 8 failed / 10 passed.
  - Static validation passed: `bun run typecheck`, focused ESLint for `src/test/stats-chart-plugins.test.tsx`, `git diff --check`, `.skip/.only` scan, and native/package/Tauri/Rust/schema diff guard.
  - Test-fix commit: `9106bb4 Planck(test-fix)(Implement Stats and Chart plugins): cover stats chart review regressions`; post-commit auto-push succeeded.
- P1 production fixes completed:
  - Boyle (`implementer`) hardened Stats and Chart trust boundaries in production code only.
  - Changed files: `src/plugins/stats/plugin.ts` and `src/plugins/chart/plugin.ts`.
  - Fix scope: bounded Stats/Chart DTO arrays, trusted label and numeric magnitude checks, aggregate overflow guards, page-identity grouping for same-title pages, canonical Timer note-added event support, accessible Chart table headers, `aria-atomic` status, and stable dynamic child keys.
  - Parent validated: focused TASK-028 tests passed (18 tests), adjacent plugin/core suite passed (6 files / 124 tests), `bun run typecheck` passed, `bun run lint` passed, `git diff --check` passed, and native/package/Tauri/Rust/schema diff guard was empty.
  - Review-fix commit: `dc8739d Boyle(review-fix)(Implement Stats and Chart plugins): harden stats chart DTO boundaries`; post-commit auto-push succeeded.
- Focused re-review completed:
  - Kepler (`reviewer`) found no P0/P1 correctness regressions. P2: aggregate overflow guards can preserve partial totals when a later addition exceeds the cap.
  - Hypatia (`security_reviewer`) found one remaining P1: Stats and Chart arrays are only length-bounded, not copied/validated as inert plain data before iteration or method calls, so accessor elements or overridden array methods can execute during command/view handling.
  - Descartes (`test_quality_reviewer`) found no P0/P1 test-quality blockers. P2/P3: page-identity label assertions and early-rejection tests could be more explicit.
  - Euler (`docs_researcher`) found no P0/P1 accessibility blockers. P2: duplicate optional Chart category `id` values can still duplicate React keys; docs sync is still needed.
  - Nietzsche (`deprecation_auditor`) found no P0/P1 API/deprecation blockers. P2/P3: stale docs and a future time-series table key collision risk.
  - Parent decision: treat Hypatia's array inertness finding as a required P1 and start a second TDD review-fix loop.
- Second P1 regression tests completed:
  - Sartre (`test_writer`) added test-only coverage for non-inert Stats and Chart arrays in `src/test/stats-chart-plugins.test.tsx`.
  - Parent validated the expected red signal: focused TASK-028 tests failed with 5 failed / 18 passed because accessor-backed arrays, overridden array methods, and nested custom iterators invoked sentinels.
  - Static validation passed: `bun run typecheck`, focused ESLint for `src/test/stats-chart-plugins.test.tsx`, `git diff --check`, `.skip/.only` scan, and native/package/Tauri/Rust/schema diff guard.
  - Test-fix commit: `f449039 Sartre(test-fix)(Implement Stats and Chart plugins): cover inert stats chart arrays`; post-commit auto-push succeeded.
- Second P1 production fix completed:
  - Mill (`implementer`) added descriptor-based plain-array copying and fail-closed inertness validation in Stats and Chart production code.
  - Changed files: `src/plugins/stats/plugin.ts` and `src/plugins/chart/plugin.ts`.
  - Parent validated: focused TASK-028 tests passed (23 tests), adjacent plugin/core suite passed (6 files / 129 tests), `bun run typecheck` passed, `bun run lint` passed, `git diff --check` passed, and native/package/Tauri/Rust/schema diff guard was empty.
  - Review-fix commit: `e48380a Mill(review-fix)(Implement Stats and Chart plugins): reject hostile stats chart arrays`; post-commit auto-push succeeded.
- Narrow array inertness re-review completed:
  - Hubble (`security_reviewer`) found no P0/P1 issues and confirmed Hypatia's array-inertness P1 is closed. Residual note: Proxy-backed arrays/objects are not specifically covered by the narrow test set.
  - Kuhn (`test_quality_reviewer`) found no P0/P1 test-quality blockers. P2: array-method coverage is representative rather than exhaustive; Stats does not separately cover `sort`, Chart does not separately cover `map`, and top-level accessor coverage uses `segments` as the shared-reader representative.
  - Parent decision: proceed to formal docs sync before final branch gate.
- Docs sync completed:
  - Maxwell (`doc_writer`) synced formal Stats/Chart docs to the TASK-028 implementation.
  - Changed docs: product plugin platform, editor/workflows, built-in plugins, architecture slots/editor/task, plugin implementations, runtime flows, development roadmap docs, and the task index.
  - Parent validation: `git diff --check` passed, stale-id scan reported only historical agent-communication notes, and source/package/native/Tauri/Rust/schema diff guard was empty.
  - Docs commit: `19b9488 Maxwell(docs)(Implement Stats and Chart plugins): sync stats chart docs`; post-commit auto-push succeeded.
- Final branch gate completed:
  - `bun run check:quick` passed with typecheck, lint, 33 frontend test files / 519 tests, Rust fmt, Rust clippy, and Rust tests.
  - `docs/implementation/progress.md` marks TASK-028 complete and records the ready-to-merge branch state.
- Merge completed:
  - TASK-028 merged to `master` in commit `8d2ce2b`.
  - Merge-result `bun run check:quick` passed with typecheck, lint, 33 frontend test files / 519 tests, Rust fmt, Rust clippy, and Rust tests.

## Current TASK-027 State

- TASK-027 follows TASK-021 and TASK-026 and owns the first Habit + Heatmap slice:
  - `#habit` syntax or habit metadata marks habit pages.
  - Habit completion writes Habit-owned events.
  - Habits and Today Habits filters work.
  - Heatmap view renders habit completion events.
- Initial parent interpretation:
  - Keep habit semantics in a built-in Habit Plugin, not Core.
  - Keep heatmap rendering in a separate Heatmap Plugin that consumes generic date-series data, not Habit internals.
  - Use existing metadata, event, filter, view, command, slot, and plugin primitives where possible.
  - Preserve Task Plugin ownership of checkbox behavior unless agents define a narrow command/event path for Habit completion.
  - Keep native/Tauri/package/Rust/schema changes, persistence rewiring, broad app-shell navigation, Stats/ML aggregation, Calendar scheduled feeds, external sync, and release packaging out of scope unless agents identify an acceptance-critical dependency.
- Agent/config validation passed for orchestration start: 11 agent TOML files parsed; `codex doctor` OK except the known `TERM=dumb` terminal failure plus non-blocking sandbox/network notes.
- Pre-test guidance completed:
  - Einstein (`planner`) recommended a narrow slice: built-in `habit` plugin for habit metadata/events/filters and built-in `heatmap` plugin for generic date-series rendering. It recommended deferring existing Task checkbox auto-bridge, `habit.heatmap` alias, Habit Review, skipped/weekly/monthly recurrence, full streak logic, save-time indexing, Stats/ML/Calendar feeds, app-shell routes, and native/Tauri/Rust/schema/package changes.
  - Laplace (`docs_researcher`) recommended focused RTL/Vitest tests in one TASK-027 file, semantic list/button/region queries, explicit deterministic dates or fake timers, no color/snapshot heatmap assertions, and static native/plugin-boundary guards. It flagged stale snake_case docs and ambiguous Task checkbox wording for later docs sync.
  - Kierkegaard (`deprecation_auditor`) recommended kebab-case commands, camelCase metadata keys, split event `namespace: "habit"` / `type: "checked" | "unchecked"`, `heatmap.calendar` over `habit.heatmap`, and namespaced `heatmap.date-series` over bare `date-series`.
  - Singer (`security_reviewer`) required PluginContext-only access, exact payload/DTO validation, forged owner rejection, generic Heatmap DTO rendering, no raw runtime/store/PluginHost/native/Tauri imports, no HTML/Markdown sinks, and no package/native/Rust/schema changes.
- Parent decisions after guidance:
  - Use plugin ids `habit` and `heatmap`.
  - Use canonical commands `habit.refresh-habit`, `habit.check-today`, `habit.uncheck-today`, and `habit.set-frequency`; do not register snake_case aliases.
  - Use Habit metadata `habit.enabled` (`boolean`), `habit.frequency` (`string`, baseline `daily`), `habit.lastCheckedAt` (`date`), and `habit.nextDue` (`date`). `habit.target`, `habit.streak`, and skipped/weekly/monthly recurrence remain deferred.
  - Use event records with `namespace: "habit"` and `type: "checked" | "unchecked"`; payloads use `{ habitPageId, date }`. Stored event `type` must not be `habit.checked`.
  - `habit.check-today({ pageId })` is the TASK-027 completion path. It verifies the page exists and is a trusted Habit page, appends at most one `checked` event per habit/date, sets `lastCheckedAt` to today, and advances `nextDue` to tomorrow for daily habits. Existing Task checkbox auto-bridge is deferred.
  - `habit.uncheck-today({ pageId })` appends `unchecked`, removes today's completion state, and sets `nextDue` back to today.
  - Habits filter id is `habit.filter.habits`; Today Habits filter id is `habit.filter.today-habits`. Today Habits uses `metadata.habit.nextDue eq today OR metadata.habit.nextDue lt today` because the current filter engine has no `lte` operator.
  - Heatmap registers generic view `heatmap.calendar` with `type: "heatmap"` and accepts `{ kind: "heatmap.date-series" }`. Heatmap does not import Habit internals or read Habit events directly; tests may normalize public Habit events into DTOs in the harness.
- Test writer completed:
  - Copernicus (`test_writer`) added `src/test/habit-heatmap-plugins.test.tsx` with 14 TASK-027 acceptance tests and did not edit production code, docs, progress, branch state, or commits.
  - Parent validated the expected red signal: `bun run test:frontend -- src/test/habit-heatmap-plugins.test.tsx` failed with 13 failed / 1 passed because the Habit and Heatmap production surfaces are intentionally missing.
  - Parent validated static green checks: `bun run typecheck`, focused ESLint for the new test file, `git diff --check`, `.skip/.only` scan, and native/package/Tauri/Rust/schema diff guard.
  - Test commit: `8fe0812 Copernicus(test)(Implement Habit and Heatmap plugins): add habit heatmap acceptance tests`; post-commit auto-push succeeded.
- Implementation completed:
  - Halley (`implementer`) added built-in `habit` and `heatmap` plugin baselines in production code only.
  - Changed files: `src/bootstrap/built-in-plugins.ts`, `src/plugins/habit/index.ts`, `src/plugins/habit/plugin.ts`, `src/plugins/heatmap/index.ts`, and `src/plugins/heatmap/plugin.ts`.
  - Parent validated: focused TASK-027 tests passed (14 tests), adjacent plugin/core suite passed (6 files / 116 tests), `bun run typecheck` passed, `bun run lint` passed, `git diff --check` passed, and native/package/Tauri/Rust/schema diff guard was empty.
  - Implementation commit: `b44bf7a Halley(implementation)(Implement Habit and Heatmap plugins): implement habit and heatmap plugin baselines`; post-commit auto-push succeeded.
- Review wave outcomes:
  - Bernoulli (`pr_explorer`) mapped changed files and highlighted same-day `check -> uncheck -> check` event chronology, owner-reserved filter execution, local-date boundaries, custom `#habit` parsing, and Heatmap row validation as risk surfaces.
  - Hooke (`reviewer`) found one P1: `habit.check-today` suppresses a new `checked` event after same-day `uncheck-today`, leaving metadata checked while append-only event consumers see the terminal event as `unchecked`.
  - Fermat (`test_quality_reviewer`) confirmed the same P1 as a test gap and recommended regression coverage for same-day re-check after uncheck.
  - Heisenberg (`deprecation_auditor`) confirmed the same P1 and found no deprecated API blockers; it also flagged stale formal docs for Habit identifiers and Heatmap `date-series` naming.
  - Feynman (`security_reviewer`) found no P0/P1 security or isolation issues; residual low-risk notes were no Heatmap row-count cap and owner-scoped metadata preserving Habit trust after syntax removal.
  - Beauvoir (`docs_researcher`) found no current official-doc P0/P1 changes needed. It verified React 19.2 `createElement`, Testing Library query guidance, Vitest fake-date APIs, W3C ARIA region guidance, and Tauri v2 capabilities guidance, and listed stale local docs for `doc_writer`.
- P1 regression test completed:
  - Darwin (`test_writer`) added a focused test for same-day `habit.check-today -> habit.uncheck-today -> habit.check-today`.
  - Parent validated the expected red signal: focused TASK-027 tests failed with 1 failed / 14 passed because the event stream had only `checked, unchecked` instead of `checked, unchecked, checked`.
  - Static validation passed: `bun run typecheck`, focused ESLint for `src/test/habit-heatmap-plugins.test.tsx`, `git diff --check`, `.skip/.only` scan, and native/package/Tauri/Rust/schema diff guard.
  - Test-fix commit: `50bd24d Darwin(test-fix)(Implement Habit and Heatmap plugins): cover same-day habit recheck`; post-commit auto-push succeeded.
- Docs sync completed:
  - Ramanujan (`doc_writer`) updated formal product, architecture, and development docs for canonical Habit/Heatmap identifiers, Heatmap DTO naming, split event namespace/type, and deferred scope.
  - Docs commit: `16c9a04 Ramanujan(docs)(Implement Habit and Heatmap plugins): sync habit heatmap docs`; post-commit auto-push succeeded.
- P1 production fix completed:
  - Goodall (`implementer`) changed `habit.check-today` idempotency to inspect the latest same-day terminal Habit event. Consecutive duplicate checks remain idempotent, while same-day re-check after `unchecked` appends a trailing `checked`.
  - Parent validated focused TASK-027 tests passed (15 tests), adjacent plugin/core suite passed (6 files / 117 tests), `bun run typecheck` passed, `bun run lint` passed, `git diff --check` passed, and native/package/Tauri/Rust/schema diff guard was empty.
  - Review-fix commit: `5bfe173 Goodall(review-fix)(Implement Habit and Heatmap plugins): preserve rechecked habit events`; post-commit auto-push succeeded.
- Final branch gate passed:
  - `bun run check:quick` passed with typecheck, lint, 32 frontend test files / 496 tests, Rust fmt, Rust clippy, and Rust tests.
- Merge completed:
  - TASK-027 merged to `master` in commit `2f03864`.
  - Merge-result `bun run check:quick` passed with typecheck, lint, 32 frontend test files / 496 tests, Rust fmt, Rust clippy, and Rust tests.

## Completed Recent Task

- TASK-026 - Implement Calendar Plugin baseline was completed on branch `feat/task-026-calendar-plugin-baseline`, validated with focused Calendar checks, review-fix regressions, final branch `bun run check:quick`, `bun run build`, release readiness review, and merge-result `bun run check:quick`, then merged to `master` in commit `8738006`.
- TASK-025 - Implement Time Segment and Time Segment Note was completed on branch `feat/task-025-time-segment-note`, validated with final branch `bun run check:quick`, `bun run build`, docs sync, and release readiness review, then merged to `master` in commit `5970fa2`; merge-result `bun run check:quick` passed.
- TASK-024 - Implement Timer Plugin start/stop/pause/resume/switch was completed on branch `feat/task-024-timer-plugin-runtime`, validated with final branch `bun run check:quick`, `bun run build`, docs sync, and release readiness review, then merged to `master` in commit `e219110`; merge-result `bun run check:quick` passed.

## Source Docs Read By Parent For TASK-027

- `.codex/skills/mirabilis-dev-runner/SKILL.md`.
- `docs/implementation/progress.md`.
- `docs/implementation/task-index.md#task-027-implement-habit-and-heatmap-plugins`.
- `docs/product/05-built-in-plugins.md#17-habit-plugin`.
- `docs/architecture/05-plugin-implementations.md#12-habit--heatmap-插件架构`.
- `docs/development/01-data-roadmap-and-mvp.md#phase-7habit-plugin--heatmap-view-plugin`.
- `docs/development/02-implementation-roadmap-and-constraints.md#phase-7habit--heatmap-plugins`.
- Related Habit/Heatmap references in product, architecture, development, and testing docs.

## TASK-027 Validation Log

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK; non-blocking notes were unrestricted sandbox/network and the known `TERM=dumb` terminal failure.
- `bun run test:frontend -- src/test/habit-heatmap-plugins.test.tsx` failed as expected before implementation with missing `habit` / `heatmap` built-ins, commands, filters, view, and production plugin files.
- `bun run typecheck` passed after the new tests.
- `./node_modules/.bin/eslint src/test/habit-heatmap-plugins.test.tsx --max-warnings=0` passed.
- `rg -n "\.(skip|only)\(" src/test/habit-heatmap-plugins.test.tsx` found no matches.
- `git diff --check` passed.
- Native/package/Tauri/Rust/schema diff guard was empty.
- After implementation, `bun run test:frontend -- src/test/habit-heatmap-plugins.test.tsx` passed with 14 tests.
- After implementation, `bun run test:frontend -- src/test/habit-heatmap-plugins.test.tsx src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts src/test/core-architecture-boundary.test.ts src/test/task-filters-view-rendering.test.tsx src/test/tag-plugin-baseline.test.tsx` passed with 6 files / 116 tests.
- After implementation, `bun run typecheck` passed.
- After implementation, `bun run lint` passed.
- After implementation, `git diff --check` passed.
- After implementation, native/package/Tauri/Rust/schema diff guard was empty.

## Parent Decisions At TASK-027 Start

- Start from `master` after TASK-026 merge validation commit `b898ca3`.
- Use branch `feat/task-027-habit-heatmap-plugins`.
- Delegate planning/current-doc guidance, deprecation/API review, security review, TDD tests, implementation, review, and docs sync to agents.
- The parent thread must not write TASK-027 tests or production implementation unless a delegated role fails or is explicitly cancelled and the fallback reason is recorded.

## Next Actions

1. Commit TASK-029 merge validation on `master` and push.
2. Select TASK-030 from `docs/implementation/progress.md`.
3. Start a focused TASK-030 branch and continue the autonomous agent workflow.
