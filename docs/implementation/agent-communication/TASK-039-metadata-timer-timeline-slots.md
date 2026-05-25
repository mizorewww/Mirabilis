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

- Delegate planner, docs researcher, security reviewer, and deprecation auditor for pre-test guidance before asking `test_writer` for failing TASK-039 acceptance tests.
