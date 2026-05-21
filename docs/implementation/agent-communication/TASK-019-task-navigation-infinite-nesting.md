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

- Status: completed, committed, and closed.
- Feynman the 3rd (`test_writer`) wrote TASK-019 TDD tests.
- Ownership: test-only changes; likely `src/test/task-navigation-infinite-nesting.test.tsx` and narrow test helper changes only if necessary.
- Files changed:
  - `src/test/task-navigation-infinite-nesting.test.tsx`.
- Commit: `1d7219c` (`Feynman the 3rd(test)(Implement task navigation and infinite nesting): add navigation acceptance tests`).
- Requested red coverage: command-driven task open/navigation contract, unbound open, verified binding reuse, metadata-only attr-loss recovery, forged bound page rejection, nested page A -> page B flow, invalid/stale/non-task/duplicate source-block failure with no navigation, unsafe title inertness, storage/page-source consistency, and native/package/Tauri surface guard.
- Constraints: do not edit production implementation files, do not stage or commit, do not weaken existing tests.

### Red Test Signal

Parent verification:

```bash
bun run test:frontend -- src/test/task-navigation-infinite-nesting.test.tsx
bun node_modules/.bin/eslint src/test/task-navigation-infinite-nesting.test.tsx --max-warnings=0
bun run typecheck
git diff --check
```

Result: expected red signal. The focused TASK-019 test command failed with 7 failed / 2 passed tests. Failures showed missing `task.open-task-page` command (`COMMAND_NOT_FOUND`) and missing accessible task-title buttons for `A` and the unsafe title. ESLint for the new file, `bun run typecheck`, and `git diff --check` passed.

### Implementation Handoff

- Status: completed, committed, and closed.
- Agent: Gibbs the 3rd (`implementer`).
- Target: implement the minimum production behavior needed to satisfy the TASK-019 tests without broad save-time scanning.
- Files changed:
  - `src/plugins/task/plugin.ts`.
  - `src/plugins/markdown-editor/components/MarkdownPageEditor.tsx`.
- Commit: `ecebed7` (`Gibbs the 3rd(implementation)(Implement task navigation and infinite nesting): add task open navigation`).
- Summary:
  - Registered Task Plugin-owned `task.open-task-page`.
  - Shared the existing source-block resolver behavior so `task.resolve-task-block` and `task.open-task-page` both use the same transaction/source relation path.
  - `task.open-task-page` validates `{ sourcePageId, sourceBlockId }` and returns exactly `{ pageId }`.
  - Markdown editor can render task-title buttons from a structured body when task syntax extensions are present; clicking a button executes `task.open-task-page` and calls an injected `onOpenPage` callback with the resolved page id.
  - Task titles render as React text, not HTML or links.
- Validation:
  - `bun run test:frontend -- src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts` passed with 2 files / 23 tests.
  - `bun run test:frontend -- src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-page-persistence.test.tsx src/test/plugin-host-lifecycle.test.ts` passed with 3 files / 65 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - Native/package/Tauri surface diff from `master` returned no files.
- Original expected work:
  - Add/centralize a task-owned `task.open-task-page` command that validates `{ sourcePageId, sourceBlockId }`, reuses the TASK-018 resolver/source relation behavior, and returns exactly `{ pageId }`.
  - Expose an accessible task-title click path in the Markdown editor/plugin UI that calls the task open command with stable source page/block identity and invokes a supplied page-open callback with the returned page id.
  - Keep unsafe titles inert as text.
  - Keep App Shell generic and avoid exposing full runtime through `useRuntime()`.
  - Do not touch native/Tauri/package surfaces unless a blocker is recorded first.

### Review Round 1

- Status: completed.
- Agents:
  - Descartes the 3rd (`pr_explorer`): changed-surface explorer.
  - Epicurus the 3rd (`reviewer`): correctness review.
  - Aquinas the 3rd (`security_reviewer`): security review.
  - Ptolemy the 3rd (`deprecation_auditor`): API/deprecation audit.
  - Bernoulli the 3rd (`docs_researcher`): docs/current-guidance review.
  - Bacon the 3rd (`test_quality_reviewer`): test-quality review.

#### Review Findings

