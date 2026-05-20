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

- Status: pre-test guidance active.
- Active agents:
  - Schrodinger (`planner`, `019e4346-6f25-7710-ba44-e7dc2aae5bb0`): TASK-007 API, scope, and TDD plan.
  - Bacon (`docs_researcher`, `019e4346-73ce-7851-b8b0-704b45d106eb`): current TypeScript/Vitest guidance for command API tests.
  - Poincare (`deprecation_auditor`, `019e4346-77cc-7a41-b1a4-be8d337f3f13`): TASK-007 risk and deprecated-pattern audit.

## Agent Handoffs

### Pre-test Guidance Round

- Status: active.
- Agents:
  - Schrodinger (`planner`, `019e4346-6f25-7710-ba44-e7dc2aae5bb0`): propose focused Core Command Registry/Bus API, validation, error codes, execution semantics, and acceptance tests.
  - Bacon (`docs_researcher`, `019e4346-73ce-7851-b8b0-704b45d106eb`): verify current official TypeScript and Vitest guidance relevant to generic command definitions, async errors, and type tests.
  - Poincare (`deprecation_auditor`, `019e4346-77cc-7a41-b1a4-be8d337f3f13`): audit fragile API choices, handler error behavior, context/shortcut validation risks, unregister/list mutation risks, and architecture boundaries.

## Next Action

Wait for TASK-007 pre-test guidance agents.
