# TASK-048 - Add Save-Time Semantic Refresh Pipeline

## Orchestration State

- Started: 2026-06-17 03:28 CST.
- Branch: `feat/task-048-save-time-semantic-refresh-pipeline`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Status: pre-test guidance delegated; parent is waiting for child-agent final statuses.

## Scope

- Editor save explicitly invokes plugin-owned refresh or resolve commands for task, tag, and habit semantics where those plugins declare save-time behavior.
- Preserve the saved Markdown page if any semantic refresh command fails.
- Surface refresh failures to the user as bounded, non-leaky state.
- Keep command execution owner-checked, routed through Command Registry, and scoped to plugin facades.

## Constraints

- Parent remains orchestration-only and must wait for child-agent completion/final status before dependent steps.
- Tests must be written before production implementation.
- Core and Markdown editor must not gain task, tag, habit, timer, calendar, heatmap, stats, chart, ML, AI, or sync business logic.
- Do not introduce a background indexer, worker, automatic global scanner, or persistent Search/ML/feed/index surface.
- Do not add package/native/Tauri/IPC/Rust/capability/permission/schema/filesystem changes unless an agent reports a blocker and the parent records the reason.
- Plugins must not mutate sibling private data; cross-plugin collaboration must go through Command Registry and plugin facades.

## Source Docs

- `docs/product/04-editor-and-workflows.md`
- `docs/product/05-built-in-plugins.md`
- `docs/architecture/02-core-kernel.md`
- `docs/architecture/03-plugin-api-and-host.md`
- `docs/architecture/04-slots-editor-task.md`
- `docs/development/02-implementation-roadmap-and-constraints.md`
- `docs/implementation/task-index.md#TASK-048`
- `docs/testing/strategy.md`

## Parent Decisions

- Treat TASK-048 as a narrow save-time orchestration slice on top of existing explicit plugin commands: `task.resolve-task-block`, `tag.refresh-tags`, and `habit.refresh-habit`.
- Require plugin ownership/descriptor checks rather than command-id-prefix trust.
- Preserve TASK-017/TASK-046 Markdown page save durability before any semantic refresh side effects are applied.
- Run planner/docs/security/deprecation pre-test guidance before red tests because the task touches editor save flow, Plugin Host command execution, Command Registry ownership, and plugin facade mutations.

## Validation

- 2026-06-17 03:28 CST: branch created from pushed `master`.
- 2026-06-17 03:28 CST: 11 project agent TOML files parsed successfully.
- 2026-06-17 03:28 CST: `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/network/websocket/reachability OK, with known `TERM=dumb` terminal failure and unrestricted-sandbox notes.

## Agent Notes

- Gibbs (`planner`, agent `019ed1e9-1c93-7fd0-af0d-e8678799a583`) was spawned at 2026-06-17 03:28 CST for TASK-048 branch-sized implementation slice and TDD plan.
- Averroes (`docs_researcher`, agent `019ed1e9-2103-73b0-ba41-6fbb21a3acb0`) was spawned at 2026-06-17 03:28 CST for local/current docs guidance covering editor save, React/MUI, Testing Library/user-event, Vitest, Command Registry, and Plugin Host patterns.
- Curie (`security_reviewer`, agent `019ed1e9-2540-7f42-bb1b-d70697f41f44`) was spawned at 2026-06-17 03:28 CST for save-time semantic refresh security and boundary red-test targets.
- Sagan (`deprecation_auditor`, agent `019ed1e9-296a-7590-9dd3-c681376938a1`) was spawned at 2026-06-17 03:28 CST for stale API and version-specific testing/implementation risks.

## Next Action

- Wait for Gibbs, Averroes, Curie, and Sagan final statuses before delegating red tests. A wait timeout is not a failure or idle signal.
