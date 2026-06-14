# TASK-047 - Add Durable Navigation And Route State

## Orchestration State

- Started: 2026-06-15 00:05 CST.
- Branch: `feat/task-047-durable-navigation-route-state`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Status: red tests committed; parent is preparing `implementer` delegation.

## Scope

- Persist and restore active page route, active filter route, durable Home identity, recent pages, and safe route fallback across app restart.
- Store only opaque page IDs, filter IDs, route tokens, or bounded route DTO keys.
- Keep Home restoration stable and avoid duplicate Home pages when persisted state already points at an available Home page.
- Fail closed to safe, visible, non-leaky route state for unavailable, archived, malformed, wrong-owner, or missing pages and filters.
- Preserve existing navigation, saved-filter, ViewHost, SlotHost, command-boundary, responsive, and accessibility behavior.

## Constraints

- Parent remains orchestration-only and must wait for child-agent completion/final status before dependent steps.
- Tests must be written before production implementation.
- Do not persist raw page bodies, plugin-private data, SQL, filesystem paths, secrets, runtime handles, NativeBridge, raw stores, or full route DTOs.
- Do not broaden plugin/native access or bypass Command Registry.
- Do not add Search FTS, plugin settings persistence, sync transport, AI/provider settings, native shortcuts, import/export, broad query/feed facades, or release hardening in this task.

## Source Docs

- `docs/product/07-user-interface-design.md`
- `docs/architecture/07-runtime-flows.md`
- `docs/implementation/task-index.md#TASK-047`
- `docs/implementation/task-index.md#TASK-038`
- `docs/testing/strategy.md#task-038-sidebar-page-and-saved-filter-navigation-guidance`

## Parent Decisions

- Treat TASK-047 as the first durable navigation layer on top of TASK-046's SQLite-backed Core pages/metadata/events/filters.
- Keep route-state persistence bounded to identifiers/tokens and safe restoration decisions.
- Reuse TASK-038 navigation and TASK-045 responsive/accessibility semantics rather than redesigning the shell.
- Run planner/docs/security/deprecation pre-test guidance before red tests because the task touches React/MUI route state, persistence boundaries, and app startup restoration behavior.

## Validation

- 2026-06-15 00:05 CST: branch created from pushed `master`.
- 2026-06-15 00:05 CST: 11 project agent TOML files parsed successfully.
- 2026-06-15 00:05 CST: `codex --strict-config doctor --summary --ascii` reported config/auth/network/websocket/reachability OK, with known `TERM=dumb` terminal failure, known unrestricted sandbox notes, and optional MCP env warnings.

## Agent Notes

- Gibbs (`planner`, agent `019ec6e2-918b-7862-9881-dfd2dbe4c5ec`) was spawned at 2026-06-15 00:06 CST for TASK-047 implementation slice and TDD plan.
- Gibbs returned final status at 2026-06-15 00:11 CST with no files modified and no tests run. Recommended slice: add a shell-owned durable route-state module, likely `src/shell/navigation/route-state.ts`; persist a small bounded JSON value through existing TASK-046 Core metadata via `runtime.transaction.run(...)`, stored on the durable Home page under an app-shell namespace such as `app-shell.navigation`; store only `version`, `homePageId`, active page/filter route IDs/roles, and capped deduped `recentPageIds`; restore after runtime hydration and plugin activation; validate against current pages/filters/views/plugin ownership; fail invalid restoration to Home with generic non-leaky unavailable state. Parent decision: accept Core metadata as the branch-sized storage recommendation and pass this storage boundary to `test_writer` and `implementer`.
- Archimedes (`docs_researcher`, agent `019ec6e2-940a-7963-ab0c-c42d9276e0e6`) was spawned at 2026-06-15 00:06 CST for current MUI, React, Testing Library/user-event, and local TASK-038 navigation notes.
- Archimedes returned final status at 2026-06-15 00:10 CST with no files modified. Official docs checked: MUI Drawer/List/ListItemButton, WAI-ARIA `aria-current`, React effects/state guidance, Testing Library/user-event v14, and Tauri Store/capability/permission docs. Parent decision: avoid Tauri Store/new permissions unless later agents find a blocker; require route UI tests to use awaited `userEvent.setup()` interactions with role/name queries and `aria-current="page"` assertions; preserve TASK-045 narrow drawer close/focus behavior; implement route persistence as a small shell-owned parse/serialize/validate boundary storing only versioned Home/page/filter/recent ID data.
- Laplace (`security_reviewer`, agent `019ec6e2-973f-7883-a54b-57688677304b`) was spawned at 2026-06-15 00:06 CST for route-state persistence/security red-test targets.
- Laplace returned final status at 2026-06-15 00:09 CST with no files modified and no tests run. P0 guidance: tests must prove route-state serialization rejects raw page bodies, snippets, metadata/event/filter objects, full route DTOs, SQL/params/table names, filesystem paths, secrets/tokens/provider values, NativeBridge, stores, registries, command registry, plugin host, functions/accessors/symbols/prototypes/runtime handles; page restoration must validate existence, runtime ownership, and non-archived state before rendering; Home restoration must reuse a valid persisted Home ID without creating duplicates; filter restoration must re-run filter/source-plugin/view/metadata-owner checks; recent pages must be bounded and drop foreign/missing/archived IDs; errors must not leak titles, bodies, filter names/queries, plugin IDs where unsafe, raw errors, stacks, SQL, paths, tokens, or native/provider details. Parent decision: pass these as mandatory red-test and implementer constraints.
- Poincare (`deprecation_auditor`, agent `019ec6e2-99d6-77a2-a347-9258f91e8c56`) was spawned at 2026-06-15 00:06 CST for stale MUI/React/testing API risk.
- Poincare returned final status at 2026-06-15 00:11 CST with no files modified and no blockers. Parent accepted the audit constraints: keep `ListItemButton` plus explicit `aria-current="page"`; avoid removed MUI v9 props and legacy List/ListItemText APIs; avoid removed React 19 APIs and `react-dom/test-utils`; make persistence effects StrictMode-safe; use `const user = userEvent.setup()` with awaited interactions; reset shared Vitest mocks explicitly; add static guards for MUI/React/test API drift, package/Cargo/Tauri/capability drift, direct user-event calls, and route persistence allowlist.
- Hilbert (`test_writer`, agent `019ec6e8-bd3b-7063-93c9-546cb7053179`) was spawned at 2026-06-15 00:13 CST for failing TASK-047 tests only. It owns test/test-helper changes, must not modify production/package/native/docs files, and must return final status before parent validates or commits tests.
- Hilbert returned final status with test-only changes in `src/test/durable-navigation-route-state.test.tsx`. Parent red validation at 2026-06-15 00:28 CST matched the expected missing TASK-047 behavior: `bun run test:frontend -- src/test/durable-navigation-route-state.test.tsx --reporter=dot` failed with 5 failures and 4 passing tests. Expected failures cover no durable route metadata after page selection, seeded saved-filter route not restored, persisted Home ID/title not reused, recent pages still session-derived rather than persisted/capped/deduped, and static guard missing `app-shell.navigation` / `route-state` production source. Supporting checks passed: `bun run typecheck`, `bun run lint`, `git diff --check`, `git diff --cached --check`, and exact `.only` / `.skip` scan. Commit: `a78d416` (`Hilbert(test)(Add Durable Navigation And Route State): add durable navigation red tests`).

## Next Action

- Spawn `implementer` to make Hilbert's red tests pass with minimum production changes.
