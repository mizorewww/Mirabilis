# TASK-041 Agent Communication - Add Search Overlay And Results Route

## Task

- ID: TASK-041.
- Name: Add Search Overlay And Results Route.
- Branch: `feat/task-041-search-overlay-results-route`.
- Started: 2026-05-31 20:09 CST.
- Parent role: orchestration only. Parent delegates planning, docs/current API research, TDD tests, implementation, review, docs sync, and release readiness to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-041-add-search-overlay-and-results-route`.
- `docs/product/07-user-interface-design.md`.
- `docs/product/05-built-in-plugins.md#26-search-plugin`.
- `docs/product/06-view-slots.md`.
- `docs/architecture/05-plugin-implementations.md#search-plugin`.
- `docs/architecture/07-runtime-flows.md`.
- `docs/testing/strategy.md`.
- TASK-040 Command Palette / Quick Capture dialog closeout.

## Initial Parent Interpretation

- TASK-041 turns the existing top-bar Search placeholder into a real app-shell search workflow.
- The Markdown workspace remains the first screen; Search opens as a MUI Dialog or overlay rather than replacing the route immediately.
- Search must execute the existing `search.query` command through Command Registry with bounded plain query input and exact payload shape.
- Results should render through the registered `search.results` view or a bounded shell-owned DTO route, and selecting a result should navigate to that page through normal app-shell page route state.
- Route/dialog state must not store full page bodies or create any persistent index.

## Initial Constraints

- Write failing tests first.
- Tests must use React Testing Library and `@testing-library/user-event` for opening search, typing queries, keyboard submit, Escape/close, loading, empty, result, error, result click, navigation, and focus-return flows.
- Accessible names and roles must cover the search textbox, dialog/overlay, status, list/listitems, result buttons/links, and routed page content.
- Command Palette and Search keyboard/focus flows must not conflict.
- Persistent search indexing, background search worker, SQLite FTS, native/global search shortcuts, ranking beyond existing plugin behavior, package, lockfile, Tauri config, capability, generated permission, Rust, IPC, filesystem, schema, release, and native changes are out of scope.

## Validation At Start

- 11 `.codex/agents/*.toml` files parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported config/auth/MCP/network/websocket OK with known non-blocking unrestricted sandbox/network notes and known `TERM=dumb` terminal failure.
- `master` was clean and pushed after TASK-040 merge-result validation before the branch was created.

## Current Next Action

- Spawn `test_writer` to add failing TASK-041 RTL/user-event acceptance tests.

## Pre-Test Guidance Outcomes

- Volta (`planner`) recommended a shell-owned `SearchDialog` launched from the top-bar Search button, exact active-owner-checked `search.query` execution, and a shell-owned `search-results` route state containing only copied bounded DTO fields. Result selection should validate the page still exists and then navigate through normal page route state.
- Schrodinger (`docs_researcher`) verified current MUI v9 Dialog/TextField/List/Button/CircularProgress path-import usage, WAI-ARIA modal dialog/focus requirements, Testing Library/user-event async guidance, and Vitest async assertions. Guidance: use MUI `Dialog` with visible `DialogTitle`, labelled text input, search form/status/list semantics rather than combobox semantics, `slotProps.htmlInput` for `maxLength`, and no `check:full` unless native/package surfaces change.
- Gibbs (`security_reviewer`) found no P0 blocker and raised one P1 parent decision: choose the TASK-041 rendering path before red tests. Recommendation accepted: use shell-owned interactive result rows for click/navigation; if `search.results` is mounted at all, mount it only through exact `acceptedData`.
- Feynman (`deprecation_auditor`) found no P0/P1 blockers. Guidance: MUI path imports only, no MUI v9 removed props, no nested React roots, no private Search plugin imports, no stale `react-dom/test-utils`, no fake timer pitfalls, and no package/lock/native/Tauri/Rust drift.

## Parent Decisions

