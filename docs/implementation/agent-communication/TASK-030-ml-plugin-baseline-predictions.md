# TASK-030 Agent Communication - ML Plugin Baseline Predictions

## Task

- ID: TASK-030.
- Name: Implement ML Plugin baseline predictions.
- Branch: `feat/task-030-ml-plugin-baseline-predictions`.
- Started: 2026-05-25 13:07 CST.
- Parent role: orchestration only. Parent delegates planning, docs research, test writing, implementation, review, and docs sync to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-030-implement-ml-plugin-baseline-predictions`.
- `docs/product/05-built-in-plugins.md#21-machine-learning-plugin`.
- `docs/architecture/05-plugin-implementations.md#134-machine-learning-plugin`.
- `docs/development/01-data-roadmap-and-mvp.md#phase-9ml-plugin`.
- `docs/development/02-implementation-roadmap-and-constraints.md#phase-9ml-plugin`.
- `docs/product/06-view-slots.md`.
- `docs/product/03-plugin-platform.md`.
- `docs/implementation/agent-workflow.md`.
- `docs/testing/strategy.md`.

## Initial Parent Interpretation

- Implement a built-in ML Plugin baseline.
- The smallest likely slice is deterministic remaining-time prediction and prediction panel rendering.
- ML must remain plugin-owned; Core must not learn ML, prediction, ranking, or modeling behavior.
- Algorithm manifest descriptors are currently inert; executable AlgorithmRegistry behavior should not be invented unless existing runtime primitives already support it.
- Prefer caller-visible pages, metadata, and events or explicit DTO inputs over private cross-plugin reads.
- Keep AI/provider calls, real training, persistent model/index storage, background refresh jobs, broad cross-plugin private reads, native/Tauri/package/Rust/schema/capability changes, and app-shell route polish out of scope unless agents identify an acceptance-critical blocker.

## Validation At Start

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK; non-blocking notes were unrestricted sandbox/network and the known `TERM=dumb` terminal failure.

## Parent Decisions

- Start from `master` commit `10b833c`, after TASK-029 merge validation.
- Use branch `feat/task-030-ml-plugin-baseline-predictions`.
- Delegate pre-test planning/current-doc guidance, deprecation/API review, and security review before writing tests because TASK-030 touches React/plugin views, model/algorithm descriptors, feature extraction from page/metadata/event-like data, and possible cross-plugin trust boundaries.
- Parent thread will not write TASK-030 tests, production implementation, review findings, or formal docs sync unless a delegated agent fails or is explicitly cancelled and the fallback reason is recorded.

## Current Next Action

- Delegate pre-test guidance:
  - `planner` to define the smallest safe TASK-030 slice, canonical ids, acceptance criteria, and deferred scope.
  - `docs_researcher` to check current React/Vitest/Testing Library guidance for deterministic feature/model tests and accessible prediction panel tests.
  - `deprecation_auditor` to audit stale ML algorithm naming/API/runtime assumptions.
  - `security_reviewer` to review feature input trust boundaries, metadata/event/page data handling, prediction confidence/limitations, and native/Tauri/package impact.

## Pre-Test Guidance Handoff

- Pasteur (`planner`) started at 2026-05-25 13:09 CST.
- Averroes (`docs_researcher`) started at 2026-05-25 13:09 CST.
- Chandrasekhar (`deprecation_auditor`) started at 2026-05-25 13:09 CST.
- Hegel (`security_reviewer`) started at 2026-05-25 13:09 CST.
- All agents are read-only and must not edit files, commit, merge, or push.
- Parent next action: wait for guidance, record parent decisions, then delegate failing acceptance tests to `test_writer`.

## Pre-Test Guidance Outcomes

- Pasteur (`planner`) recommended the smallest safe slice as built-in `ml` remaining-time prediction only:
  - register `ml` in `BUILT_IN_PLUGINS`;
  - expose one inert algorithm descriptor and one executable command wrapper;
  - build features from caller-provided page/metadata/event projections, not direct Task/Timer/Tag/Habit/Stats internals;
  - use a deterministic baseline model;
  - render a prediction panel as a view and sidebar slot contribution;
  - use only ML-owned metadata/event writes.
