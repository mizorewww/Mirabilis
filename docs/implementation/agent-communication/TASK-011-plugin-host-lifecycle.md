# TASK-011 Agent Communication - Plugin Host Lifecycle

## Task

- Task ID: TASK-011.
- Task name: Implement Plugin Host lifecycle.
- Branch: `feat/task-011-plugin-host-lifecycle`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/product/03-plugin-platform.md#8-plugin-生命周期`.
- `docs/architecture/03-plugin-api-and-host.md#6-plugin-host`.
- `docs/implementation/task-index.md#task-011-implement-plugin-host-lifecycle`.
- `docs/testing/strategy.md`.
- TASK-010 Plugin API contracts in `src/core/plugin-api`.

## Acceptance Criteria

- Plugin Host can install, activate, register, deactivate, uninstall, and get plugins.
- Dependency ordering is deterministic.
- Failed plugin registration returns a typed error without corrupting registries.
- Built-in plugin loading works from an explicit plugin list.

## Initial Parent Interpretation

- TASK-011 is a TypeScript Core/plugin-runtime task, not a native/Tauri plugin-loading task.
- The host should use explicit `AppPlugin[]` input; filesystem discovery, dynamic import resolution, Tauri plugins, persisted plugin registry, IPC, SQLite, UI rendering, and concrete business plugins are out of scope.
- The host should build plugin-facing contexts from existing Core runtime/services/registries and TASK-010 `PluginContext` contracts.
- Lifecycle ordering and dependency handling should be deterministic and observable through tests.
- Failed registration must not leave partially registered commands/views/slots in Core registries.
- Runtime manifest validation should be added only if agents determine it is the smallest useful way to meet acceptance criteria; TASK-010 kept manifest validation deferred.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/reachability OK, a WebSocket timeout with HTTPS fallback still available, and the known desktop-terminal `TERM=dumb` failure. Parent treats these as non-blocking for repository agent work because configured agents and HTTPS reachability remain available.

## Current Status

- Status: started; pre-test guidance next.
- Active agents: none.
- Next parent step: commit TASK-011 start state, then spawn pre-test guidance agents.

## Agent Handoffs

None yet.

## Parent Decisions

- Use the existing repository checkout and branch only; do not create a sibling worktree.
- Follow TDD: delegate pre-test guidance first, then `test_writer`, then `implementer`.
- Persist agent outputs and parent decisions here instead of relying on chat history.
- Keep TASK-011 focused on Plugin Host lifecycle and explicit built-in plugin list loading. Do not implement NativeBridge, Tauri IPC, SQLite persistence, filesystem plugin discovery, UI, or concrete business plugin behavior.

## Next Action

Commit TASK-011 start state and spawn pre-test guidance agents.
