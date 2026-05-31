# TASK-039 Agent Communication - Mount Metadata, Timer, And Timeline Slots

## Task

- ID: TASK-039.
- Name: Mount Metadata, Timer, And Timeline Slots.
- Branch: `feat/task-039-metadata-timer-timeline-slots`.
- Started: 2026-05-26 07:07 CST.
- Parent role: orchestration only. Parent delegates planning, docs/current API research, TDD tests, implementation, review, docs sync, and release readiness to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-039-mount-metadata-timer-and-timeline-slots`.
- `docs/product/07-user-interface-design.md`.
- `docs/product/05-built-in-plugins.md`.
- `docs/product/06-view-slots.md`.
- `docs/architecture/04-slots-editor-task.md`.
- `docs/architecture/07-runtime-flows.md`.
- `docs/testing/strategy.md`.
- Current TASK-038 Drawer/page/filter navigation closeout.

## Initial Parent Interpretation

- TASK-039 mounts the first non-editor slot surfaces in the user-visible MUI app shell.
- The current page header should expose metadata slot UI for Task, Tag, and Timer contributions without importing those business plugin components directly into App Shell.
- The current page body/workspace area should expose the `page.timeline` slot for Timer segment and note UI.
- The app shell should mount `global.floating` through a trusted Portal/floating surface for the active timer bar.
- All plugin-facing props must be page-scoped, controlled, and free of raw runtime, Core stores, registries, Plugin Host, NativeBridge, filesystem, path, SQL, tokens, provider settings, or unrelated page data.

## Initial Constraints

- Write failing tests first.
- Tests must use React Testing Library and `@testing-library/user-event` for real typing/clicking/keyboard interactions, including tag add/remove, timer Start/Pause/Resume/Stop, floating bar controls, and timeline note Add/Edit/Save.
- App Shell must not directly import Timer, Task, Tag, or metadata business-plugin private implementations.
- Plugin controls must mutate only through Command Registry or documented owner-scoped command facades.
- Empty, unavailable, pending, and plugin-failure states must be visible, accessible, and redacted.
- No package, lockfile, Tauri config, capability, generated permission, Rust, IPC, filesystem, persistence schema, release, Timer totals, Recently Worked, Unnoted Sessions, manual segment editing, Calendar/Stats feed, or native changes are in scope.

## Validation At Start

- 11 `.codex/agents/*.toml` files parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/network/websocket OK with known non-blocking unrestricted sandbox/network notes and known `TERM=dumb` terminal failure.
- `master` was clean and up to date before the branch was created.

## Current Next Action

- Run post-implementation review agents for correctness, security, deprecation, docs sync, test quality, and changed-path exploration.

## Pre-Test Guidance Outcomes

- Averroes the 2nd (`planner`) recommended the smallest TASK-039 slice:
  - mount a page-route-only metadata header below the workspace title and above the editor;
  - use `MetadataBar` for `page.header.metadata` because it already enforces active Plugin Host ownership, trusted field/value projection, and owner-scoped command execution;
  - mount page-route-only `page.timeline` below the editor through `SlotHost`, passing only `{ page: { id, title } }`;
  - mount `global.floating` near the app shell root through MUI `Portal`, with a floating wrapper and a timer-owner-scoped command facade;
  - defer `page.header.actions`, `page.sidebar.panel`, `page.body.after`, command palette, search, capture, Calendar/Reports, ML/AI, Settings/Sync, Timer totals, Recently Worked, Unnoted Sessions, manual segment editing, Calendar/Stats feed, native persistence, schema, package, and Tauri/Rust changes.
- Russell the 2nd (`docs_researcher`) verified current official docs for MUI v9.0.1 path imports, `Portal`, React `createPortal`, React error-boundary guidance, Testing Library/user-event role/name and fake-timer guidance, and Vitest fake timers. Recommendations:
  - use MUI path imports such as `@mui/material/Portal`;
  - query portal content with `screen`;
  - use `userEvent.setup({ advanceTimers })` with fake timers;
  - avoid Suspense/data-loading expansion and legacy/deprecated MUI/React APIs;
  - `check:full` is not required if TASK-039 remains TypeScript/React/MUI shell integration only.
- Leibniz the 2nd (`security_reviewer`) required:
  - `page.header.metadata` and `page.timeline` mount only for active page routes, not saved-filter or placeholder routes;
  - page-scoped slots receive minimal controlled page props and never raw page body, full metadata/events arrays, runtime, stores, registries, Plugin Host, NativeBridge, filesystem, SQL, paths, tokens, or provider settings;
  - `global.floating` must not receive page props or raw `runtime.commands`;
  - floating timer controls need a timer-owner-scoped command facade or equivalent host-owned callbacks for only `timer.pause`, `timer.resume`, and `timer.stop` with exact `{}` payloads;
  - stale route switches, wrong-page tag command results, wrong-owner timeline notes, inactive/missing plugin ownership, and thrown slot contributions must fail closed and remain redacted.
- Mencius the 2nd (`deprecation_auditor`) found no P0/P1 API blocker, but highlighted two test-design hazards:
  - do not mount `MetadataBar` raw without a failure boundary;
  - do not use generic `SlotHost` for `page.header.metadata` because it would lose MetadataBar-specific owner/value/command narrowing.

## Parent Decisions

- Use `MetadataBar` for `page.header.metadata`, wrapped by an app-shell failure boundary if production mounting does not already isolate it.
- Use `SlotHost` for `page.timeline` with the narrow page DTO only.
- Use MUI `Portal` for `global.floating`; do not widen generic `SlotHost` to pass raw command objects. Require tests for a timer-scoped facade or host-owned callback path before implementation.
- Allow at most a narrow public `metadata-ui` import path if implementation needs `MetadataBar`; keep direct App Shell imports from Task, Tag, Timer, raw Tauri/native, and plugin-private subpaths forbidden.
- Require red tests first for real user interactions: tag add/remove typing/clicking, timer start/pause/resume/stop, active floating bar, timeline add/edit note typing/saving, route/page scoping, failure/redaction states, owner command boundaries, and no native/package drift.

## TDD And Implementation Outcomes

- Linnaeus (`test_writer`) added `src/test/metadata-timer-timeline-slots.test.tsx` in commit `cab15b1`.
- Parent red validation failed for the expected reason: TASK-039 App Shell surfaces were not mounted yet. Adjacent metadata, timer, and host suites stayed green.
- Ramanujan (`test_writer`) fixed a test-only lint issue in commit `d265d3c`, replacing direct DOM node access with user-visible role assertions while preserving inert tag coverage.
- Kant (`implementer`) completed the main production implementation for page metadata, page timeline, and global floating timer surfaces.
- Epicurus (`implementer`) corrected the pre-commit implementation to render registered plugin components through React-owned elements and error boundaries instead of direct component-function invocation.
- Implementation commit: `d72d806` (`Kant+Epicurus(implementation)(Mount Metadata, Timer, And Timeline Slots): mount page slot surfaces`).
- Parent validation after implementation passed:
  - `bun run test:frontend -- src/test/metadata-timer-timeline-slots.test.tsx src/test/metadata-ui-plugin.test.tsx src/test/timer-time-segment-note.test.tsx src/test/view-slot-hosts.test.tsx` (4 files / 68 tests).
  - `bun run test:frontend -- src/test/metadata-timer-timeline-slots.test.tsx src/test/metadata-ui-plugin.test.tsx src/test/timer-plugin-runtime.test.tsx src/test/timer-time-segment-note.test.tsx src/test/view-slot-hosts.test.tsx src/test/sidebar-page-filter-navigation.test.tsx src/test/home-workspace-editor.test.tsx` (7 files / 117 tests).
  - `bun run typecheck`.
  - `bun run lint`.
  - `git diff --check`.
- Parent decision: accept the implementation commit and run review agents before branch gate.