- P1 correctness/test-quality/API: loaded `pageId/pageFacade` editor mode cannot show task-title buttons. `MarkdownPageEditor` derives task buttons only from direct `props.page.body`, while the runtime Markdown page facade returns `id`, `title`, and `markdown` only. Normal loaded/persisted pages can therefore miss TASK-019 click navigation while direct-prop tests pass.
- P1 correctness: task open navigation has no stale async guard. `openStructuredTaskPage` awaits `task.open-task-page` and then unconditionally calls `onOpenPage`, so a slow open result from an old page/block could navigate after the user changes pages or edits content.
- P1 docs: product/architecture docs still describe task-title navigation as `page.open` / direct `boundPageId` navigation, conflicting with the implemented `task.open-task-page({ sourcePageId, sourceBlockId }) -> { pageId }` contract.
- P1 docs: product/development/architecture docs still present click navigation and infinite nesting as future/TASK-019-or-later behavior. They need to distinguish current TASK-019 explicit click/open behavior from still-deferred save-time scanning, filters/views, checkbox events, and rich editor work.
- P2 docs/testing: testing docs need TASK-019 coverage notes for `task.open-task-page`, structured-body task-title buttons, forged binding rejection, metadata-only recovery, nested A -> B open flow, and native/package/Tauri surface guard.
- P2 API/deprecation: Markdown Editor now hardcodes Task Plugin command/parsing semantics outside a declared plugin contract. This may be acceptable as an interim TASK-019 slice but should be documented or refactored if future plugin contracts change.
- P2 test-quality: the native-surface regression shells out to `git diff master` inside Vitest. It is useful as an orchestration guard but brittle in shallow clones or unrelated dirty worktrees.
- Low security hardening: malformed `attrs.boundPageId` currently blocks navigation instead of being treated as untrusted/absent, and command payload validation reads direct properties from unknown input.

#### Review Validation

- Correctness/test-quality/security agents ran focused checks including:
  - `bun run test:frontend -- src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts`.
  - `bun run test:frontend -- src/test/markdown-page-persistence.test.tsx src/test/markdown-editor-plugin-shell.test.tsx`.
  - `bun run test:frontend -- src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-page-persistence.test.tsx src/test/plugin-host-lifecycle.test.ts`.
  - `bun run typecheck`.
  - `bun run lint`.
  - `git diff --check master...HEAD`.
  - Native/package/Tauri surface diff scans; all returned no changed native/package/Tauri files.
  - Focused Rust IPC boundary/persistence checks from security review.

### Review-fix Test Handoff

- Status: completed, committed, and closed.
- Agent: Hypatia the 3rd (`test_writer`).
- Files changed:
  - `src/test/task-navigation-infinite-nesting.test.tsx`.
- Commit: `a2d3b4f` (`Hypatia the 3rd(test)(Implement task navigation and infinite nesting): add review-fix regressions`).
- Required red coverage:
  - Loaded/persisted editor path: render the registered editor with `pageId/pageFacade` or runtime Markdown page facade data containing a structured task body and verify task-title click navigation is available.
  - Stale async navigation guard: delay `task.open-task-page`, change page or content before it resolves, and assert old result does not call `onOpenPage`.
  - Consider adding low-risk hardening coverage for malformed `attrs.boundPageId` as untrusted/absent if test_writer can do so without broadening the loop.
  - Consider replacing or quarantining the brittle native-surface Vitest shell-out if a more stable repo-local boundary assertion is available.
- Result: added red tests for loaded `pageId/pageFacade` task-title navigation, stale delayed task-open navigation, and malformed `attrs.boundPageId` hardening. Parent verification showed expected red signal with 3 failed / 9 passed tests; `bun run typecheck` and `git diff --check` passed.

### Review-fix Implementation Handoff

- Status: completed, committed, and closed.
- Agent: Kuhn the 3rd (`implementer`).
- Files changed:
  - `src/plugins/task/plugin.ts`.
  - `src/core/runtime/markdown-pages.ts`.
  - `src/plugins/markdown-editor/components/MarkdownPageEditor.tsx`.
- Commit: `c5e5b65` (`Kuhn the 3rd(review-fix)(Implement task navigation and infinite nesting): harden loaded task navigation`).
- Summary:
  - Malformed `attrs.boundPageId` is treated as absent/untrusted instead of fatal.
  - `MarkdownEditorDocument` from the runtime Markdown page facade can carry structured body.
  - Loaded editor mode stores loaded/saved structured body and renders task-title buttons from it.
  - Delayed task-open results are ignored when page id or content version changed before resolution.
- Validation:
  - `bun run test:frontend -- src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts` passed with 2 files / 26 tests.
  - `bun run test:frontend -- src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-page-persistence.test.tsx src/test/plugin-host-lifecycle.test.ts` passed with 3 files / 65 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - Native/package/Tauri surface diff from `master` returned no files.

### Focused Re-review After Review-fix

- Status: completed.
- Agents:
  - Anscombe the 3rd (`reviewer`): focused correctness re-review.
  - Leibniz the 3rd (`test_quality_reviewer`): focused test-quality re-review.
  - Mendel the 3rd (`security_reviewer`): focused security/API re-review.
  - Dirac the 3rd (`docs_researcher`): focused docs re-review.