- Averroes (`docs_researcher`) verified current official docs for Vitest, React 19, Testing Library, WAI-ARIA 1.2, Tauri v2, and Vite 7. It recommended deterministic fixed DTO fixture tests, `test.each` where useful, React Testing Library role/name queries, semantic `region`/`status`/`list` or table UI, and no package/native/Rust/Tauri changes for the TypeScript-only baseline.
- Chandrasekhar (`deprecation_auditor`) found no P0 blockers and identified P1 pre-test hazards:
  - `AlgorithmContribution` is currently an inert manifest descriptor; there is no executable AlgorithmRegistry facade to test or implement.
  - `PluginContext.metadata` and `PluginContext.events` are filtered to the current plugin owner, so ML cannot directly read Task/Timer/Tag/Habit private records through plugin facades.
- Hegel (`security_reviewer`) found no current P0/P1 blocker and required exact bounded plain DTOs, inert React text rendering, baseline/heuristic confidence wording plus limitations, static guards against raw runtime/store/native/sibling plugin imports, and no package/native/Tauri/Rust/schema/capability surface changes.

## Parent Decisions After Guidance

- Plugin id: `ml`.
- Inert algorithm descriptor id: `ml.predict-remaining-time`.
- Runtime command id: `ml.run-prediction`.
- Do not register stale aliases: `ml.predict_remaining_time`, `ml.predict_task_remaining_time`, `ml.prediction_panel`, `ml.run_prediction`, or `ml.refresh_models`.
- Do not test or implement executable AlgorithmRegistry behavior; command registry is the runtime execution entry for this slice.
- Command payload shape:

```ts
{
  algorithmId: "ml.predict-remaining-time";
  input: {
    kind: "ml.remaining-time-prediction-input";
    pageId: string;
    generatedAt: string;
    pages: PageProjection[];
    metadata: MetadataProjection[];
    events: EventProjection[];
  };
}
```

- Projections are exact caller-provided public data. ML must reject malformed, wrong-owner, forged-provenance, accessor-backed, symbol-keyed, prototype-carried, sparse/custom-array, oversized, or non-finite inputs instead of trying to read sibling private stores.
- Output/view data kind: `ml.remaining-time-prediction`.
- Output includes `algorithmId`, `modelId: "ml.remaining-time-baseline.v1"`, `pageId`, `generatedAt`, `minSeconds`, `maxSeconds`, `confidence`, bounded `features`, `reasons`, and `limitations`.
- Deterministic baseline model:
  - `baselineTotalSeconds = task estimate || similar completed task average || max(trackedSeconds * 2, 3600)`.
  - `timeRemaining = max(0, baselineTotalSeconds - trackedSeconds)`.
  - If child tasks exist, compute `childRemaining = baselineTotalSeconds * (1 - completed / total)` and use `min(timeRemaining, childRemaining)`.
  - Confidence starts at `0.35`, adds estimate/tracked/child/similar-history evidence, and is clamped to `0.90`.
  - Range spread is tied to confidence so fixed fixtures are deterministic.
- View id/type: `ml.prediction-panel`.
- Slot contribution id: `ml.page-sidebar.prediction-panel` targeting `page.sidebar.panel`.
- Metadata descriptors:
  - `ml.predictedRemainingTime` with `namespace: "ml"`, `key: "predictedRemainingTime"`, `valueType: "json"`.
  - `ml.predictionConfidence` with `namespace: "ml"`, `key: "predictionConfidence"`, `valueType: "number"`.
- Event descriptor: `ml.prediction-generated` with `namespace: "ml"` and `type: "prediction-generated"`.
- Expected production files: `src/plugins/ml/index.ts`, `src/plugins/ml/plugin.ts`, `src/plugins/ml/features/buildRemainingTimeFeatures.ts`, `src/plugins/ml/algorithms/predictRemainingTime.ts`, `src/plugins/ml/views/PredictionPanel.tsx`, and `src/bootstrap/built-in-plugins.ts`.
- Deferred: executable AlgorithmRegistry, real model training, background refresh jobs, persistent ML indexes, recommendation/best-work-time/bias/clustering/ranking, AI explanation, app-shell sidebar mounting, broad query/feed facade, direct cross-plugin private reads, Task estimate UI, Timer total metadata, native integration, sync, package changes, Rust/schema/capability changes.

## Current Next Action

- Delegate failing acceptance tests to `test_writer`.

## Test Writer Handoff

