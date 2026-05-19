# TASK-005 Agent Notes: Add In-Memory Event Store

## Task Context

- Task ID: TASK-005.
- Task name: Add in-memory Event Store.
- Branch: `feat/task-005-in-memory-event-store`.
- Worktree: `/home/aac6fef/Developer/mirabilis-task-005`.

## Source Docs

- `docs/implementation/task-index.md` TASK-005.
- `docs/product/02-core-data-model.md#43-event`.
- `docs/architecture/02-core-kernel.md#43-event-store`.

## Initial Scope

- Append and query immutable events.
- Events include namespace, type, payload, source plugin, created time, and optional page ID.
- Event queries support page and namespace filters needed by early plugins.
- Existing events are not mutated by updates.
- Stay within Core kernel behavior; do not add native persistence, Tauri IPC, UI, plugin behavior, or SQLite.

## Initial Decisions

- Use TASK-002 `AppEvent` from `src/core`.
- Follow the TASK-003/TASK-004 in-memory store pattern where it fits: deterministic dependency injection, typed errors, defensive clone boundaries, and no singleton store.
- Keep the parent thread as orchestration-only.
- Use commit format `<agent-name>(<category>)(Add in-memory Event Store): <specific change>`.

## Agent Recommendations And Outcomes

No TASK-005 agents have reported yet.

## Next Action

Spawn planner, docs researcher, and deprecation auditor for TASK-005 pre-test guidance.