#### Focused Re-review Findings

- Prior correctness P1s are cleared: loaded `pageId/pageFacade` mode now propagates structured body into editor state, and delayed task-open results are guarded by page id and content version before `onOpenPage`.
- P1 test-quality: loaded editor regression mocks `pageFacade.load` to return a document with `body`, so it does not pin the real `createMarkdownPageRuntimeFacade().load()` body propagation. A regression dropping `body` from the runtime facade would leave TASK-019 tests green.
- P2 correctness: task buttons remain derived from the last structured body after unsaved textarea edits. Deleting or renaming `- [ ] A` in the textarea can leave the old `A` button enabled until save/reload.
- P2 test-quality: stale async navigation coverage covers page switching, but not the same-page content-edit stale path.
- P3 test-quality: native-surface shell-out inside Vitest remains brittle but non-blocking because `master` is the documented integration branch and the guard passed locally.
- Security/API: no remaining security/API blockers. Native/API surface remains empty. Remaining risk is accepted for now: command payload validation is adequate for the in-process command boundary but still accepts extra keys and direct object property reads.
- Docs P1/P2 remain: formal product/architecture/development/testing docs still need TASK-019 sync for `task.open-task-page`, explicit click/open behavior, loaded structured-body navigation, stale async guard, current/future boundary, and TASK-019 test guidance.

#### Second Review-fix Test Handoff

- Status: completed, committed, and closed.
- Agent: Huygens the 3rd (`test_writer`).
- Files changed:
  - `src/test/task-navigation-infinite-nesting.test.tsx`.
  - `src/test/markdown-page-persistence.test.tsx`.
- Commit: `22a83b8` (`Huygens the 3rd(test)(Implement task navigation and infinite nesting): cover runtime body and edit invalidation`).
- Required red coverage:
  - Runtime facade body propagation: use real `createMarkdownPageRuntimeFacade()` or an existing markdown page persistence helper to prove loaded documents include structured `body` from native DTOs.
  - Unsaved edit button invalidation: after editing/removing a task line in the textarea, stale task-title buttons should disappear or be disabled so old source blocks are not opened.
  - Same-page content-edit stale path: if a task open is delayed and the editor content changes before it resolves, the old result must not call `onOpenPage`.
  - Keep native-surface shell-out unchanged unless a test-only improvement is straightforward.
- Result: real runtime facade body propagation and same-page content-edit stale navigation tests passed against current implementation; unsaved edit invalidation produced the expected red failure. Parent verification: `bun run test:frontend -- src/test/task-navigation-infinite-nesting.test.tsx src/test/markdown-page-persistence.test.tsx` failed with 1 failed / 21 passed tests; `bun run typecheck` and `git diff --check` passed.

#### Second Review-fix Implementation Handoff

- Status: completed, committed, and closed.
- Agent: Wegener the 3rd (`implementer`).
- Files changed:
  - `src/plugins/markdown-editor/components/MarkdownPageEditor.tsx`.
- Commit: `0a4b5cc` (`Wegener the 3rd(review-fix)(Implement task navigation and infinite nesting): invalidate stale task buttons`).
- Summary: task-title buttons render only while current textarea Markdown still matches the structured body snapshot they were derived from; unsaved edits that remove or rename source tasks hide stale task buttons while loaded body propagation and async stale guards remain intact.
- Validation:
  - `bun run test:frontend -- src/test/task-navigation-infinite-nesting.test.tsx src/test/markdown-page-persistence.test.tsx` passed with 2 files / 22 tests.
  - `bun run test:frontend -- src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts` passed with 2 files / 28 tests.
  - `bun run test:frontend -- src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-page-persistence.test.tsx src/test/plugin-host-lifecycle.test.ts` passed with 3 files / 66 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - Native/package/Tauri surface diff from `master` returned no files.

### Final Focused Re-review

- Status: completed.
- Agents:
  - Kant the 3rd (`reviewer`): final focused correctness re-review.
  - Hilbert the 3rd (`test_quality_reviewer`): final focused test-quality re-review.
  - Beauvoir the 3rd (`security_reviewer`): final focused security/API re-review.

#### Final Focused Re-review Findings

- Kant the 3rd found no P0/P1/P2/P3 correctness findings. Verified:
  - Real runtime facade load path returns structured body.
  - Loaded `pageId/pageFacade` editor path renders task navigation from loaded body.
  - Stale delayed task-open results are guarded for page switches and same-page edits.
  - Unsaved edits invalidate stale task-title buttons.
  - Malformed `attrs.boundPageId` is treated as absent.
  - TASK-018 resolver behavior remains intact through shared `resolveTaskPage`.
