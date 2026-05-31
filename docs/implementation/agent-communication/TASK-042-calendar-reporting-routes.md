# TASK-042 - Add Calendar And Reporting Routes With Explicit Data Projections

## Orchestration State

- Started: 2026-05-31 21:21 CST.
- Branch: `feat/task-042-calendar-reporting-routes`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.
- Status: started; pre-test guidance pending.

## Scope

- Add MUI Calendar and Reports routes reachable from the app shell/sidebar.
- Calendar routes must build explicit bounded app-shell-owned `calendar.time-segments` projections from public current-runtime data and mount `calendar.day` / `calendar.week` through `ViewHost`.
- Reports routes must build explicit bounded Stats input projections, execute `stats.run-aggregation` through Command Registry, and render Chart views through `ViewHost` when chart DTOs are available.
- Empty, partial-data, loading, and unavailable states must be visible and non-leaky.

## Constraints

- Parent remains orchestration-only and must wait for child-agent completion/final status before dependent steps.
- Tests must be written before production implementation.
- Projection builders are app-shell owned integration code; they must not import plugin private stores, sibling plugin internals, raw Core stores from plugin-rendered UI, NativeBridge/Tauri APIs, SQLite APIs, package, lockfile, Rust, IPC, capability, permission, schema, native, or release surfaces.
- Broad cross-plugin query/feed facade, persistent indexes, Calendar drag/drop/manual segment editing, Stats dashboards beyond registered DTO views, charting dependency expansion, and native/schema changes remain deferred.

## Agent Notes

- Pending: planner guidance.
- Pending: current docs / Testing Library guidance.
- Pending: security boundary guidance.
- Pending: deprecation/API guidance.

## Validation

- 2026-05-31 21:21 CST: 11 project agent TOML files parsed successfully.
- 2026-05-31 21:21 CST: `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/network/websocket OK, with known unrestricted-sandbox notes and known `TERM=dumb` terminal failure.
