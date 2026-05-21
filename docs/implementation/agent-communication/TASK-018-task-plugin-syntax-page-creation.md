# TASK-018 Agent Communication - Task Plugin Syntax And Page Creation

## Task

- Task ID: TASK-018.
- Task name: Implement Task Plugin syntax and task page creation.
- Branch: `feat/task-018-task-plugin-syntax-page-creation`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/implementation/task-index.md#task-018-implement-task-plugin-syntax-and-task-page-creation`.
- `docs/product/04-editor-and-workflows.md#11-用户核心操作markdown-页面中写任务`.
- `docs/product/05-built-in-plugins.md#16-task-plugin`.
- `docs/product/03-plugin-platform.md`.
- `docs/architecture/04-slots-editor-task.md#9-task-plugin-代码架构`.
- `docs/architecture/07-runtime-flows.md#181-用户输入任务`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- `- [ ] A` is recognized as a task block.
- A corresponding Markdown Page is created if the block is not yet bound.
- Created task pages include `task.enabled`, `task.status`, `task.sourcePageId`, and `task.sourceBlockId` metadata.
- Duplicate task pages are not created for the same source block.

## Initial Parent Interpretation

- TASK-018 should add the first Task Plugin behavior slice after TASK-017 stable block IDs.
- Task syntax recognition should use existing Markdown document/block IDs as source identity.
- Page creation and metadata writes should go through existing Core/plugin runtime paths and commands, not raw NativeBridge or new Tauri commands.
- The parent thread remains orchestration-only; tests, implementation, docs, and review work will be delegated.
- Out of scope unless agents find a hard acceptance dependency: task text click navigation, infinite nesting UI beyond reusable creation behavior, checkbox toggle events, All Tasks / Today filters, Tag Plugin parsing, metadata UI, timer/calendar behavior, rich editor migration, filesystem/native import-export, package dependencies, and new Tauri permissions/capabilities.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully with 11 agent config files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK, plus the known desktop-terminal `TERM=dumb` failure. Parent treats this as non-blocking for repository agent work.

## Current Status

- Status: task started; pre-test guidance agents pending.
- Active agents: none yet.
- Next parent step: commit start docs, then spawn `planner`, `docs_researcher`, `deprecation_auditor`, and `security_reviewer`.

## Parent Decisions

- Select TASK-018 because it is the first unblocked `[ ]` task after TASK-017 completed and merged.
- Use branch `feat/task-018-task-plugin-syntax-page-creation`.
- Keep parent orchestration-only per user instruction.
