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

## Pre-Test Agent Handoff

- Pauli (`planner`) started 2026-05-25 08:41 CST to define the smallest safe TASK-026 scope, acceptance criteria, risks, and TDD handoff.
- Turing (`docs_researcher`) started 2026-05-25 08:41 CST to check current React/Vitest/Testing Library guidance for Calendar view tests.
- Cicero (`deprecation_auditor`) started 2026-05-25 08:41 CST to audit canonical Calendar identifiers and stale API risks.
- Gauss (`security_reviewer`) started 2026-05-25 08:41 CST to review Calendar/Timer event trust boundaries, inert rendering, command payloads, and native/Tauri/package/Rust/schema guardrails.

## Current Next Action

## Pre-Test Guidance Outcomes

- Pauli (`planner`) completed read-only planning. Recommendation: implement the smallest Calendar consumption slice: built-in `CalendarPlugin`, day/week views, Timer-owned Time Segment blocks, a Calendar-owned open-detail command, and explicit manual segment creation deferral. Canonical ids: plugin `calendar`, views `calendar.day` and `calendar.week`, command `calendar.open-time-segment`; do not implement snake_case command ids or `calendar.month` in this slice. Slot ids are not required.
- Turing (`docs_researcher`) completed read-only current-doc/test guidance. Recommendation: add focused `src/test/calendar-plugin-baseline.test.tsx`, render registered view components from `runtime.registries.views`, use semantic regions and native buttons, avoid ARIA grid unless implementing full grid behavior, use deterministic UTC ISO instants with `Z`, inject explicit date/week/timeZone props, use Testing Library/user-event, and avoid deprecated React test APIs.
- Cicero (`deprecation_auditor`) completed read-only API audit. P1 guidance: Calendar cannot read Timer-owned events through `CalendarPlugin`'s `ctx.events.list(...)` because Plugin Host filters plugin-facing event reads to `sourcePluginId === pluginId`. TASK-026 must either pass normalized segment DTOs into Calendar views or explicitly defer a missing cross-plugin query/read facade. It should use hyphenated command ids, treat product-doc snake_case Calendar commands as stale/future wording, and defer manual segment creation to a future Timer-owned command such as `timer.create-manual-segment`.
- Gauss (`security_reviewer`) completed read-only security guidance. P0/P1 constraints: Calendar must not import Timer internals, raw runtime stores, Plugin Host, NativeBridge/Tauri, or mutate/forge Timer-owned events; Calendar UI must render inert React text only; detail/manual command payloads must be exact and fail closed; Timer segment/note inputs must be parsed as untrusted data; wrong-owner/malformed/cross-page/cross-date events and note links must be ignored; native/Tauri/package/Rust/schema/capability changes remain out of scope.

## Parent Decisions After Guidance

- TASK-026 current scope is a Calendar Plugin view baseline over normalized segment DTOs, not a new cross-plugin event query API.
- Calendar views use `calendar.day` and `calendar.week` and accept a data shape such as `{ kind: "calendar.time-segments" }`; tests and implementation may refine prop names, but data must be explicit normalized DTOs rather than Calendar directly reading Timer private state.
- `calendar.open-time-segment({ segmentId, pageId })` is the canonical current command. It is read-only and returns/opens detail state; snake_case aliases are absent.
- Clicking a block should execute the Calendar-owned command through the command registry and render an accessible in-view detail region with inert text.
- Manual segment creation is explicitly deferred for TASK-026. Do not register `calendar.create-manual-segment`, `calendar.edit-time-block`, or snake_case aliases. Future work should define a Timer-owned manual segment command or a controlled cross-plugin read/write contract.
- Calendar must not import Timer plugin internals or append `namespace: "timer"` events. A later task may add a reviewed cross-plugin query/read facade or Timer-owned manual command.
- Keep native/Tauri/package/Rust/schema changes, `calendar.month`, drag/drop, app-shell route mounting, Timer metadata totals, Stats/ML/Habit/Task scheduled feeds, external calendar sync, and release packaging deferred.

## Test Writer Handoff

