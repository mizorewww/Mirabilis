# TASK-029 Agent Communication - Quick Capture and Search Plugins

## Task

- ID: TASK-029.
- Name: Implement Quick Capture and Search plugins.
- Branch: `feat/task-029-quick-capture-search-plugins`.
- Started: 2026-05-25 12:03 CST.
- Parent role: orchestration only. Parent delegates planning, docs research, test writing, implementation, review, and docs sync to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-029-implement-quick-capture-and-search-plugins`.
- `docs/product/05-built-in-plugins.md#24-quick-capture-plugin`.
- `docs/product/03-plugin-platform.md`.
- `docs/product/06-view-slots.md`.
- `docs/development/01-data-roadmap-and-mvp.md#30-最终系统形态`.
- `docs/development/02-implementation-roadmap-and-constraints.md#20-5-所有高级能力都注册为-plugin`.
- `docs/architecture/01-overview-and-monorepo.md`.
- `docs/architecture/07-runtime-flows.md`.
- `docs/testing/strategy.md`.

## Initial Parent Interpretation

- Implement built-in Quick Capture and Search plugin baselines.
- Quick Capture should create or append to an Inbox page.
- Captured Markdown may include existing Task and Tag syntax; the baseline should preserve that Markdown so existing Task/Tag processing can handle it through current plugin-owned paths.
- Search should query page titles and body text at baseline.
- Desktop entry points must be documented and security-reviewed for Tauri permission impact.
- Keep Core free of Quick Capture and Search business behavior.
- Keep native/Tauri/package/Rust/schema changes, persistent indexes, background workers, global shortcuts, app-shell route polish, rich mobile toolbar mounting, ML/AI cleanup commands, sync, packaging, and full-text engine adoption out of scope unless agents identify an acceptance-critical blocker.

## Validation At Start

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK; non-blocking notes were unrestricted sandbox/network and the known `TERM=dumb` terminal failure.

## Parent Decisions

- Start from `master` commit `5f1f04b`, after TASK-028 merge validation.
- Use branch `feat/task-029-quick-capture-search-plugins`.
- Delegate pre-test planning/current-doc guidance, deprecation/API review, and security review before writing tests because TASK-029 touches React/Vitest plugin views, command payloads, page creation/update behavior, search indexing/query semantics, and possible desktop/Tauri entry-point decisions.
- Parent thread will not write TASK-029 tests, production implementation, review findings, or formal docs sync unless a delegated agent fails or is explicitly cancelled and the fallback reason is recorded.

## Current Next Action

- Delegate pre-test guidance:
  - `planner` to define the smallest safe TASK-029 slice, canonical ids, acceptance criteria, and deferred scope.
  - `docs_researcher` to check current React/Vitest/Testing Library and Tauri v2 guidance for capture/search tests and desktop entry-point review.
  - `deprecation_auditor` to audit naming/API/deprecation/stale-doc risks.
  - `security_reviewer` to review capture input, page append/create trust boundaries, search query/index boundaries, and native/Tauri permission impact.

## Pre-Test Guidance Handoff

- Gibbs (`planner`) started at 2026-05-25 12:05 CST.
- Franklin (`docs_researcher`) started at 2026-05-25 12:05 CST.
- Hilbert (`deprecation_auditor`) started at 2026-05-25 12:05 CST.
- Newton (`security_reviewer`) started at 2026-05-25 12:05 CST.
- All agents are read-only and must not edit files, commit, merge, or push.
- Parent next action: wait for guidance, record parent decisions, then delegate failing acceptance tests to `test_writer`.