- Results route path: use a shell-owned bounded DTO route with `{ query, results: [{ pageId, title, snippet, matchedFields }] }` and MUI result rows/buttons so the shell can validate page existence before navigation.
- Command payload: execute `search.query` with exact `{ query }` only. Query text is bounded to the existing 200-character Search plugin cap before dispatch.
- Security boundary: dispatch only active `search`-owned `search.query`; fail closed for missing, inactive, foreign-owned, malformed, stale, oversized, or unexpected command results.
- Deferred scope remains unchanged: persistent search indexing, background worker, SQLite FTS, ranking changes, native/global search shortcuts, package/lockfile, Tauri/Rust/IPC/capability/schema/release changes, and Search plugin private implementation changes are out of scope.

## Test Writer Outcome

- Rawls (`test_writer`) added TASK-041 red acceptance tests in commit `2e58ca3`.
- Changed files:
  - `src/test/search-overlay-results-route.test.tsx`;
  - `src/test/mui-shell-frame.test.tsx`.
- Coverage added:
  - Search top-bar dialog open/focus/close/focus return;
  - exact `{ query }` dispatch to active `search`-owned `search.query` with 200-character input cap;
  - pending status and duplicate-dispatch prevention;
  - empty, result, malformed-result, missing-command, inactive-plugin, foreign-owner, missing-page navigation, and thrown-error redacted states;
  - bounded DTO rendering and result-click navigation through normal page route state;
  - Command Palette and Search keyboard/focus-flow independence;
  - Settings remains placeholder while Search no longer reports the deferred placeholder status;
  - static guards for no package/native/Tauri/Rust/IPC/capability/schema/release/indexer/FTS drift, no private Search imports, no stale MUI/test APIs, and no skipped/focused tests.
- Parent red validation failed as expected:
  - `bun run test:frontend -- src/test/search-overlay-results-route.test.tsx src/test/mui-shell-frame.test.tsx src/test/command-palette-quick-capture-dialog.test.tsx src/test/quick-capture-search-plugins.test.tsx`.
  - Result: 2 failed files / 2 passed files, 13 failed / 52 passed tests.
  - Failure reason: Search still does not open `role="dialog"` named `Search`.
- Parent validation after red tests:
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - Forbidden test-pattern scans for `.only`, `.skip`, `fireEvent`, `react-dom/test-utils`, and `delay: null` returned no matches.
- Parent decision: accept `2e58ca3` as the TASK-041 red baseline and delegate production implementation.

## Implementation Outcome

- Confucius (`implementer`) implemented the TASK-041 app-shell Search dialog and results route in commit `4b41067`.
- Production files changed:
  - `src/App.tsx`;
  - `src/shell/dialogs/SearchDialog.tsx`;
  - `src/shell/dialogs/index.ts`.
- Delivered behavior:
  - top-bar Search launches a named MUI `Dialog` with labelled query input, 200-character cap, Enter/button submit, cancel/Escape close, pending status, generic error, and focus return;
  - Search executes only active `search`-owned `search.query` through Command Registry with exact `{ query }`;
  - command results are copied into a shell-owned bounded `{ kind: "search.results", query, results }` DTO;
  - Search results render as an accessible route with status, list/listitem rows, inert title/snippet/matched-field text, and no page bodies or raw runtime objects;
  - clicking a result validates the page exists before navigating to the normal page editor route;
  - Search no longer shows the deferred placeholder while Settings remains a visible placeholder.
- Parent validation after implementation passed:
  - `bun run test:frontend -- src/test/search-overlay-results-route.test.tsx src/test/mui-shell-frame.test.tsx src/test/command-palette-quick-capture-dialog.test.tsx src/test/quick-capture-search-plugins.test.tsx` (4 files / 65 tests).
  - `bun run test:frontend -- src/test/search-overlay-results-route.test.tsx src/test/sidebar-page-filter-navigation.test.tsx src/test/home-workspace-editor.test.tsx src/test/metadata-timer-timeline-slots.test.tsx` (4 files / 55 tests).
  - `bun run typecheck`.
  - `bun run lint`.
  - `git diff --check`.
  - Forbidden production-surface scan for MUI barrels, removed MUI props, `createRoot`, Search private imports, native/Tauri bridge, worker/indexer/FTS, unsafe HTML/eval sinks, and filesystem/schema/release surfaces returned no matches.
