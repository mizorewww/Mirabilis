# TASK-019 Agent Communication - Task Navigation and Infinite Nesting

## Task

- Task ID: TASK-019.
- Task name: Implement task navigation and infinite nesting.
- Branch: `feat/task-019-task-navigation-infinite-nesting`.
- Parent role: orchestration only.
- Started: 2026-05-21 12:48 CST.

## Acceptance Criteria

- Clicking task text opens the bound task page.
- Task pages are normal Markdown pages that can contain more tasks.
- Nested tasks create their own task pages using the same mechanism.
- Parent/source relationships remain queryable through metadata.

## Initial Scope

- Build on TASK-018's built-in `TaskPlugin`, `task.resolve-task-block`, `attrs.boundPageId`, and task metadata relation.
- Use command-driven user actions through the Command Registry.
- Keep Core business-logic-free; navigation and nesting UX should live in plugin/runtime/editor/App Shell-facing surfaces.
- Preserve normal Markdown Page behavior for created task pages.

## Initial Out Of Scope

- Checkbox toggle and `- [x]` behavior.
- `task.completed` / `task.reopened` events.
- All Tasks / Today filters.
- Tag Plugin parsing.
- Metadata UI.
- Timer, calendar, stats, sync, ML, AI, and release packaging.
- New Tauri commands, capabilities, filesystem/native import-export, package/Cargo dependencies, or Rust persistence changes unless agents identify a hard acceptance dependency.

## Source Docs

- `docs/implementation/task-index.md#task-019-implement-task-navigation-and-infinite-nesting`.
- `docs/product/01-vision-and-core.md#任务可无限嵌套的-markdown-first-时间管理系统开发文档`.
- `docs/product/04-editor-and-workflows.md#113-任务无限嵌套`.
- `docs/architecture/07-runtime-flows.md#182-用户点击任务文字`.
- `docs/development/02-implementation-roadmap-and-constraints.md` TASK-018/TASK-019 boundary notes.

## Parent Decisions

- Select TASK-019 because it is the first unblocked `[ ]` task after TASK-018 completed and merged.
- Use branch `feat/task-019-task-navigation-infinite-nesting`.
- Keep parent orchestration-only per user instruction.
- Run pre-test guidance before delegating test writing because the task touches React/editor/runtime/plugin command flows.

## Agent Outcomes

### Test Writer Handoff

- Feynman the 3rd (`test_writer`) started TASK-019 TDD work.
- Ownership: test-only changes; likely `src/test/task-navigation-infinite-nesting.test.tsx` and narrow test helper changes only if necessary.
- Requested red coverage: command-driven task open/navigation contract, unbound open, verified binding reuse, metadata-only attr-loss recovery, forged bound page rejection, nested page A -> page B flow, invalid/stale/non-task/duplicate source-block failure with no navigation, unsafe title inertness, storage/page-source consistency, and native/package/Tauri surface guard.
- Constraints: do not edit production implementation files, do not stage or commit, do not weaken existing tests.

### Pre-test Guidance

- Jason the 3rd (`planner`) completed read-only planning.
  - Recommended slice: click-driven task navigation, not broad save-time indexing.
  - Acceptance interpretation: clicking task text resolves `{ sourcePageId, sourceBlockId }` through TASK-018's resolver behavior before opening the returned page; task pages remain ordinary Markdown pages; nested tasks prove the same mechanism by creating page B from a task block inside page A; queryable source relationships stay in `task.sourcePageId` and `task.sourceBlockId`.
  - Test guidance: add focused tests for visible task-title click, verified existing binding reuse, unbound nested task creation/open, metadata queryability, resolver failure with no navigation, and unsafe title text as inert data.
- Avicenna the 3rd (`docs_researcher`) completed local/current docs guidance.
  - Recommended failing surface: click navigation or a task-owned open command, because a test that directly invokes `task.resolve-task-block` for nested pages may already pass after TASK-018.
  - Suggested contract: `task.open-task-page` can accept `{ sourcePageId, sourceBlockId }`, create or reuse the task page through the existing source relation, and return `{ pageId }`.
  - Testing guidance: use Testing Library `userEvent`, role queries, `findByRole` / `waitFor`, and `vi.fn`; avoid line-coordinate textarea clicks. Avoid `react-dom/test-utils` `act`, `react-test-renderer`, shallow rendering, and config churn.
  - Official docs consulted: React `useEffect`, `useTransition`, state reset with keys, React test-utils deprecation, Testing Library `user-event`, role and async queries, Vitest jsdom/mocks, and Vite 7 Node support.
- Galileo the 3rd (`deprecation_auditor`) completed read-only API/deprecation audit.
  - P1 guidance: `page.open` is documented but not implemented, so tests must define the open command contract if TASK-019 uses it.
  - P1 guidance: `MarkdownPageEditor` currently holds markdown text, not block attrs or `boundPageId`; do not bolt navigation onto raw textarea text without a tested block-id/source relation path.
  - P1 guidance: storage is split between in-memory Core/plugin pages and the NativeBridge-backed Markdown page facade; any opened page must be loadable from the same page source the shell/editor routes to, or the task must explicitly remain in-memory.
  - P1 guidance: encode the selected explicit resolver-on-click behavior instead of ambiguous automatic save scanning.
  - Required contract tests: `page.open` if used, task-title click, unbound click, attr-loss durability, nested task page, storage consistency, and native-surface guard.
  - External docs verified: React 19 `createRoot` / StrictMode / upgrade deprecations, Vite 7 migration, Vitest 4 / React Testing Library, and Tauri v2 invoke/capabilities/migration guidance.
- Archimedes the 3rd (`security_reviewer`) completed pre-test security guidance.
  - P1 guidance: do not trust `attrs.boundPageId` directly for navigation; use `{ sourcePageId, sourceBlockId }` through command-driven resolution before opening a page.
  - P1 guidance: do not query or trust raw runtime metadata from app/editor code unless ownership filtering is preserved; Plugin Host metadata facades already enforce `sourcePluginId`.
  - P1 guidance: App Shell must remain generic; do not import Task Plugin internals or add task business parsing to `src/App.tsx`.
  - P1 guidance: do not widen `useRuntime()` to expose stores, commands, pluginHost, NativeBridge, or registries.
  - Test guidance: forged `boundPageId`, metadata-only recovery, same block ID on different pages, nested flow, unsafe titles, invalid/stale blocks, App Shell boundary scan, and native-surface diff.

## Parent Decisions After Pre-test Guidance

- TASK-019's initial implementation target is explicit click/open resolution, not automatic editor-save scanning.
- Tests should require task navigation to use command-driven resolution by `{ sourcePageId, sourceBlockId }` before opening the returned page.
- A task-owned open command such as `task.open-task-page` may be the narrow contract for resolving and returning `{ pageId }`. A generic `page.open` command or App Shell callback may be added only as a validated app-owned navigation primitive; it must not parse task syntax or trust raw task attrs.
- Tests should make the current in-memory page source explicit and catch any mismatch between pages created by Task Plugin commands and pages that navigation opens.
- App Shell, if touched, may own only generic page navigation state. It must not expose full runtime through `useRuntime()` or directly import Task Plugin implementation modules.

## Validation Log

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK; non-blocking notes were the known `TERM=dumb` terminal failure and an available Codex update.
