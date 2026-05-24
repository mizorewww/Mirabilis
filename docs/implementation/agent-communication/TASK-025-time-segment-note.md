# TASK-025 Agent Communication - Time Segment and Time Segment Note

## Task

- ID: TASK-025.
- Name: Implement Time Segment and Time Segment Note.
- Branch: `feat/task-025-time-segment-note`.
- Started: 2026-05-24 18:56 CST.
- Parent role: orchestration only. Parent delegates planning, docs research, test writing, implementation, review, and docs sync to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-025-implement-time-segment-and-time-segment-note`.
- `docs/product/05-built-in-plugins.md#183-time-segment`.
- `docs/product/04-editor-and-workflows.md#264-计时`.
- `docs/product/06-view-slots.md`.
- `docs/architecture/05-plugin-implementations.md#114-time-segment-and-note-future`.
- `docs/architecture/07-runtime-flows.md#188-用户-stop-并写-note`.
- `docs/development/01-data-roadmap-and-mvp.md#phase-5timer-plugin`.
- `docs/development/02-implementation-roadmap-and-constraints.md#phase-5timer-plugin`.
- `docs/testing/strategy.md`.

## Initial Parent Interpretation

- Build on TASK-024 Timer Plugin runtime commands and active timer state.
- Stopping a timer should append `timer.stopped` and create a `timer.time_segment_created` event with start, end, duration, page id, source, and optional note page id.
- Time Segment Note must remain a Markdown Page.
- Task page timeline should be plugin-owned slot/view behavior, not Core business behavior.
- Keep Calendar/Stats/ML integration, native/Tauri/package/Rust/schema changes, persistent storage rewiring, broader app-shell/editor mounting, Recently Worked / Unnoted Sessions filters, manual segment editing, calendar drag/drop, and broad metadata totals out of scope unless agents find an acceptance-critical narrow slice.

## Validation At Start

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK; non-blocking notes were unrestricted sandbox/network and the known `TERM=dumb` terminal failure.

## Parent Decisions

- Start from `master` commit `22402e2`, after TASK-024 merge validation.
- Use branch `feat/task-025-time-segment-note`.
- Delegate pre-test planning/current-doc guidance, deprecation/API review, and security review before writing tests because TASK-025 touches React/Vitest/plugin runtime behavior and may touch Markdown page creation contracts.
- Parent thread will not write TASK-025 tests, production implementation, review findings, or formal docs sync unless a delegated agent fails or is explicitly cancelled and the fallback reason is recorded.

## Current Next Action

- Spawn planner, docs_researcher, deprecation_auditor, and security_reviewer for TASK-025 pre-test guidance.