- Parent decision: accept implementation commit and run review agents.

## Review Outcome And Fixes

- Hooke (`security_reviewer`) found no P0/P1/P2 security issues and confirmed active-owner `search.query` dispatch, exact bounded payloads, bounded DTO validation, inert rendering, existing-page navigation, generic errors, and no native/worker/indexer/FTS drift.
- Laplace (`reviewer`) found no P0/P1/P2 correctness regressions.
- Ohm (`deprecation_auditor`) found no P0/P1/P2 API/deprecation issues and confirmed MUI v9 path imports, no removed props, no private Search imports, and no stale React/test APIs.
- Halley (`test_quality_reviewer`) found P2 test-quality gaps:
  - DTO boundary coverage did not lock oversized fields, too many results, invalid/empty matched fields, query mismatch, accessors, symbol keys, prototype data, sparse arrays, or extra array keys;
  - no-indexer/worker/FTS static guard scanned too narrow a production surface.
  - Halley also noted a P3 missing `listitem` role assertion.
- Hypatia (`docs_researcher`) found a P2 behavior issue: the Search dialog could trap users while `search.query` was pending because Escape/Cancel were blocked. Hypatia also found docs drift and the stale task-index Search anchor.
- Sartre (`pr_explorer`) found P1 product and architecture docs drift: formal docs still described app-shell Search route/dialog work as deferred.

## Review Regression Tests

- Noether (`test-fix`) added review regression coverage in commit `8755359`.
- Changed file:
  - `src/test/search-overlay-results-route.test.tsx`.
- Coverage added:
  - pending `search.query` Escape close, focus return, and stale resolved result ignored;
  - fail-closed table for oversized DTO fields, too many results, invalid/empty `matchedFields`, query mismatch, accessors, symbol keys, prototype data, sparse arrays, and extra array keys;
  - `listitem` role assertion for result route;
  - broader no-indexer/worker/FTS static guard over app-shell plus changed/new production `src` files, including `src/core` and `src/plugins` if changed.
- Parent red validation failed as expected:
  - `bun run test:frontend -- src/test/search-overlay-results-route.test.tsx src/test/mui-shell-frame.test.tsx src/test/command-palette-quick-capture-dialog.test.tsx src/test/quick-capture-search-plugins.test.tsx`.
  - Result: 1 failed / 78 passed.
  - Failure reason: pending Search dialog remained open after Escape while `search.query` was unresolved.
- Parent validation after test-only changes:
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - Forbidden test-pattern scans returned no matches.

## Review Fix Outcome

- Boyle (`review-fix`) fixed the pending Search close behavior in commit `af3cc6c`.
- Production files changed:
  - `src/App.tsx`;
  - `src/shell/dialogs/SearchDialog.tsx`.
- Delivered fixes:
  - Search dialog can close with Escape while a search is pending and returns focus to the launcher;
  - pending submissions are invalidated on close so later resolve/reject cannot navigate, open the Search results route, reopen the dialog, leak stale result text, or show stale errors;
  - duplicate dispatch prevention and generic visible errors for active visible searches remain intact.
- Parent validation after review-fix passed:
  - `bun run test:frontend -- src/test/search-overlay-results-route.test.tsx src/test/mui-shell-frame.test.tsx src/test/command-palette-quick-capture-dialog.test.tsx src/test/quick-capture-search-plugins.test.tsx` (4 files / 79 tests).
  - `bun run test:frontend -- src/test/search-overlay-results-route.test.tsx src/test/sidebar-page-filter-navigation.test.tsx src/test/home-workspace-editor.test.tsx src/test/metadata-timer-timeline-slots.test.tsx` (4 files / 69 tests).
  - `bun run typecheck`.
  - `bun run lint`.
  - `git diff --check`.
  - Forbidden production-surface scan for MUI barrels, removed MUI props, `createRoot`, Search private imports, native/Tauri bridge, worker/indexer/FTS, unsafe HTML/eval sinks, and filesystem/schema/release surfaces returned no matches.