- Next agent: `test_writer`.
- Required red tests:
  - Built-ins include `calendar`; it registers `calendar.day` and `calendar.week`, and does not register `calendar.month`.
  - It registers `calendar.open-time-segment`; snake_case `calendar.open_time_segment`, `calendar.create_manual_segment`, `calendar.edit_time_block`, plus hyphenated create/edit commands are absent.
  - Day view renders normalized Timer segment DTOs as accessible native buttons inside a `Calendar day` region, using inert text for page titles/note/detail fields and deterministic UTC time display.
  - Week view renders normalized segments across the selected week, groups/orders by day/start time, and ignores out-of-week segments.
  - Views ignore malformed/wrong-owner/wrong-namespace/wrong-source/missing-page/page-mismatch/invalid-date/end-before-start/extra-field segment DTOs if the test shape carries event provenance, or equivalent invalid normalized inputs if test_writer chooses a stricter DTO shape.
  - Clicking a block executes `calendar.open-time-segment({ segmentId, pageId })` through command registry behavior and shows an accessible detail region.
  - Detail note text renders inertly and ignores wrong-owner/malformed/cross-page/cross-segment/missing note links when note DTO/link data is included.
  - `calendar.open-time-segment` rejects unknown, malformed, extra-field, accessor/symbol/non-enumerable, blank/non-string id, wrong-owner, or malformed payloads without opening detail or mutating stores.
  - Static boundary/native guard: no Timer internals, raw runtime/store/registry/pluginHost/NativeBridge/Tauri/html-injection imports/usage, and no package/native/Tauri/Rust/schema diff.

## Current Next Action

## Test Writer Handoff

- Kant (`test_writer`) started 2026-05-25 08:54 CST.
- Scope: failing tests only, no production code or docs.
- Required coverage:
  - Built-in Calendar Plugin registration plus `calendar.day`, `calendar.week`, and `calendar.open-time-segment`.
  - Absence of `calendar.month`, snake_case Calendar commands, manual segment create/edit commands, and manual segment UI in this baseline.
  - Day/week view rendering from explicit normalized Timer segment DTO input, not direct Calendar reads of Timer-owned events through `ctx.events.list`.
  - Accessible `Calendar day` / `Calendar week` regions and native calendar block buttons with deterministic UTC time display.
  - Inert text rendering for unsafe page/title/note/detail content.
  - Filtering for malformed/untrusted segment DTOs or event-provenance inputs.
  - Clicking a block opens an accessible detail region through `calendar.open-time-segment({ segmentId, pageId })`.
  - Direct command payload hardening and no store mutation on invalid input.
  - Static boundary/native guards for no Timer internals, raw runtime/store/registry/pluginHost/NativeBridge/Tauri/html-injection imports/usage and no package/native/Tauri/Rust/schema diff.
  - Optional Timer/calendar integration-style test may transform public Timer event records to normalized DTOs in the test harness, without expecting CalendarPlugin to read Timer events itself.
- Expected red signal: Calendar Plugin surfaces do not exist yet.

## Current Next Action

- Kant (`test_writer`) completed failing acceptance tests in `src/test/calendar-plugin-baseline.test.tsx`.
- Parent validation of Kant's tests:
  - `bun run test:frontend -- src/test/calendar-plugin-baseline.test.tsx` produced the expected red signal: 8 tests failed because Calendar Plugin built-in registration, `calendar.day`, `calendar.week`, `calendar.open-time-segment`, and `src/plugins/calendar/*` production sources are not implemented yet.
  - `bun run typecheck` passed.
  - `./node_modules/.bin/eslint src/test/calendar-plugin-baseline.test.tsx --max-warnings=0` passed.
  - `rg -n "\\.(skip|only)\\(" src/test/calendar-plugin-baseline.test.tsx` returned no matches.
  - `git diff --check` passed.
  - Native/package/Tauri guard from `master` was empty.
- Commit: `acd2648` (`Kant(test)(Implement Calendar Plugin baseline): add calendar baseline acceptance tests`).

## Current Next Action

- Huygens (`implementer`) started 2026-05-25 08:56 CST.
- Scope: minimum production implementation only; no test edits, docs/progress edits, commits, pushes, branch changes, or native/Tauri/package/Rust/schema changes.
- Required checks: focused Calendar test, `bun run typecheck`, `bun run lint` if green, `git diff --check`, and native/package/Tauri guard.

## Current Next Action

- Huygens (`implementer`) completed the initial TASK-026 production implementation in:
  - `src/bootstrap/built-in-plugins.ts`
  - `src/plugins/calendar/index.ts`
  - `src/plugins/calendar/plugin.ts`
