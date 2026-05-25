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