- Parent decision: accept review regression and review-fix commits, then sync docs before release readiness.

## Docs Sync Outcome

- Socrates (`doc_writer`) applied docs-only TASK-041 sync on 2026-05-31 21:00 CST; no production code or tests were edited.
- Changed docs:
  - `docs/product/07-user-interface-design.md`;
  - `docs/product/05-built-in-plugins.md`;
  - `docs/architecture/05-plugin-implementations.md`;
  - `docs/architecture/07-runtime-flows.md`;
  - `docs/implementation/task-index.md`;
  - `docs/testing/strategy.md`;
  - `docs/implementation/agent-communication/TASK-041-search-overlay-results-route.md`;
  - `docs/implementation/agent-communication/status.md`.
- Docs now record TASK-041 Search as delivered in the app shell: top-bar MUI `Dialog`, exact active search-owned `search.query` `{ query }`, shell-owned bounded results route DTO, inert route rows, existing-page validation/navigation, and pending-close stale-result invalidation.
- Deferred scope remains persistent search index/worker/SQLite FTS, native/global Search shortcuts, ranking beyond existing plugin behavior, package/lockfile, Tauri, Rust, IPC, capability, permission, schema, release surfaces, and broader route/panel polish.
- Validation:
  - `git diff --check` passed.
  - Stale-language grep for Search deferred/placeholder/app-shell route drift returned no matches in product, architecture, testing, development, and task-index docs.
  - Stale anchor grep for `#25-search-plugin` returned no matches.
- Progress note: `docs/implementation/progress.md` intentionally remains `[~]` for TASK-041; parent still owns release readiness, branch gate, final progress closeout, and merge.

## Final Test-Quality Hardening

- Gauss (`test_quality_reviewer`) confirmed DTO boundary and listitem coverage were resolved, but left two P2 test-quality gaps:
  - stale pending close coverage covered later resolve but not later reject;
  - static worker/FTS guard did not catch `SharedWorker`, `worker_threads`, service-worker patterns, or bare SQLite `MATCH`.
- Banach (`test-fix`) added test-only coverage in commit `a1a1fb0`.
- Changed file:
  - `src/test/search-overlay-results-route.test.tsx`.
- Coverage added:
  - pending Search closes through Cancel, then a later rejected `search.query` cannot reopen the dialog, open Search route, show stale alerts, or leak raw error text;
  - static no-worker/FTS guard now catches `SharedWorker`, `worker_threads`, service-worker APIs, `MATCH AGAINST`, and bare SQLite-style `MATCH`.
- Parent validation after Banach passed:
  - `bun run test:frontend -- src/test/search-overlay-results-route.test.tsx src/test/mui-shell-frame.test.tsx src/test/command-palette-quick-capture-dialog.test.tsx src/test/quick-capture-search-plugins.test.tsx` (4 files / 80 tests).
  - `bun run typecheck`.
  - `bun run lint`.
  - `git diff --check`.
  - Forbidden test API scan returned no matches.
- Sagan (`test_quality_reviewer`) confirmed no P0/P1/P2 test-quality findings remain after `a1a1fb0`.

## Release Readiness And Closeout

- Pascal (`release_checker`) found no release-readiness blockers.
- Branch gate:
  - `bun run check:quick` passed with TypeScript, ESLint, 45 frontend test files / 734 tests, Rust fmt, Rust clippy, and Rust tests.
  - `git diff --check master...HEAD` passed.
  - Docs/anchor checks returned no stale `#25-search-plugin` or stale Search deferred/placeholder app-shell route claims.
  - Native/package/Tauri/Rust/IPC/capability/permission/schema/release/native path scan returned no matches.
- `check:full` was not required because TASK-041 changed only TypeScript/React/MUI app-shell code, tests, and docs, with no package, lockfile, Tauri, Rust, IPC, capability, filesystem, schema, packaging, or release surface changes.
- Parent decision: mark TASK-041 `[x]`, commit progress closeout, merge to `master`, validate the merge result, then continue to TASK-042.