- Aristotle (`test_writer`) started at 2026-05-25 13:16 CST.
- Scope: add failing TASK-030 acceptance tests only, likely in `src/test/ml-plugin-baseline-predictions.test.tsx`.
- Required coverage:
  - built-in `ml` registration with canonical algorithm, command, view, slot, metadata, and event descriptors;
  - absence of stale underscore aliases;
  - no executable AlgorithmRegistry expectation;
  - `runtime.commands.execute("ml.run-prediction", ...)` behavior for exact bounded projection input and deterministic remaining-time result;
  - feature/model fixtures for estimate, tracked time, Timer note count, child completion, and similar-history evidence where practical;
  - hostile payload/projection rejection and no sibling private mutation/read assumptions;
  - accessible inert prediction panel rendering;
  - static guards for no Core ML business logic, no sibling plugin/private store/native/Tauri imports, no execution/rendering sinks, and no package/native/Tauri/Rust/schema/capability diffs.
- Constraints: do not edit production files, docs, progress, package/native/Tauri/Rust/schema/capability files; do not commit, merge, or push.
- Parent next action: wait for Aristotle, validate the expected red signal, and commit the test-only patch.

## Test Writer Outcome

- Aristotle (`test_writer`) added `src/test/ml-plugin-baseline-predictions.test.tsx`.
- Coverage added:
  - ML built-in registration with canonical algorithm, command, view, slot, metadata, and event descriptor ids.
  - Stale underscore id absence and explicit no executable AlgorithmRegistry reliance.
  - `ml.run-prediction` command contract through the runtime command registry.
  - Deterministic baseline prediction output, feature fixtures, ML-owned metadata/event writes only, and insufficient-data behavior.
  - Hostile/bounded payload rejection, stale command alias rejection, forged provenance handling, and no sibling private mutation assumptions.
  - Accessible inert `ml.prediction-panel` rendering.
  - Static architecture guards for Core isolation, sibling/private imports, HTML/code sinks, and native/package diffs.
- Parent red validation:
  - `bun run test:frontend -- src/test/ml-plugin-baseline-predictions.test.tsx` failed as expected with 6 failed / 1 passed.
  - Failure symptoms: missing `ml` built-in descriptors, missing `ml.run-prediction`, missing `ml.prediction-panel`, and missing `src/plugins/ml/index.ts`.
- Parent static validation passed:
  - `bun run typecheck`.
  - `./node_modules/.bin/eslint src/test/ml-plugin-baseline-predictions.test.tsx --max-warnings=0`.
  - `git diff --check`.
  - `.skip/.only` scan.
  - Production-source diff guard.
  - Package/native/Tauri/Rust/schema diff guard.
- Test commit: `17bcba4 Aristotle(test)(Implement ML Plugin baseline predictions): add ml prediction acceptance tests`; post-commit auto-push succeeded.

## Current Next Action

- Delegate minimum production implementation to `implementer`.
- Expected production scope: add built-in ML Plugin files, deterministic feature/model helpers, prediction panel view/slot contribution, `ml.run-prediction` command, and `BUILT_IN_PLUGINS` registration while keeping package/native/Tauri/Rust/schema/capability surfaces unchanged.

## Implementation Handoff

- Dewey (`implementer`) started at 2026-05-25 13:25 CST.
- Scope: production code only for the TASK-030 ML Plugin baseline.
- Expected changed files: `src/bootstrap/built-in-plugins.ts` and `src/plugins/ml/*`.
- Constraints: do not edit tests, docs, progress, package/native/Tauri/Rust/schema/capability files; do not commit, merge, or push.
- Parent next action: wait for Dewey, validate focused green checks, and commit implementation separately.

## Implementation Outcome

- Dewey (`implementer`) completed the TASK-030 production baseline.
- Changed files:
  - `src/bootstrap/built-in-plugins.ts`
  - `src/plugins/ml/index.ts`
  - `src/plugins/ml/plugin.ts`
  - `src/plugins/ml/algorithms/predictRemainingTime.ts`
  - `src/plugins/ml/features/buildRemainingTimeFeatures.ts`
  - `src/plugins/ml/views/PredictionPanel.tsx`
- Delivered:
  - Built-in `ml` registration.
  - Canonical descriptors for `ml.predict-remaining-time`, `ml.run-prediction`, `ml.prediction-panel`, `ml.page-sidebar.prediction-panel`, `ml.predictedRemainingTime`, `ml.predictionConfidence`, and `ml.prediction-generated`.
  - Deterministic remaining-time baseline prediction from exact caller-provided projections.
  - Strict bounded feature/payload validation, ML-owned metadata/event writes, and inert accessible prediction panel rendering.
  - No package/native/Tauri/Rust/schema/capability changes.
