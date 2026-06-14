# TASK-047 - Add Durable Navigation And Route State

## Orchestration State

- Started: 2026-06-15 00:05 CST.
- Branch: `feat/task-047-durable-navigation-route-state`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Status: pre-test guidance running; parent is waiting for final statuses.

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
- Archimedes (`docs_researcher`, agent `019ec6e2-940a-7963-ab0c-c42d9276e0e6`) was spawned at 2026-06-15 00:06 CST for current MUI, React, Testing Library/user-event, and local TASK-038 navigation notes.
- Laplace (`security_reviewer`, agent `019ec6e2-973f-7883-a54b-57688677304b`) was spawned at 2026-06-15 00:06 CST for route-state persistence/security red-test targets.
- Poincare (`deprecation_auditor`, agent `019ec6e2-99d6-77a2-a347-9258f91e8c56`) was spawned at 2026-06-15 00:06 CST for stale MUI/React/testing API risk.

## Next Action

- Wait for pre-test guidance final statuses before spawning `test_writer`. A wait timeout is not a failure or idle signal.
