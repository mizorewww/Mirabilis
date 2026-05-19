# TASK-004 Agent Notes: Add In-Memory Metadata Store

## Task Context

- Task ID: TASK-004.
- Task name: Add in-memory Metadata Store.
- Branch: `feat/task-004-in-memory-metadata-store`.
- Worktree: `/home/aac6fef/Developer/mirabilis-task-004`.

## Source Docs

- `docs/implementation/task-index.md` TASK-004.
- `docs/product/02-core-data-model.md#42-metadata`.
- `docs/architecture/02-core-kernel.md#42-metadata-store`.

## Initial Scope

- Set, get, list, and delete metadata by `pageId`, `namespace`, and `key`.
- Store values as unknown JSON-compatible data with a value type.
- Require `sourcePluginId`.
- Keep Metadata Store plugin-agnostic.
- Stay within Core kernel behavior; do not add native persistence, Tauri IPC, UI, plugin behavior, or SQLite.

## Initial Decisions

- Use TASK-002 `MetadataRecord` and `MetadataValueType` from `src/core`.
- Follow the TASK-003 in-memory store pattern where it fits: deterministic dependency injection, typed errors, defensive clone boundaries, and no singleton store.
- Keep the parent thread as orchestration-only.
- Use commit format `<agent-name>(<category>)(Add in-memory Metadata Store): <specific change>`.

## Agent Recommendations And Outcomes

No TASK-004 agents have reported yet.
