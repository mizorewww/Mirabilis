# TASK-026 Agent Communication - Calendar Plugin Baseline

## Task

- ID: TASK-026.
- Name: Implement Calendar Plugin baseline.
- Branch: `feat/task-026-calendar-plugin-baseline`.
- Started: 2026-05-25 08:39 CST.
- Parent role: orchestration only. Parent delegates planning, docs research, test writing, implementation, review, and docs sync to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-026-implement-calendar-plugin-baseline`.
- `docs/product/05-built-in-plugins.md#19-calendar-plugin`.
- `docs/development/02-implementation-roadmap-and-constraints.md#phase-6calendar-plugin`.
- `docs/development/01-data-roadmap-and-mvp.md#phase-6calendar-plugin`.
- Related Calendar, Time Segment, view slot, and testing references in product, architecture, development, and testing docs.

## Initial Parent Interpretation

- Build on TASK-025 Timer-owned `time_segment_created` events and `time_segment_note_added` links.
- Implement a built-in Calendar Plugin baseline that registers day and week views.
- Calendar views should render Timer-owned Time Segment events as calendar blocks.
- Clicking a calendar block should open segment detail through a plugin-owned command/view path.
- Manual time segment creation must be implemented narrowly or explicitly deferred with a follow-up task based on agent guidance.
- Keep Core business behavior, native/Tauri/package/Rust/schema changes, persistent calendar storage, broad app-shell calendar navigation, Calendar drag/drop, Timer metadata totals, Stats/ML aggregation, Habit/Heatmap behavior, recurring events, external calendar sync, and release packaging out of scope unless agents identify an acceptance-critical dependency.

## Validation At Start

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK; non-blocking notes were unrestricted sandbox/network and the known `TERM=dumb` terminal failure.

## Parent Decisions

- Start from `master` commit `520d280`, after TASK-025 merge validation.
- Use branch `feat/task-026-calendar-plugin-baseline`.
- Delegate pre-test planning/current-doc guidance, deprecation/API review, and security review before writing tests because TASK-026 touches React/Vitest plugin views, Calendar/Timer integration, command/view/slot boundaries, and may require current Testing Library guidance.
- Parent thread will not write TASK-026 tests, production implementation, review findings, or formal docs sync unless a delegated agent fails or is explicitly cancelled and the fallback reason is recorded.

## Current Next Action

- Spawn pre-test guidance agents:
  - `planner` for smallest safe TASK-026 scope, acceptance criteria, risks, and TDD handoff.
  - `docs_researcher` for current React/Vitest/Testing Library and any relevant view/calendar guidance.
  - `deprecation_auditor` for canonical command/view/event IDs and stale API risks.
  - `security_reviewer` for Timer event trust boundaries, inert rendering, command payloads, and native/Tauri/package/Rust/schema guardrails.
