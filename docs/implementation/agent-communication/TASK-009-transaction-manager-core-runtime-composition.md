# TASK-009 Agent Communication - Transaction Manager and Core Runtime Composition

## Task

- Task ID: TASK-009.
- Task name: Add Transaction Manager and Core Runtime composition.
- Branch: `feat/task-009-transaction-manager-core-runtime-composition`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/architecture/02-core-kernel.md`.
- `docs/architecture/07-runtime-flows.md#17-启动流程`.
- `docs/architecture/03-plugin-api-and-host.md#5-plugin-context`.
- `docs/architecture/04-slots-editor-task.md#93-创建任务对应页面`.
- `docs/architecture/05-plugin-implementations.md#102-start-timer`.
- `docs/development/02-implementation-roadmap-and-constraints.md#19-开发顺序`.
- `docs/implementation/task-index.md#task-009-add-transaction-manager-and-core-runtime-composition`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- Core services and registries are composed into an app runtime object.
- Transactions can group page, metadata, event, and filter changes.
- Failed transaction handlers do not partially apply in the in-memory implementation.
- Runtime exposes services through documented names.

## Initial Parent Interpretation

- TASK-009 implements in-memory Core composition only.
- The runtime should compose the existing Page Store, Metadata Store, Event Store, Filter Store, Command Registry, View Registry, Slot Registry, and a Transaction Manager into a documented Core runtime object.
- Transactions should expose transactional versions of page, metadata, event, and filter services to a handler and commit all changes only if the handler succeeds.
- Failed transaction handlers must leave the original in-memory stores unchanged.
- The transaction implementation should be conservative and local to Core; no Plugin Host, native bridge, Tauri IPC, SQLite, UI rendering, persistence, filesystem, settings, storage, algorithm registry, markdown extension registry, metadata field registry, event type registry, query bus, or event bus implementation should be invented in this task.
- Runtime service names should line up with docs where implemented today, while missing future services should stay out of the concrete TASK-009 runtime unless tests/docs agents identify a clear placeholder contract.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network OK, noted Codex `0.132.0` is available, and reported the known desktop-terminal `TERM=dumb` failure. Parent treats this as non-blocking for repository agent work.

## Current Status

- Status: started; pre-test guidance pending.
- Active agents: none.

## Agent Handoffs

No TASK-009 agents have completed yet.

## Parent Decisions

- Use the existing repository checkout and branch only; do not create a sibling worktree.
- Follow TDD: gather docs/API guidance, delegate failing tests to `test_writer`, confirm the red signal, then delegate production implementation to `implementer`.
- Persist agent outputs and parent decisions here instead of relying on chat history.

## Next Action

Spawn pre-test guidance agents for TASK-009, then commit the guidance summary before handing the task to `test_writer`.
