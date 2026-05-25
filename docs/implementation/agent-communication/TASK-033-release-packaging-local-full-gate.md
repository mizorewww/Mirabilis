# TASK-033 Agent Communication - Release Packaging And Local Full Gate

## Task

- ID: TASK-033.
- Name: Add release packaging and local full gate.
- Branch: `feat/task-033-release-packaging-local-full-gate`.
- Started: 2026-05-25 21:03 CST.
- Parent role: orchestration only. Parent delegates planning, current-doc research, deprecation/security review, test writing, implementation, docs sync, and release readiness review to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-033-add-release-packaging-and-local-full-gate`.
- `docs/testing/strategy.md`.
- `docs/development/02-implementation-roadmap-and-constraints.md#21-最终代码架构总结`.
- Current `package.json` scripts.
- Current `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.

## Initial Parent Interpretation

- TASK-033 should finish the local release gate for the current project phase.
- Acceptance criteria require:
  - `bun run check:full` runs quick checks and Tauri build;
  - packaging changes are documented;
  - `release_checker` can verify local readiness without GitHub CI;
  - version/changelog expectations are clear.
- Current `package.json` already defines `check:full` as `bun run check:quick && bun run tauri build`.
- Current Tauri config bundles `targets = "all"`, and an earlier TASK-014 full-gate exploration found local AppImage bundling failures in the Arch environment. Agents must determine whether TASK-033 should change local full-gate behavior, Tauri bundle configuration, docs, release-checker procedure, or a combination.
- The parent will not write tests, implementation, review findings, release readiness assessment, or formal docs sync unless a delegated agent fails or is explicitly cancelled and the fallback reason is recorded.

## Validation At Start

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/WebSocket/reachability OK with known non-blocking notes: unrestricted sandbox/network and `TERM=dumb` terminal failure.
- `master` was up to date with `origin/master` before branching.

## Parent Decisions

- Start from `master` commit `dfe0e91`, after TASK-032 merge validation.
- Use branch `feat/task-033-release-packaging-local-full-gate`.
- Delegate pre-test planning/current-doc guidance, deprecation/API audit, and security review before writing tests because TASK-033 touches Tauri release packaging and local full-gate behavior.
- Keep all agent recommendations, parent decisions, blockers, checks, and release-readiness outcomes in this file and `docs/implementation/agent-communication/status.md`.

## Current Next Action

- Delegate pre-test guidance:
  - `planner` to define the smallest safe TASK-033 slice, acceptance criteria, expected files, local gate semantics, release readiness workflow, and deferred scope.
  - `docs_researcher` to verify current Tauri v2 build/bundle guidance and any Bun/Vite/release docs needed for a local `check:full`.
  - `deprecation_auditor` to audit stale packaging assumptions, scripts, bundle targets, CLI flags, version/changelog conventions, and known local AppImage failure context.
  - `security_reviewer` to define release/build security constraints around bundle targets, capabilities, signing/updater absence, filesystem/network permissions, and artifact leakage.

## Pre-Test Guidance Handoff

- Boole (`planner`) started at 2026-05-25 21:04 CST.
- Mendel (`docs_researcher`) started at 2026-05-25 21:04 CST.
- Parfit (`deprecation_auditor`) started at 2026-05-25 21:04 CST.
- Descartes (`security_reviewer`) started at 2026-05-25 21:04 CST.
- All agents are read-only and must not edit files, commit, merge, or push.
- Parent next action: wait for guidance, record parent decisions, then delegate failing tests or a release-gate validation plan as appropriate.
