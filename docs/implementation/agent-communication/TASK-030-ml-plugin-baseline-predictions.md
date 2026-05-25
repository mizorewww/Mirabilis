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