- Parent validation after implementation:
  - `bun run test:frontend -- src/test/ml-plugin-baseline-predictions.test.tsx` passed with 7 tests.
  - `bun run test:frontend -- src/test/ml-plugin-baseline-predictions.test.tsx src/test/stats-chart-plugins.test.tsx src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts src/test/core-architecture-boundary.test.ts src/test/quick-capture-search-plugins.test.tsx src/test/task-plugin-syntax-page-creation.test.ts src/test/tag-plugin-baseline.test.tsx` passed with 8 files / 152 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - Focused ESLint for `src/plugins/ml`, `src/bootstrap/built-in-plugins.ts`, and `src/test/ml-plugin-baseline-predictions.test.tsx` passed.
  - `git diff --check` passed.
  - `.skip/.only` scan found no matches.
  - Package/native/Tauri/Rust/schema diff guard was empty.
- Implementation commit: `6b0a32f Dewey(implementation)(Implement ML Plugin baseline predictions): implement ml prediction baseline`; post-commit auto-push succeeded.

## Current Next Action

- Delegate review wave:
  - `pr_explorer` for changed-path mapping.
  - `reviewer` for correctness and edge cases.
  - `deprecation_auditor` for API/deprecation/stale-pattern review.
  - `security_reviewer` for payload/projection/native-boundary review.
  - `docs_researcher` for current-doc/accessibility/view review.
  - `test_quality_reviewer` for acceptance test quality.
- Fix P0/P1 findings before docs sync and final branch gate.

## Review Wave Handoff

- Leibniz (`pr_explorer`) started at 2026-05-25 13:37 CST.
- Goodall the 2nd (`reviewer`) started at 2026-05-25 13:37 CST.
- Bernoulli the 2nd (`deprecation_auditor`) started at 2026-05-25 13:37 CST.
- McClintock the 2nd (`security_reviewer`) started at 2026-05-25 13:37 CST.
- Pascal the 2nd (`docs_researcher`) started at 2026-05-25 13:37 CST.
- Pasteur the 2nd (`test_quality_reviewer`) started at 2026-05-25 13:37 CST.
- All review agents are read-only and must not edit files, commit, merge, or push.
- Parent next action: wait for review findings, then fix P0/P1 findings before docs sync and final branch gate.

## Review Wave Outcomes

- Leibniz (`pr_explorer`) mapped changed files and found no scope drift. Changed production scope is `src/plugins/ml/**` plus `src/bootstrap/built-in-plugins.ts`; package/native/Tauri/Rust/schema/Core source surfaces are unchanged. Review surfaces are projection trust, validation complexity, non-transactional ML writes, heuristic semantics, UI wiring, and docs drift.
- Pasteur the 2nd (`test_quality_reviewer`) found three P1 test gaps:
  - baseline model fallback branches for similar-history-only and tracked-only evidence are not separately covered;
  - hostile projection coverage misses missing/archived current pages and nested metadata/event payload descriptor cases;
  - slot component rendering is not tested with the same accessibility/inert assertions as the registered view component.
- Bernoulli the 2nd (`deprecation_auditor`) found no P0/P1 blockers. It confirmed the code avoids executable AlgorithmRegistry assumptions and uses current React/Vitest/Testing Library patterns. P2/P3 docs drift remains for stale underscore ML ids, Algorithm Registry wording, generic `run-ml-prediction`, and async metadata examples.
- McClintock the 2nd (`security_reviewer`) found two P1 issues:
  - caller-forged `sourcePluginId`/`namespace`/payload provenance can be treated as trusted evidence and persisted as ML metadata/events;
  - date validation accepts finite `Date.parse` strings instead of exact instants, allowing numeric or rollover date strings.
- Pascal the 2nd (`docs_researcher`) found no P0/P1 accessibility/current-doc blockers. It listed P2 accessibility notes and formal docs/testing-strategy drift for doc sync.
- Goodall the 2nd (`reviewer`) found two P1 issues:
  - `PredictionPanel` does not validate view data before rendering, so malformed or wrong-kind data can crash render or display forged prediction data;
  - metadata JSON projection validation has per-array/depth limits but no total node budget before copying untrusted nested values.

## Parent Decisions After Review

- Required P1 fix path:
  - write review-fix tests first;
  - then delegate production fixes to `implementer`;
  - run focused and adjacent validation again before committing production fixes.
