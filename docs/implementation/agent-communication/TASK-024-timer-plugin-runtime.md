# TASK-024 Agent Communication - Timer Plugin Runtime

## Task

- Task ID: TASK-024.
- Task name: Implement Timer Plugin start/stop/pause/resume/switch.
- Branch: `feat/task-024-timer-plugin-runtime`.
- Parent role: orchestration only.
- Started: 2026-05-24 16:05 CST.

## Source Docs Read By Parent

- `.codex/skills/mirabilis-dev-runner/SKILL.md`.
- `docs/implementation/progress.md`.
- `docs/implementation/task-index.md#task-024-implement-timer-plugin-startstoppauseresumeswitch`.
- `docs/product/05-built-in-plugins.md#18-timer-plugin`.
- `docs/architecture/05-plugin-implementations.md#11-timer-plugin-代码架构`.
- `docs/architecture/07-runtime-flows.md#187-用户点击-start`.
- `docs/development/01-data-roadmap-and-mvp.md#phase-5timer-plugin`.
- `docs/development/02-implementation-roadmap-and-constraints.md#phase-5timer-plugin`.
- Related Timer references in `docs/product/04-editor-and-workflows.md` and `docs/product/06-view-slots.md`.

## Initial Scope

- Implement the first Timer Plugin runtime slice after Metadata UI.
- Acceptance criteria:
  - Timer Plugin registers `timer.start`, `timer.stop`, `timer.pause`, `timer.resume`, and `timer.switch`.
  - One global active timer is visible.
  - Starting a timer associates it with a page/task.
  - Switching timers closes or pauses the previous active timer according to documented behavior.
- Test plan from task index:
  - Timer Plugin unit/integration tests for state transitions.
  - UI tests for active timer bar.

## Initial Out Of Scope

- TASK-025 Time Segment persistence and note-page creation unless agents identify a TASK-024 acceptance dependency.
- Calendar, Stats, ML, AI, Sync, Search, or release behavior.
- Native/Tauri/package, filesystem, IPC, permissions, Cargo, or persistence-schema changes.
- Direct mutation of Task Plugin private state.
- Broad app-shell navigation or timeline UI beyond one global active timer surface.

## Known Risks For Agents

- Local docs describe long-term Timer behavior broadly, while TASK-024 is a narrower runtime/commands/global-active-bar slice.
- Stop/Time Segment docs overlap with TASK-025; agents must decide whether TASK-024 should append only timer lifecycle events or defer segment creation fully.
- Switch behavior is under-specified in local docs beyond "closes or pauses previous active timer according to documented behavior"; planner/docs agents should pin a narrow interpretation before tests.
- Timer must remain plugin-owned and communicate through Command Registry, Event, Metadata, Query, or registered slots/views.
- Core must not gain Timer-specific business behavior.

## Parent Start Decision

- Select TASK-024 because it is the first unblocked `[ ]` task after TASK-023 completed and merged.
- Start from `master` after TASK-023 merge validation commit `d711b15`.
- Use branch `feat/task-024-timer-plugin-runtime`.
- Delegate planning, current-doc guidance, deprecation/API review, security review, tests, implementation, review, and docs sync to agents.

## Agent/Config Validation

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK.
- Non-blocking notes: unrestricted sandbox/network and the known `TERM=dumb` terminal failure.

## Current Next Action

- Spawn pre-test guidance agents.
