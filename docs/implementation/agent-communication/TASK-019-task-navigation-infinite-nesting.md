# TASK-019 Agent Communication - Task Navigation and Infinite Nesting

## Task

- Task ID: TASK-019.
- Task name: Implement task navigation and infinite nesting.
- Branch: `feat/task-019-task-navigation-infinite-nesting`.
- Parent role: orchestration only.
- Started: 2026-05-21 12:48 CST.

## Acceptance Criteria

- Clicking task text opens the bound task page.
- Task pages are normal Markdown pages that can contain more tasks.
- Nested tasks create their own task pages using the same mechanism.
- Parent/source relationships remain queryable through metadata.

## Initial Scope

- Build on TASK-018's built-in `TaskPlugin`, `task.resolve-task-block`, `attrs.boundPageId`, and task metadata relation.
- Use command-driven user actions through the Command Registry.
- Keep Core business-logic-free; navigation and nesting UX should live in plugin/runtime/editor/App Shell-facing surfaces.
- Preserve normal Markdown Page behavior for created task pages.

## Initial Out Of Scope

- Checkbox toggle and `- [x]` behavior.
- `task.completed` / `task.reopened` events.
- All Tasks / Today filters.
- Tag Plugin parsing.
- Metadata UI.
- Timer, calendar, stats, sync, ML, AI, and release packaging.
- New Tauri commands, capabilities, filesystem/native import-export, package/Cargo dependencies, or Rust persistence changes unless agents identify a hard acceptance dependency.

## Source Docs

- `docs/implementation/task-index.md#task-019-implement-task-navigation-and-infinite-nesting`.
- `docs/product/01-vision-and-core.md#任务可无限嵌套的-markdown-first-时间管理系统开发文档`.
- `docs/product/04-editor-and-workflows.md#113-任务无限嵌套`.
- `docs/architecture/07-runtime-flows.md#182-用户点击任务文字`.
- `docs/development/02-implementation-roadmap-and-constraints.md` TASK-018/TASK-019 boundary notes.

## Parent Decisions

- Select TASK-019 because it is the first unblocked `[ ]` task after TASK-018 completed and merged.
- Use branch `feat/task-019-task-navigation-infinite-nesting`.
- Keep parent orchestration-only per user instruction.
- Run pre-test guidance before delegating test writing because the task touches React/editor/runtime/plugin command flows.

## Agent Outcomes

No agents have completed TASK-019 work yet.

## Validation Log

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK; non-blocking notes were the known `TERM=dumb` terminal failure and an available Codex update.