- Projection trust decision:
  - current command execution has no caller identity and no trusted cross-plugin query/feed facade;
  - therefore TASK-030 may return deterministic heuristic prediction results from caller-provided projections, but must not persist ML metadata/events from caller-provided cross-plugin projection evidence;
  - durable prediction metadata/events are deferred until a trusted projection source or reviewed query/feed facade exists.
- Test fixes should also lock:
  - similar-history-only and tracked-only fallback outputs/confidence;
  - missing/archived current page rejection;
  - nested metadata/event payload descriptor hostility;
  - exact UTC ISO instant validation;
  - `ml.prediction-panel` wrong-kind/malformed DTO fail-closed rendering;
  - slot component rendering parity with the view;
  - JSON projection total node budget or equivalent pre-copy guard.

## Current Next Action

- Delegate review-fix tests to `test_writer`.

## Review-Fix Test Handoff

- Peirce the 2nd (`test_writer`) started at 2026-05-25 13:45 CST.
- Scope: add focused P1 review-fix regression tests only, expected file `src/test/ml-plugin-baseline-predictions.test.tsx`.
- Required coverage:
  - no durable ML metadata/event persistence from caller-provided cross-plugin projections, including perfectly forged provenance;
  - similar-history-only and tracked-only fallback branches;
  - missing/archived current page and nested hostile metadata/event payload descriptor rejection;
  - exact UTC ISO instant validation;
  - over-budget nested JSON metadata rejection;
  - `ml.prediction-panel` malformed/wrong-kind DTO fail-closed rendering;
  - slot rendering parity with the registered view component.
- Constraints: do not edit production files, docs, progress, package/native/Tauri/Rust/schema/capability files; do not commit, merge, or push.
- Parent next action: wait for Peirce the 2nd, validate expected red/focused signal, and commit review-fix tests separately.

## Review-Fix Test Outcome

- Peirce the 2nd (`test_writer`) added focused P1 review-fix coverage in `src/test/ml-plugin-baseline-predictions.test.tsx`.
- Added/updated coverage:
  - no durable ML metadata/events from caller-provided Task/Timer/Tag projections, including forged matching provenance;
  - non-ML runtime state remains unchanged;
  - similar-history-only and tracked-only fallback branches;
  - missing/archived current page rejection;
  - nested metadata/event accessor, non-enumerable, prototype-carried, and over-budget JSON rejection;
  - exact UTC ISO instant validation for generated/event/timer/note dates;
  - malformed `ml.prediction-panel` DTO fail-closed behavior;
  - registered slot component rendering parity with the view.
- Parent red validation:
  - `bun run test:frontend -- src/test/ml-plugin-baseline-predictions.test.tsx` failed as expected with 5 failed / 7 passed.
  - Failure symptoms: current command still writes ML metadata/events for caller-provided projections, forged provenance still creates ML metadata, similar-history-only fallback confidence/range differs from expected policy, numeric date string `"1"` is accepted, and `PredictionPanel` renders wrong-kind forged DTO data instead of unavailable status.
- Parent static validation passed:
  - `bun run typecheck`.
  - `./node_modules/.bin/eslint src/test/ml-plugin-baseline-predictions.test.tsx --max-warnings=0`.
  - `git diff --check`.
  - `.skip/.only` scan.
  - Production/docs/progress/package/native/Tauri/Rust/schema/capability working-tree guard.
  - Native/package diff guard vs `master`.
- Test-fix commit: `927029c Peirce(test-fix)(Implement ML Plugin baseline predictions): cover ml review regressions`; post-commit auto-push succeeded.

## Current Next Action

- Delegate production review fixes to `implementer`.

## Review-Fix Implementation Handoff

- Confucius the 2nd (`implementer`) started at 2026-05-25 13:55 CST.
- Scope: production changes only for TASK-030 P1 review fixes.
- Expected changed files: `src/plugins/ml/**`.
- Required fixes: no durable ML writes from caller-provided cross-plugin projections, forged-provenance durable-write prevention, fallback branch policy alignment, exact UTC ISO date validation, PredictionPanel DTO validation/fail-closed rendering, total JSON node budget or equivalent pre-copy guard, and slot/view rendering parity.
- Constraints: do not edit tests, docs, progress, package/native/Tauri/Rust/schema/capability files; do not commit, merge, or push.
- Parent next action: wait for Confucius the 2nd, validate focused green checks, and commit review-fix implementation separately.
