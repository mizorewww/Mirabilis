# TASK-048 - Add Save-Time Semantic Refresh Pipeline

## Orchestration State

- Started: 2026-06-17 03:28 CST.
- Branch: `feat/task-048-save-time-semantic-refresh-pipeline`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Status: pre-test guidance complete; parent is preparing to delegate red tests.

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
- Gibbs returned final status at 2026-06-17 03:32 CST with no files modified. Recommended branch slice: save-time semantic refresh for the currently saved Markdown page only, implemented after durable Markdown save. Likely modules: `src/App.tsx` around `createMarkdownWorkspaceBridge` / `saveWorkspacePage`, `src/plugins/markdown-editor/components/MarkdownPageEditor.tsx` for bounded save-warning state, `src/providers/MarkdownWorkspaceBridgeContext.ts` if save result type carries refresh status, and preferably a small helper such as `src/shell/semantic-refresh.ts`. TDD plan: save order; success path for unchecked task blocks, `#tag`, and `#habit`; active exact descriptor ownership; refresh failure preserving saved Markdown with generic warning; stale async result ignoring after route/page switch; and static boundary drift guards. Planner deferrals: generic save-time manifest API, task-owned page-level refresh command, checked-task save-time resolution, habit checkbox bridge, background/global scanners, workers, indexers, timer/calendar/stats/ML/AI/sync/feed/query work, and native/Tauri/Rust/IPC/package/capability/filesystem changes.
- Averroes returned final status at 2026-06-17 03:32 CST with no files modified and no checks run. Guidance: save Markdown first, then invoke plugin-owned semantic commands through exact descriptor ownership checks rather than command-id prefixes; candidate commands are `task.resolve-task-block` for eligible saved unchecked task blocks, `tag.refresh-tags({ pageId })`, and `habit.refresh-habit({ pageId })`. Refresh failures should preserve the saved Markdown and render bounded non-leaky UI state. Tests should use awaited `userEvent.setup()` interactions, async `findBy` / `waitFor` assertions, save-before-refresh ordering, command owner checks, missing/inactive/unowned command fail-closed paths, stale save/refresh result ignoring, and command-boundary coverage. Averroes found `docs/testing/strategy.md` lacks TASK-048 guidance and flagged stale "no save-time scan/refresh" wording to update after implementation in product, architecture, development, testing, and progress docs. External docs verified: React `act`, Testing Library user-event v14, Testing Library async APIs, Vitest async/mock APIs, and MUI Alert/version docs.
- Curie returned final status at 2026-06-17 03:32 CST with no files modified. Curie found no P0/P1 security finding in the current docs/orchestration-only branch diff, and gave required TASK-048 red-test targets for implementation: save succeeds before refresh and refresh is skipped on save failure; refresh failure cannot roll back, overwrite, archive, or corrupt saved Markdown; task resolver payloads must use saved structured body block IDs rather than stale pre-save IDs; inactive, missing, wrong-owner, or matching-prefix foreign commands must fail closed before execution; payloads must be exact plain data only; hostile descriptors/results with accessors, symbols, non-enumerables, non-plain prototypes, functions, SQL/path/token/secret/native-handle-shaped fields, or runtime/native handles must be rejected or ignored without leakage; plugin-owned mutations must stay behind Plugin Host facades; visible errors must be generic and bounded; no background indexer, worker, timer loop, global scanner, all-pages scan, Search/ML/Sync feed, fetch, browser storage, native bridge path, package/native/Tauri/IPC/Rust/capability/schema drift, or DB operation drift is allowed.
- Sagan returned final status at 2026-06-17 03:32 CST with no files modified and no changed TASK-048 code paths to flag because the branch diff is still docs/orchestration only. Constraints for downstream agents: use `const user = userEvent.setup()` with awaited interactions; use `findBy` / `waitFor` for async UI without sleeping or side effects inside callbacks; use awaited React `act` for manual deferred promise resolution and never import from `react-dom/test-utils`; add StrictMode coverage proving one Save click does not double-run semantic refresh; keep save-time refresh in the Save click async flow after `pageFacade.save(...)`, not in effects; preserve generation/page guards; use active plugin declarations plus `runtime.commands.get(commandId).pluginId` owner checks; avoid broad runtime command exposure; keep MUI v9-safe imports/props; and avoid package/Tauri/IPC/Rust/capability/filesystem/worker/feed/Search/ML/background scanner surfaces. Official docs verified: React 19 upgrade/test-utils/StrictMode/act, Testing Library user-event v14/async/user-event options, MUI deprecated APIs and v9 migration, Vitest timers, and Vite 7 Node support.

## Next Action

- Commit this guidance record, close Gibbs, Averroes, Curie, and Sagan, then delegate TASK-048 red tests to `test_writer`.
