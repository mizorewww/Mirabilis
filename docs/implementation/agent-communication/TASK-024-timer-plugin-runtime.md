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

## Active Pre-test Guidance Agents

- Completed on 2026-05-24 with Feynman (`planner`), Erdos (`docs_researcher`), Laplace (`deprecation_auditor`), and Wegener (`security_reviewer`).

## Pre-test Guidance

### Feynman - Planner

- Status: completed read-only planning; no files edited, staged, committed, or pushed.
- Recommended scope:
  - TASK-024 should be a TypeScript-only Timer Plugin runtime slice.
  - No native, persistence, schema, package, Rust, app-shell business wiring, Time Segment, or note-page work.
  - Timer Plugin should register `timer.start`, `timer.stop`, `timer.pause`, `timer.resume`, and `timer.switch`.
  - Use Timer events with namespace `timer` and types `started`, `paused`, `resumed`, and `stopped`.
- Recommended command behavior:
  - `timer.start({ pageId })` validates exact payload and page existence, appends `timer.started`, starts a running timer, and returns `{ activeTimer }`.
  - `timer.pause()` is valid only for a running timer, appends `timer.paused`, freezes elapsed time, and returns `{ activeTimer }`.
  - `timer.resume()` is valid only for a paused timer, appends `timer.resumed`, resumes elapsed time, and returns `{ activeTimer }`.
  - `timer.stop()` is valid for a running or paused timer, appends `timer.stopped`, clears active state, and returns `{ activeTimer: null, stoppedTimer }`.
  - `timer.switch({ pageId })` stops any previous active timer, appends `timer.stopped`, then starts the new page timer and appends `timer.started`; it does not pause the previous timer.
- State/UI guidance:
  - Represent the one global active timer with a Timer Plugin-owned registration-scoped in-memory store created inside `TimerPlugin.register(ctx)`, not a module singleton and not Core-owned state.
  - Commit store changes only after event append/transaction success.
  - Convert the existing metadata placeholder into a Timer-owned Start control in `page.header.metadata` for now because `page.header.actions` is not mounted.
  - Register `timer.global-active-bar` to `global.floating`; tests can render it through SlotRegistry with narrow command props.
- Deferred:
  - `timer.time_segment_created`, Time Segment persistence, duration aggregation metadata, `timer.total_tracked_time`, `timer.last_tracked_at`, `timer.active_segment_id`, note-page creation/editing, timeline UI, Calendar/Stats/ML integration, native storage, and schema work.

### Erdos - Docs Researcher

- Status: completed read-only current-doc/test research; no files edited, staged, committed, or pushed.
- Official docs checked:
  - React 19 testing deprecations, React `act`, `useEffect`, and `useSyncExternalStore`.
  - Testing Library queries, async APIs, fake timers, and user-event v14 setup/options.
  - Vitest fake timers/date/jsdom guidance.
- Guidance:
  - Existing TASK-023 metadata tests still assert Timer has no commands and disabled Start; TASK-024 tests should update that expectation.
  - Prefer an injected clock for command/runtime tests where practical; use Vitest fake timers for elapsed active-bar rendering.
  - With user-event and fake timers, use `userEvent.setup({ advanceTimers })`, advance interval-driven React updates inside `act`, and restore timers after each test.
  - Avoid `react-dom/test-utils`, `react-test-renderer`, Enzyme, static `userEvent.click(...)`, `delay: null`, and `jest.*` APIs.

### Laplace - API/Deprecation Auditor

- Status: completed read-only API/deprecation audit; no files edited, staged, committed, or pushed.
- P0 guardrail:
  - Do not add Timer or Task business logic under `src/core`; existing architecture-boundary tests forbid `timer` in production Core files.
- P1 guidance:
  - Reuse existing plugin APIs: `ctx.commands.register`, `ctx.transaction.run`, `tx.pages.get`, `tx.events.append/list`, and `ctx.slots.register`.
  - Do not invent `runtime.timer`, generic plugin storage, new Core Timer services, or native IPC.
  - Use canonical command IDs only: `timer.start`, `timer.stop`, `timer.pause`, `timer.resume`, and `timer.switch`.
  - Add explicit negative tests that old `timer.start_timer` and `timer.stop_timer` names are not registered.
  - Events should use `{ namespace: "timer", type: "started" | "paused" | "resumed" | "stopped" }`, not dotted event types.
  - Do not emit `timer.time_segment_created`, create note pages, or update total tracked metadata in TASK-024.
