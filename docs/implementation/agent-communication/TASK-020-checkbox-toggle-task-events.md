# TASK-020 Agent Communication - Checkbox Toggle And Task Events

## Task

- Task ID: TASK-020.
- Task name: Implement checkbox toggle and task events.
- Branch: `feat/task-020-checkbox-toggle-task-events`.
- Parent role: orchestration only.
- Started: 2026-05-21 13:58 CST.

## Source Docs Read By Parent

- `.codex/skills/mirabilis-dev-runner/SKILL.md`.
- `docs/implementation/progress.md`.
- `docs/implementation/task-index.md#task-020-implement-checkbox-toggle-and-task-events`.
- `docs/product/05-built-in-plugins.md#163-点击逻辑`.
- `docs/development/02-implementation-roadmap-and-constraints.md#204-所有跨插件协作走-event--metadata--query`.
- `docs/development/02-implementation-roadmap-and-constraints.md` Phase 3 boundary notes.
- `docs/architecture/07-runtime-flows.md#181-用户输入任务`.
- `docs/architecture/04-slots-editor-task.md#9-task-plugin-代码架构`.
- Related command/event examples in `docs/product/02-core-data-model.md` and `docs/product/03-plugin-platform.md`.

## Initial Scope

- Implement the checkbox/status slice after TASK-018/TASK-019.
- Acceptance criteria:
  - Clicking checkbox toggles task status.
  - Status changes update task metadata.
  - Completion writes a `task.completed` event.
  - Reopening or unchecking behavior is defined and tested.
- Test plan from task index:
  - Task Plugin tests for toggle command, metadata update, and event write.
  - UI behavior test for checkbox interaction.

## Initial Out Of Scope

- Automatic editor-save scanning/indexing.
- All Tasks / Today filters and task list views.
- Tag Plugin parsing or metadata UI.
- Timer/Calendar behavior, except preserving event contracts other plugins can later listen to.
- Rich editor migration, Tiptap/ProseMirror adaptation, or broad Markdown AST work.
- New Tauri commands/capabilities, filesystem/native behavior, package/Cargo dependencies, packaging, or release work.

## Known Risks For Agents

- Command naming is inconsistent in docs:
  - `docs/product/05-built-in-plugins.md` mentions `task.toggle_status`.
  - `docs/development/02-implementation-roadmap-and-constraints.md` mentions `task.toggle-status`.
  - `docs/product/03-plugin-platform.md` mentions `task.toggle_checkbox`.
- Current implemented Task Plugin commands are kebab-case: `task.resolve-task-block` and `task.open-task-page`.
- TASK-018 resolver currently treats `- [x]` as out of scope and accepts only unchecked task syntax for page creation/opening. TASK-020 must define whether completed source syntax is valid for an already resolved task and how source Markdown, metadata, and events stay consistent.
- The editor currently renders structured-body task title buttons, not checkbox controls. UI behavior must preserve unsafe-title inertness and stale async/content guards established in TASK-019.
- Event writes must use Core Event Store/plugin-facing APIs without putting task business behavior into Core.

## Parent Start Decision

- Select TASK-020 because it is the first unblocked `[ ]` task after TASK-019 completed and merged.
- Start from `master` at merge commit `7a2ce72`.
- Use branch `feat/task-020-checkbox-toggle-task-events`.
- Delegate planning, current-doc guidance, deprecation/API review, security review, tests, implementation, review, and docs sync to agents.

## Agent/Config Validation

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK.
- Non-blocking notes: unrestricted sandbox/network, known `TERM=dumb` terminal failure, and available Codex update.

## Current Next Action

- Spawn pre-test agents for planning, current docs, deprecation/API, and security guidance.
