# TASK-022 Agent Communication - All Tasks And Today Filters

## Task

- Task ID: TASK-022.
- Task name: Implement All Tasks and Today filters.
- Branch: `feat/task-022-all-tasks-today-filters`.
- Parent role: orchestration only.
- Started: 2026-05-21 18:35 CST.

## Source Docs Read By Parent

- `.codex/skills/mirabilis-dev-runner/SKILL.md`.
- `docs/implementation/progress.md`.
- `docs/implementation/task-index.md#task-022-implement-all-tasks-and-today-filters`.
- `docs/development/01-data-roadmap-and-mvp.md#phase-3task-plugin`.
- `docs/product/05-built-in-plugins.md#23-filter-plugin`.
- `docs/architecture/02-core-kernel.md#44-filter-store`.
- `docs/architecture/06-filter-native-database.md#14-filter-engine-设计`.
- Related Task/Tag references in `docs/product/05-built-in-plugins.md`, `docs/architecture/07-runtime-flows.md`, `docs/development/02-implementation-roadmap-and-constraints.md`, and `docs/testing/strategy.md`.

## Initial Scope

- Implement the first Task/Filter/View slice after Task and Tag Plugin foundations.
- Acceptance criteria:
  - All Tasks filter lists task-enabled pages.
  - Today filter uses documented metadata/date semantics.
  - Filters render through the registered view system.
  - Empty states are provided through slots.
- Test plan from task index:
  - Filter engine tests for task queries.
  - UI tests for filter result rendering.

## Initial Out Of Scope

- Automatic save-time scanning/indexing of task blocks.
- New task metadata fields beyond current task metadata unless agents identify a narrow Today dependency.
- Rich editor behavior, global Metadata UI, Tag picker/autocomplete, Timer/Calendar/Stats aggregation, native/Tauri/package changes, broad persistence/schema changes, release packaging, or Core business behavior beyond generic filter/view/slot primitives.

## Known Risks For Agents

- The current Filter Store saves definitions, but TASK-022 may require the first executable filter/query engine surface.
- Product docs mention All Tasks and Today as default Task Plugin filters, but due/scheduled date metadata is still mostly future-facing after TASK-020.
- Filter rendering must go through the registered view system without hardcoding task UI into Core or App Shell.
- Empty states should be plugin/slot-driven rather than a one-off app-level placeholder if current APIs allow that.
- Keep native/Tauri/package/Cargo surfaces unchanged unless a task-critical dependency appears.

## Parent Start Decision

- Select TASK-022 because it is the first unblocked `[ ]` task after TASK-021 completed and merged.
- Start from `master` at merge commit `b5389cd`.
- Use branch `feat/task-022-all-tasks-today-filters`.
- Delegate planning, current-doc guidance, deprecation/API review, security review, tests, implementation, review, and docs sync to agents.

## Agent/Config Validation

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK.
- Non-blocking notes: unrestricted sandbox/network, known `TERM=dumb` terminal failure, and available Codex update.

## Current Next Action

- Delegate pre-test guidance to planner, docs researcher, deprecation auditor, and security reviewer.