- P2/docs sync:
  - Later docs sync should update TASK-023 notes that said Timer has no commands and remove stale `timer.start_timer` / `timer.stop_timer` wording.

### Wegener - Security Reviewer

- Status: completed read-only security guidance; no files edited, staged, committed, or pushed.
- P0 constraints:
  - No new native/Tauri command/capability/package/Cargo/filesystem/path/network/eval/raw-SQL surface.
  - Timer commands must validate exact payloads before mutation.
  - `timer.start` and `timer.switch` should accept only `{ pageId: string }`; `timer.stop`, `timer.pause`, and `timer.resume` should accept no payload or an exact empty object.
  - Do not accept caller-supplied segment IDs, timestamps, namespace/type, `sourcePluginId`, duration, mode, or ownership fields.
  - Segment IDs must be generated internally.
  - Active timer state must remain Timer Plugin-owned and must not mutate Task Plugin metadata, task page attrs, Core Timer-specific state, or another plugin's private state.
  - UI must render page titles and timer labels as inert React text; no `dangerouslySetInnerHTML`, unsafe links, opener calls, raw HTML, or URL interpretation.
- Security test recommendations:
  - Reject malformed/extra payloads without changing active state/events.
  - Verify command results are small DTOs without raw event records, stores, contexts, functions, or stack/secrets.
  - Verify UI gets narrow props and no raw runtime/native/store handles.
  - Add native/package/Tauri surface guard for TASK-024.

## Parent Decisions After Pre-test Guidance

- Implement TASK-024 as a narrow TypeScript-only Timer Plugin runtime slice.
- Use the canonical command contracts and IDs from the task index:
  - `timer.start({ pageId })`.
  - `timer.stop()` / exact empty payload.
  - `timer.pause()` / exact empty payload.
  - `timer.resume()` / exact empty payload.
  - `timer.switch({ pageId })`.
- Use event namespace `timer` with types `started`, `paused`, `resumed`, and `stopped`.
- Treat `timer.switch` as "stop previous active timer, then start the next page timer" because local architecture docs only specify `stopActiveTimer(tx)` and do not define pause-on-switch.
- Represent active timer state in a Timer Plugin-owned registration-scoped in-memory store, created in `TimerPlugin.register(ctx)` and shared only with Timer command handlers and Timer-owned slot components.
- Render the one global active timer through a Timer-owned `global.floating` slot contribution, not app-shell Timer-specific code.
- Convert the current metadata placeholder into a Start control that executes `timer.start` through the scoped command executor while still receiving narrow metadata slot props.
- Defer Time Segment creation, note pages, total tracked metadata, calendar/stats integration, timeline UI, native/persistence/schema work, and release packaging to later tasks.
- Do not add Timer business logic to Core or widen public runtime handles.

## Current Next Action

## Acceptance Test Handoff

- Delegated to Leibniz (`test_writer`) on 2026-05-24 16:17 CST.
- Required scope:
  - Built-in Timer registers canonical command IDs and not stale `timer.start_timer` / `timer.stop_timer`.
  - Timer command payload validation, lifecycle events, active runtime state, pause/resume/stop/switch behavior, and no TASK-025 segment/note side effects.
  - Timer-owned `global.floating` active bar and metadata Start control through scoped command execution.
  - Boundary/security tests for narrow DTO results, inert UI rendering, no raw handles, and no native/package/Tauri surface.
- Parent thread will not write tests.

## Acceptance Tests

- Status: completed by Leibniz (`test_writer`) on 2026-05-24 16:24 CST.
- Commit: `277ba9a`.
- Files changed:
  - `src/test/timer-plugin-runtime.test.tsx`.
  - `src/test/metadata-ui-plugin.test.tsx`.