- Hilbert the 3rd found no P0/P1/P2 test-quality findings. Remaining P3/non-blocking: native-surface shell-out inside Vitest is branch/git-environment coupled, but `master` is the documented integration branch and the guard passed locally.
- Beauvoir the 3rd found no P0/P1/P2 security/API findings. Verified:
  - Unsafe task titles render as React text, not HTML or links.
  - UI sends only `{ sourcePageId, sourceBlockId }` and navigates only to validated `{ pageId }`.
  - Stale navigation and unsaved edit guards are in place.
  - `useRuntime`, App Shell, NativeBridge, package, Cargo, Tauri config/capability/permission surfaces remain unchanged.

#### Final Focused Re-review Checks

- `bun run test:frontend -- src/test/task-navigation-infinite-nesting.test.tsx src/test/markdown-page-persistence.test.tsx src/test/task-plugin-syntax-page-creation.test.ts src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts src/test/core-command-registry.test.ts` passed with 6 files / 111 tests.
- `bun run test:frontend -- src/test/task-navigation-infinite-nesting.test.tsx src/test/markdown-page-persistence.test.tsx src/test/task-plugin-syntax-page-creation.test.ts` passed with 3 files / 36 tests.
- `bun run test:frontend -- src/test/app-shell-boundary.test.ts src/test/native-bridge.test.ts src/test/runtime-provider.test.tsx` passed with 3 files / 29 tests.
- `bun run typecheck` passed.
- `bun run lint` passed.
- `cargo test --manifest-path src-tauri/Cargo.toml --test ipc_boundary` passed.
- `git diff --check master...HEAD` passed.
- Native/package/Tauri surface diff from `master` returned no files.
- No `.skip`, `.only`, or `.todo` tests were found under `src/test`.

### Docs Sync Handoff

- Status: completed by docs sync writer on 2026-05-21 13:46 CST.
- Required docs sync:
  - Replace direct `page.open` / direct `attrs.boundPageId` navigation descriptions with TASK-019's command-driven contract: task-title click -> `task.open-task-page({ sourcePageId, sourceBlockId })` -> `{ pageId }` -> shell/editor callback opens returned page id.
  - Move explicit task-title click/open navigation out of future-only wording while keeping automatic save-time scanning/indexing, checkbox events, filters/views, Tag/Timer UI, and rich editor work as future.
  - Document `task.open-task-page` as an implemented current Task Plugin command; remove stale `task.open_task_page`.
  - Document loaded `pageId/pageFacade` editor mode carrying structured body, task-title buttons derived from structured body, stale delayed open results being ignored after page/content changes, and unsaved edits invalidating stale task buttons.
  - Add TASK-019 testing guidance for command payload/return contract, verified/metadata-only/malformed/forged bindings, nested A -> B flow, loaded editor path, stale guards, unsafe title inertness, and native/package/Tauri surface guard.
- Files updated:
  - `docs/product/04-editor-and-workflows.md`.
  - `docs/product/05-built-in-plugins.md`.
  - `docs/architecture/04-slots-editor-task.md`.
  - `docs/architecture/07-runtime-flows.md`.
  - `docs/development/02-implementation-roadmap-and-constraints.md`.
  - `docs/testing/strategy.md`.
  - `docs/implementation/agent-communication/status.md`.
  - `docs/implementation/agent-communication/TASK-019-task-navigation-infinite-nesting.md`.
- Outcome:
  - Product, architecture, development, and testing docs now describe TASK-019 explicit task-title click/open navigation as current behavior.
  - Docs now use `task.open-task-page({ sourcePageId, sourceBlockId }) -> { pageId }` and avoid direct `page.open` / direct `boundPageId` navigation claims in current TASK-019 contracts.
  - Docs now call `attrs.boundPageId` verified/recovered source binding data, not a trusted navigation target; malformed values are untrusted/absent.
  - Docs now preserve deferred scope for automatic editor-save scanning/indexing, checkbox toggle/events, filters/views, Tag/Timer UI, rich editor behavior, and native/Tauri/package surfaces.
- Validation:
  - `git diff --check` passed.
  - Focused stale searches over `docs/product`, `docs/architecture`, `docs/development`, and `docs/testing` found no remaining `page.open` or `task.open_task_page` wording.
  - Remaining `boundPageId` hits are source-binding, verification, or explicit "not a navigation target" notes, not direct navigation claims.
  - Remaining TASK-019/deferred wording keeps only automatic save-time scanning/indexing, checkbox toggle/events, filters/views, Tag/Timer UI, rich editor behavior, and native/Tauri/package surfaces in future scope.

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