- Implementation summary: registered built-in `calendar`, `calendar.day`, `calendar.week`, and `calendar.open-time-segment`; rendered explicit normalized Timer segment DTOs as UTC day/week calendar blocks; added in-view inert detail rendering; kept manual creation/editing, `calendar.month`, snake_case aliases, cross-plugin event queries, and native/package/Rust/Tauri/schema changes out of scope.
- Parent validation:
  - `bun run test:frontend -- src/test/calendar-plugin-baseline.test.tsx` passed with 1 file / 8 tests.
  - `bun run test:frontend -- src/test/calendar-plugin-baseline.test.tsx src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts src/test/core-architecture-boundary.test.ts` passed with 4 files / 86 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - Native/package/Tauri guard from `master` was empty.
- Commit: `fd65d37` (`Huygens(implementation)(Implement Calendar Plugin baseline): implement calendar views and open command`).

## Current Next Action

- Focused review started 2026-05-25 09:06 CST.
- Active read-only review agents:
  - Boole (`pr_explorer`) maps changed files, behavior, coverage, and risks.
  - Linnaeus (`reviewer`) reviews correctness and behavior regressions.
  - Curie (`security_reviewer`) reviews plugin boundaries, payload hardening, inert rendering, and native/package/Tauri/Rust/schema surfaces.
  - Peirce (`deprecation_auditor`) audits canonical ids, stale APIs, and React/plugin API usage.
  - Faraday (`docs_researcher`) checks current docs guidance and docs-sync obligations.
- Pending due to active-agent limit: `test_quality_reviewer` and `doc_writer`; parent will spawn them after one active review slot frees.

## Current Next Action

- Focused review partial outcomes:
  - Boole (`pr_explorer`) mapped changed files and coverage. It confirmed no native/package/Tauri/Rust/schema changes and flagged module-level `knownSegmentCounts`, loose date parsing, duration mismatch, cross-midnight behavior, and stale formal docs for attention.
  - Linnaeus (`reviewer`) found P1: `calendar.open-time-segment` uses module-global known segment state, allowing command validity to leak across runtimes/views. It also found P2 stale detail after data/date/week changes and P2 non-UTC date parsing.
  - Curie (`security_reviewer`) found P1: non-enumerable allowed DTO/command fields are accepted instead of failing closed. It also found P2 strict UTC/duration validation gaps and P3 module-scoped visibility state.
  - Peirce (`deprecation_auditor`) found no deprecated React/API blockers. It noted module-global command state as a P2 API contract risk, exported `note`/`detail` DTO docs needs, and a P3 fake-timer cleanup suggestion.
  - Faraday (`docs_researcher`) found no current-doc blockers; it confirmed React/RTL/user-event/named-region/native-button/no-grid direction and listed formal docs sync obligations.
- Parent decision: treat the two P1 findings as blockers and enter review-fix TDD:
  - Add a two-runtime/unmount regression for `calendar.open-time-segment` command validity not leaking across runtime/view instances.
  - Add non-enumerable required/optional segment, provenance, and command-field regressions so Calendar fails closed on non-enumerable own fields, not only non-enumerable extra fields.
  - Leave strict UTC/duration and stale detail as P2 follow-ups unless the review-fix agent can cover them without broadening the fix.

## Current Next Action

- Popper (`test_quality_reviewer`) found P1: existing tests missed segments that overlap a selected day/week but start outside that range, while production filtered solely by start time. It also listed P2/P3 follow-ups for DTO hardening parity, static boundary guard brittleness, command-failure UI coverage, and docs/process coverage for manual segment deferral.
- Banach (`test_writer`) added review-fix regression tests in `src/test/calendar-plugin-baseline.test.tsx` for:
  - Cross-runtime `calendar.open-time-segment` validity leakage and unmount clearing.
  - Non-enumerable required segment fields, provenance fields, optional note/detail fields, and command fields.
  - Day/week segments that overlap the selected range while starting before it.
- Parent red validation:
  - `bun run test:frontend -- src/test/calendar-plugin-baseline.test.tsx` produced the expected red signal: 13 tests, 6 failed and 7 passed.
  - `bun run typecheck` passed.
  - `./node_modules/.bin/eslint src/test/calendar-plugin-baseline.test.tsx --max-warnings=0` passed.
  - `rg -n "\\.(skip|only)\\(" src/test/calendar-plugin-baseline.test.tsx` returned no matches.
  - `git diff --check` passed.
- Commit: `dd41b35` (`Banach(test-fix)(Implement Calendar Plugin baseline): add calendar review regression tests`).

## Current Next Action

- Spawn `implementer` for review-fix production changes, then validate focused Calendar tests and adjacent checks.