- Coverage added:
  - Canonical Timer commands `timer.start`, `timer.stop`, `timer.pause`, `timer.resume`, and `timer.switch`.
  - Stale command IDs `timer.start_timer` and `timer.stop_timer` are not registered.
  - Timer lifecycle events use namespace `timer` and types `started`, `paused`, `resumed`, and `stopped`.
  - Start, pause, resume, stop, and switch state transitions, elapsed freezing, stop-from-paused, and switch without pause.
  - Exact payload validation and dangerous caller-supplied fields rejected without mutation.
  - Narrow DTO results, internally generated `segmentId`, and no raw handles/event records.
  - No TASK-025 side effects: no `time_segment_created`, note pages, or timer metadata totals.
  - Registration-scoped active state to catch cross-runtime leakage.
  - Timer-owned `global.floating` active bar UI with inert unsafe titles, elapsed time, lifecycle controls, and metadata Start control through scoped command execution.
  - Native/package/Tauri surface guard.
- Parent validation:

```bash
bun run test:frontend -- src/test/timer-plugin-runtime.test.tsx src/test/metadata-ui-plugin.test.tsx src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts src/test/core-view-slot-registry.test.ts
bun run typecheck
bunx eslint src/test/timer-plugin-runtime.test.tsx src/test/metadata-ui-plugin.test.tsx --max-warnings=0
rg -n "\\.skip\\(|\\.only\\(" src/test/timer-plugin-runtime.test.tsx src/test/metadata-ui-plugin.test.tsx
git diff --cached --check
```

- Result: expected red signal. Focused tests ran 5 files / 120 tests with 9 failed / 111 passed. Failures were missing TASK-024 behavior: Timer commands are not registered, `timer.start` is `COMMAND_NOT_FOUND`, `timer.global-active-bar` is missing, and metadata Start is still disabled. `bun run typecheck`, focused eslint, no `.skip` / `.only`, and `git diff --cached --check` passed.

## Implementation Handoff

- Delegated to Lovelace (`implementer`) on 2026-05-24 16:26 CST.
- Required scope:
  - Minimum production code to satisfy committed TASK-024 tests.
  - Timer-owned registration-scoped in-memory active timer state.
  - Canonical Timer commands, lifecycle events, exact payload validation, and narrow DTO results.
  - Timer-owned `global.floating` active bar and `page.header.metadata` Start control.
  - No TASK-025 segment/note side effects and no native/package/Tauri/Core Timer business changes.
- Parent thread will not write implementation.

## Initial Implementation

- Status: completed by Lovelace (`implementer`) on 2026-05-24 16:55 CST.
- Commit: `4a7d34b`.
- Files changed:
  - `src/plugins/timer/plugin.ts`.
  - `src/plugins/timer/components/TimerMetadataPlaceholder.tsx`.
- Behavior implemented:
  - Registered canonical Timer commands: `timer.start`, `timer.stop`, `timer.pause`, `timer.resume`, and `timer.switch`.
  - Added Timer-owned registration-scoped active timer state.
  - Added lifecycle events with namespace `timer` and types `started`, `paused`, `resumed`, and `stopped`.
  - Added exact payload validation and narrow JSON DTO command results.
  - Enabled metadata Start control through scoped `timer.start`.
  - Added Timer-owned `timer.global-active-bar` on `global.floating`.
- Parent validation:

```bash
bun run test:frontend -- src/test/timer-plugin-runtime.test.tsx src/test/metadata-ui-plugin.test.tsx src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts src/test/core-view-slot-registry.test.ts
bun run test:frontend -- src/test/core-architecture-boundary.test.ts
bun run typecheck
bun run lint
git diff --check
git diff --name-only master -- package.json bun.lock src-tauri/Cargo.lock src-tauri/Cargo.toml src-tauri/build.rs src-tauri/capabilities src-tauri/permissions src-tauri/src/commands src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tauri.conf.json
```

- Result: all passed or clean. Focused Timer and adjacent plugin tests passed with 5 files / 120 tests. Architecture-boundary focused test passed with 1 file / 1 test. `bun run typecheck`, `bun run lint`, and `git diff --check` passed. Native/package/Tauri surface diff was empty.
- Remaining risk from implementer:
  - Active-bar elapsed UI is intentionally minimal for TASK-024; richer live ticking/polish can be handled in a later Timer UI slice.

## Current Next Action

- Spawn focused review agents.
