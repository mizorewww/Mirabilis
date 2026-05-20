# TASK-007 Agent Communication - Command Registry and Command Bus

## Task

- Task ID: TASK-007.
- Task name: Add Command Registry and Command Bus.
- Branch: `feat/task-007-command-registry-command-bus`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/product/02-core-data-model.md#46-command-registry`.
- `docs/architecture/02-core-kernel.md#46-command-registry`.
- `docs/development/02-implementation-roadmap-and-constraints.md#203-所有用户动作走-command-registry`.
- `docs/implementation/task-index.md#task-007-add-command-registry-and-command-bus`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- Plugins can register and unregister commands.
- Commands expose id, plugin id, title, context, shortcut, and handler.
- UI and plugins execute commands through the command bus.
- Duplicate command IDs are rejected with typed errors.

## Initial Parent Interpretation

- TASK-007 implements Core-level command registration, discovery, unregistration, and execution only.
- Core must not implement business commands such as task, timer, AI, metadata, or page actions.
- Command handlers are plugin-provided functions; Command Bus is the single execution path for UI and plugins.
- The implementation should follow the hardened in-memory Core store style from TASK-003 through TASK-006 where it makes sense.
- Keep native persistence, Tauri IPC, shortcuts integration, command palette UI, plugin host lifecycle, and permission enforcement out of scope unless agents find a local-doc contradiction.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network OK and a desktop-terminal `TERM=dumb` failure, treated as non-blocking for repository agent work.

## Current Status

- Status: pre-test guidance pending.
- Active agents: none.

## Agent Handoffs

## Next Action

Spawn planner, docs researcher, and deprecation auditor for TASK-007 pre-test guidance.
