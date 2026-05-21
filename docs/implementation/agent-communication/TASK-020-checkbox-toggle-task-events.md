# TASK-020 Agent Communication - Checkbox Toggle And Task Events

## Task

- Task ID: TASK-020.
- Task name: Implement checkbox toggle and task events.
- Branch: `feat/task-020-checkbox-toggle-task-events`.
- Parent role: orchestration only.
- Started: 2026-05-21 13:58 CST.

## Source Docs Read By Parent

- `.codex/skills/mirabilis-dev-runner/SKILL.md`.
- `docs/implementation/progress.md`.
- `docs/implementation/task-index.md#task-020-implement-checkbox-toggle-and-task-events`.
- `docs/product/05-built-in-plugins.md#163-点击逻辑`.
- `docs/development/02-implementation-roadmap-and-constraints.md#204-所有跨插件协作走-event--metadata--query`.
- `docs/development/02-implementation-roadmap-and-constraints.md` Phase 3 boundary notes.
- `docs/architecture/07-runtime-flows.md#181-用户输入任务`.
- `docs/architecture/04-slots-editor-task.md#9-task-plugin-代码架构`.
- Related command/event examples in `docs/product/02-core-data-model.md` and `docs/product/03-plugin-platform.md`.

## Initial Scope

- Implement the checkbox/status slice after TASK-018/TASK-019.
- Acceptance criteria:
  - Clicking checkbox toggles task status.
  - Status changes update task metadata.
  - Completion writes a `task.completed` event.
  - Reopening or unchecking behavior is defined and tested.
- Test plan from task index:
  - Task Plugin tests for toggle command, metadata update, and event write.
  - UI behavior test for checkbox interaction.

## Initial Out Of Scope

- Automatic editor-save scanning/indexing.
- All Tasks / Today filters and task list views.
- Tag Plugin parsing or metadata UI.
- Timer/Calendar behavior, except preserving event contracts other plugins can later listen to.
- Rich editor migration, Tiptap/ProseMirror adaptation, or broad Markdown AST work.
- New Tauri commands/capabilities, filesystem/native behavior, package/Cargo dependencies, packaging, or release work.

## Known Risks For Agents

- Command naming is inconsistent in docs:
  - `docs/product/05-built-in-plugins.md` mentions `task.toggle_status`.
  - `docs/development/02-implementation-roadmap-and-constraints.md` mentions `task.toggle-status`.
  - `docs/product/03-plugin-platform.md` mentions `task.toggle_checkbox`.
- Current implemented Task Plugin commands are kebab-case: `task.resolve-task-block` and `task.open-task-page`.
- TASK-018 resolver currently treats `- [x]` as out of scope and accepts only unchecked task syntax for page creation/opening. TASK-020 must define whether completed source syntax is valid for an already resolved task and how source Markdown, metadata, and events stay consistent.
- The editor currently renders structured-body task title buttons, not checkbox controls. UI behavior must preserve unsafe-title inertness and stale async/content guards established in TASK-019.
- Event writes must use Core Event Store/plugin-facing APIs without putting task business behavior into Core.

## Parent Start Decision

- Select TASK-020 because it is the first unblocked `[ ]` task after TASK-019 completed and merged.
- Start from `master` at merge commit `7a2ce72`.
- Use branch `feat/task-020-checkbox-toggle-task-events`.
- Delegate planning, current-doc guidance, deprecation/API review, security review, tests, implementation, review, and docs sync to agents.

## Agent/Config Validation

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK.
- Non-blocking notes: unrestricted sandbox/network, known `TERM=dumb` terminal failure, and available Codex update.

## Pre-test Guidance

### Ohm the 3rd - Planner

- Status: completed read-only planning; no files edited, staged, committed, or pushed.
- Recommended TASK-020 scope:
  - Task Plugin command.
  - Metadata/event/source-block update.
  - Narrow Markdown editor checkbox UI beside the existing TASK-019 task-title open flow.
- Out of scope:
  - Automatic save-time scanning/indexing.
  - Filters/views, tag parsing, metadata bar, timer reactions.
  - Rich editor migration.
  - Native/Tauri/package/Cargo changes.
- Recommended contract:
  - Command ID: `task.toggle-status`.
  - Input: `{ sourcePageId, sourceBlockId }`.
  - Output: `{ pageId, status }`, with `status` as `todo | done`.
  - Metadata: update `task.status`; preserve/write `task.enabled`, `task.sourcePageId`, and `task.sourceBlockId`.
  - Events: append page-bound `namespace: "task", type: "completed" | "reopened"` with Plugin Host-injected `sourcePluginId: "task"`.
  - Source Markdown: toggle source block marker between `- [ ] title` and `- [x] title` in the same transaction as metadata and event writes.
- Recommended TDD:
  - Plugin/runtime tests for command registration, complete/reopen, binding reuse/recovery, forged/malformed binding rejection, invalid/stale/non-task/fenced/duplicate cases with no mutation, and rollback on event failure.
  - UI tests for structured-body checkbox rendering, source-only command payload, no navigation on checkbox click, stale delayed toggle guard, and unsafe title inertness.

### Turing the 3rd - Docs Researcher

- Status: completed read-only current-doc/test guidance; no files edited, staged, committed, pushed, or tests run.
- Recommended contract:
  - Use `task.toggle-status`; treat `task.toggle_status` and `task.toggle_checkbox` docs as drift to fix later.
  - Payload: `{ sourcePageId: string; sourceBlockId: string }`.
  - Result: exact small result such as `{ pageId: string; status: "todo" | "done" }`.
  - Toggle should resolve/reuse the task page through the existing source relation path, then mutate source Markdown, metadata, and event inside one transaction.
- Recommended semantics:
  - Unchecked `- [ ] A` toggles to `- [x] A`, sets `task.status = "done"`, and appends `task.completed`.
  - Checked `- [x] A` toggles to `- [ ] A`, sets `task.status = "todo"`, and appends `task.reopened`.
  - Read both `[x]` and `[X]`; write normalized lowercase `[x]`.
  - Preserve blockId, attrs, indentation up to three spaces, and unsafe title text; replace only the checkbox marker.
- UI guidance:
  - Prefer real `<input type="checkbox">` with accessible name from task title.
  - Query with role and checked state, for example `findByRole("checkbox", { name: "A", checked: false })`.
  - Assert the UI sends only `{ sourcePageId, sourceBlockId }`.
  - Add stale async coverage parallel to TASK-019.
- External docs checked:
  - React 19 Responding to Events and controlled checkbox input docs.
  - Testing Library/user-event v14 intro, click convenience API, ByRole checked filter, and async methods.
  - Vitest async testing and mock function docs.

### Poincare the 4th - Deprecation/API Auditor

- Status: completed read-only API/deprecation guidance; no files edited, staged, committed, or pushed.
- P0 guidance:
  - Use only `task.toggle-status`; do not register `task.toggle_status` or `task.toggle_checkbox` aliases.
  - Use source identity input and never UI-provided `pageId` or `attrs.boundPageId`.
  - Store events with Core namespace/type split: `namespace: "task", type: "completed" | "reopened"`; do not store `type: "task.completed"`.
- P1 guidance:
  - Reuse TASK-018/TASK-019 source relation checks: unique top-level `markdown.line`, not fenced code, not malformed, verified metadata relation before trusting bound attrs.
  - Keep source Markdown marker, `task.status`, and event append atomic through plugin transaction APIs.
  - Define status vocabulary as `todo | done`.
  - UI checkbox must call `commands.execute("task.toggle-status", { sourcePageId, sourceBlockId })`, preserve stale-result guards, and hide/disable controls when textarea Markdown no longer matches the structured body snapshot.
- P2 guidance:
  - Prefer camelCase event payload fields such as `taskPageId`, `sourcePageId`, `sourceBlockId`, `previousStatus`, and `status`.
  - Use event `createdAt` as completion/reopen time unless a future product task adds dedicated completed-at metadata.
  - Keep TASK-020 off native/package surfaces.
  - Avoid deprecated `react-dom/test-utils`; continue using RTL and `userEvent.setup()`.
- External docs checked:
  - Tauri v2 API/migration and permissions docs.
  - React 19 upgrade/act docs.
  - Vite 7 docs.
  - Vitest 4 migration docs.
  - Testing Library user-event v14 docs.

### Arendt the 4th - Security Reviewer

- Status: completed read-only security guidance; no files edited, staged, committed, or pushed.
- P0/P1 blockers: none.
- Required boundaries:
  - Toggle remains a Task Plugin command, not Core or native logic.
  - Payload is only `{ sourcePageId, sourceBlockId }`.
  - Do not accept or trust caller-supplied `taskPageId`, `boundPageId`, `status`, `title`, event type, timestamps, or metadata values.
  - Re-read and verify current source block at command time.
  - Never navigate or mutate from `attrs.boundPageId` alone.
  - Metadata and events must go through plugin/transaction facades so `sourcePluginId` is host-injected and ownership-checked.
  - Event writes use `namespace: "task"` and fixed `type: "completed" | "reopened"`.
  - UI checkbox interactions need TASK-019-style stale guards.
  - Unsafe titles remain inert React text; no `dangerouslySetInnerHTML`, links, or Markdown rendering from task titles.
  - No Tauri commands, capabilities, permissions, packages, Cargo dependencies, filesystem access, or NativeBridge methods.
- Required tests:
  - Owned `task.toggle-status` registration.
  - Malformed payload and caller-supplied trusted-field rejection.
  - Complete/reopen metadata and events with `sourcePluginId: "task"`.
  - Forged/malformed `attrs.boundPageId` cannot choose the task page.
  - Invalid source cases fail without page/metadata/event mutation.
  - Transaction rollback keeps source text/status/event together.
  - UI sends only source identity and ignores stale delayed results.
  - Unsafe task titles remain inert.
  - Native/package surface guard remains empty.

## Parent Decisions After Pre-test Guidance

- Canonical command ID: `task.toggle-status`.
- Do not add aliases for stale docs names `task.toggle_status` or `task.toggle_checkbox`.
- Command input: `{ sourcePageId, sourceBlockId }`.
- Command result: `{ pageId, status }`, with `status` as `todo | done`.
- Completion behavior:
  - `- [ ] A` -> `- [x] A`.
  - `task.status = "done"`.
  - Append `namespace: "task", type: "completed"`.
- Reopen behavior:
  - `- [x] A` or `- [X] A` -> `- [ ] A`.
  - `task.status = "todo"`.
  - Append `namespace: "task", type: "reopened"`.
- Event payload should be JSON/camelCase and source-owned: `taskPageId`, `sourcePageId`, `sourceBlockId`, `previousStatus`, and `status`.
- Source Markdown marker, metadata update, and event append must happen in one plugin transaction.
- UI checkbox tests must use accessible checkbox semantics and preserve TASK-019 stale guards.

## Test Writer Handoff

- Status: completed by Turing the 4th (`test_writer`) on 2026-05-21 14:16 CST.
- Files changed:
  - `src/test/task-checkbox-toggle-events.test.tsx`.
- Commit: `c9c0c33` (`Turing the 4th(test)(Implement checkbox toggle and task events): add checkbox toggle acceptance tests`).
- Coverage added:
  - Canonical `task.toggle-status` command registration and no stale aliases.
  - Complete/reopen source marker behavior.
  - `task.status` metadata update.
  - `task.completed` and `task.reopened` events.
  - CamelCase event payload: `taskPageId`, `sourcePageId`, `sourceBlockId`, `previousStatus`, `status`.
  - Forged `attrs.boundPageId` not trusted.
  - Atomic rollback when event append fails.
  - UI checkbox behavior: real accessible checkbox, source-only payload, title-open behavior preserved, stale page-switch/edit guards, unsafe title inertness.
  - Native/package/Tauri surface guard.
- Validation:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx
bun run typecheck
git diff --cached --check
```

- Result: expected red signal. The focused test file ran 11 tests with 8 failed / 3 passed. Failures were missing `task.toggle-status` (`COMMAND_NOT_FOUND`) and missing checkbox UI (`Unable to find role="checkbox"`). `bun run typecheck` passed. `git diff --cached --check` passed.
- Test writer concern: UI coverage focuses on direct structured editor mode plus stale guards; it does not add separate loaded `pageId/pageFacade` checkbox coverage because TASK-019 already pins the loaded structured-body path.

## Initial Implementation Handoff

- Status: completed by Ampere the 4th (`implementer`) on 2026-05-21 14:22 CST.
- Files changed:
  - `src/plugins/task/plugin.ts`.
  - `src/plugins/markdown-editor/components/MarkdownPageEditor.tsx`.
- Summary:
  - Registered `task.toggle-status`.
  - Added source-identity payload validation.
  - Added complete/reopen status handling, source marker updates, task metadata updates, and `task.completed` / `task.reopened` event writes.
  - Added editor checkbox controls and stale-result guards.
- Validation reported by Ampere and rerun by parent:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts
bun run typecheck
bun run lint
git diff --check
git diff --name-only master -- package.json bun.lock src-tauri/Cargo.lock src-tauri/Cargo.toml src-tauri/build.rs src-tauri/capabilities src-tauri/permissions src-tauri/src/commands src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tauri.conf.json
```

- Result: focused tests passed with 3 files / 39 tests. `bun run typecheck`, `bun run lint`, and `git diff --check` passed. Native/package/Tauri surface diff was empty.
- Parent decision: do not commit the implementation yet because focused review found P1/P2 issues that need TDD review-fix coverage first.

## Focused Review Findings

### Avicenna the 4th - Correctness Reviewer

- Status: completed read-only review; no files edited.
- Checks run:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts
bun run typecheck
```

- Result: passed with 3 files / 39 tests; typecheck passed.
- Findings:
  - P1: successful checkbox toggles make task controls disappear because the editor updates only `markdown`, not the structured `body` snapshot. On the next render, `readCurrentStructuredBody` rejects the old body and `collectStructuredTasks` returns no controls, so the user cannot immediately reopen/uncheck after a successful toggle.
  - P2: completed task lines lose title-open behavior. The editor only renders the open button for todo tasks, and `task.open-task-page` still accepts only unchecked syntax even though TASK-020 introduces `- [x]` as a valid task state.

### Laplace the 4th - Test Quality Reviewer

- Status: completed read-only review; no files edited.
- Checks run:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx
```

- Result: passed with 1 file / 11 tests.
- Findings:
  - P1: the successful UI toggle test asserts textarea Markdown becomes `- [x] A` but does not assert the checkbox remains rendered and checked afterward.
  - P1: tests only cover direct `page` props; there is no loaded `pageId/pageFacade` checkbox coverage.
  - P2: invalid coverage is limited to malformed/untrusted payloads and should add valid-shaped missing source block, duplicate block IDs, non-`markdown.line`, malformed checkbox, empty title, and fenced-code cases.
  - P2: the native-surface guard shells out to `git diff master` from a frontend test; it is brittle but acceptable as a temporary task-scope guard.

## Parent Decisions After Focused Review

- Add review-fix tests before changing implementation.
- Required P1 tests:
  - Successful direct-mode checkbox toggle leaves a checked checkbox rendered so the user can reopen immediately.
  - Loaded `pageId/pageFacade` mode can load a structured task, toggle it through source-only payload, update Markdown, and leave the checked checkbox visible.
- Required P2 tests:
  - Completed task title remains openable through `task.open-task-page`.
  - Valid-shaped invalid source cases fail without page/metadata/event/source mutation: missing source block, duplicate block IDs, non-`markdown.line`, malformed checkbox line, empty title, and fenced-code task-looking line.

## Review-fix Test Handoff

- Status: completed by Noether the 4th (`test_writer`) on 2026-05-21 14:34 CST.
- Files changed:
  - `src/test/task-checkbox-toggle-events.test.tsx`.
- Commit: `0b7874b` (`Noether the 4th(test)(Implement checkbox toggle and task events): add review-fix regressions`).
- Coverage added:
  - Direct-mode toggle keeps a checked checkbox visible and immediately reopenable.
  - Loaded `pageId/pageFacade` mode loads a structured task, toggles with `{ sourcePageId, sourceBlockId }`, updates Markdown, and keeps the checked checkbox visible.
  - Completed task title remains openable through `task.open-task-page` with source-only payload.
  - Valid-shaped invalid source cases reject without page/metadata/event/source mutation: missing block, duplicate block IDs, non-`markdown.line`, malformed checkbox, empty title, fenced-code task-looking line.
- Validation:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx
bun run typecheck
git diff --check
```

- Result: expected red signal. The focused test file ran 15 tests with 3 failed / 12 passed. Failures were the checked checkbox disappearing after direct toggle, the checked checkbox disappearing after loaded-mode toggle, and completed task title button missing for `- [x] A`. `bun run typecheck` passed. `git diff --check` passed.
- Test writer concern: the invalid-source rollback test is green against the current implementation, so it adds regression coverage but does not provide a red signal. The P1 UI regressions and P2 completed-title open regression fail as expected.

## Review-fix Implementation Result

- Status: completed by Hooke the 4th (`implementer`) on 2026-05-21 14:41 CST.
- Files changed:
  - `src/plugins/task/plugin.ts`.
  - `src/plugins/markdown-editor/components/MarkdownPageEditor.tsx`.
- Summary:
  - Added canonical `task.toggle-status` command.
  - Added source-only payload validation for toggle.
  - Added atomic task status toggle behavior: source marker update, task metadata update, and `task.completed` / `task.reopened` event append.
  - Added accessible task checkbox controls in the editor.
  - Updated editor state so successful toggles update both Markdown and structured body, keeping controls rendered for immediate reopen.
  - Kept completed task title buttons openable.
  - Allowed `task.open-task-page` to open checked task lines only when an existing verified/metadata source relation resolves them; unchecked resolver/page-creation behavior remains unchanged.
- Validation:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts
bun run typecheck
bun run lint
git diff --check
git diff --name-only master -- package.json bun.lock src-tauri/Cargo.lock src-tauri/Cargo.toml src-tauri/build.rs src-tauri/capabilities src-tauri/permissions src-tauri/src/commands src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tauri.conf.json
```

- Result: all passed or clean. Focused tests passed with 3 files / 43 tests. `bun run typecheck` passed. `bun run lint` passed. `git diff --check` passed. Native/package/Tauri surface diff was empty.
- Remaining concern: none known in the requested TASK-020 scope before focused review.

## Focused Review Round

### Gauss the 4th - Changed Surface Explorer

- Status: completed read-only changed-surface exploration.
- Changed files from `master...HEAD`:
  - `src/plugins/task/plugin.ts`.
  - `src/plugins/markdown-editor/components/MarkdownPageEditor.tsx`.
  - `src/test/task-checkbox-toggle-events.test.tsx`.
  - `docs/implementation/agent-communication/TASK-020-checkbox-toggle-task-events.md`.
  - `docs/implementation/agent-communication/status.md`.
  - `docs/implementation/progress.md`.
- Native/package/Tauri surface: no changed files.
- Hotspots:
  - Initially checked unresolved tasks: toggle can create/reopen but open refuses unresolved checked lines.
  - Rapid repeated checkbox toggles before the first command resolves.
  - UI duplicates task title text as checkbox label and open button.
  - Editor reconstructs Markdown locally from structured snapshot after command success.
  - Agent communication status was stale after implementation commit.

### Sagan the 4th - Correctness Reviewer

- Status: completed read-only correctness review.
- Checks run:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts
bun run typecheck
bun run lint
git diff --check master...HEAD
```

- Result: focused tests passed with 3 files / 43 tests. Typecheck, lint, and diff check passed. Native/package/Tauri surface diff was empty.
- Findings:
  - P2: task title click semantics are split across two visible title copies. The checkbox label contains the task title, so clicking that visible title toggles status; a second duplicated title button opens the page. Product docs specify checkbox click completes and task text click opens.
  - P2: rapid repeated checkbox toggles can desync UI from committed task state. While a toggle command is in flight, the checkbox remains enabled and a later committed toggle result can be ignored by the stale guard after the first result updates local Markdown/version.

### Franklin the 4th - Test Quality Reviewer

- Status: completed read-only test-quality review.
- Finding: no P0/P1/P2 test-quality findings.
- P3: native-surface guard shells out to `git diff master`; useful for task-scope discipline but branch/environment coupled.
- Checks run:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts
```

- Result: passed with 3 files / 43 tests.

### Archimedes the 4th - Security Reviewer

- Status: completed read-only security review.
- Finding: no P0/P1/P2 security findings.
- P3: existing `task.resolve-task-block` / `task.open-task-page` input readers still accept extra fields, unlike the strict toggle reader; ignored extra fields are not trusted.
- Checks run:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml --all-features ipc_boundary
cargo test --manifest-path src-tauri/Cargo.toml --all-features ipc_capabilities_are_narrow_and_review_db_command_exposure
git diff --check master...HEAD
```

- Result: all passed or clean. Native/package/Tauri surface diff returned no changed files.

### Planck the 4th - API/Deprecation Auditor

- Status: completed read-only API/deprecation audit.
- Findings:
  - P1 docs: local docs still publish stale aliases and one wrong payload: `task.toggle_status`, `task.toggle_checkbox`, and `task.toggle-status` with `{ pageId }`.
  - P2 behavior/docs: checked-task open behavior is under-specified. Current editor renders checked tasks as openable, but `task.open-task-page` throws for an unresolved checked source line without an existing verified/metadata relation.
  - P2 docs: broader product/architecture docs still say checkbox toggle/events are not implemented.
- Clean areas:
  - No deprecated React test-utils usage.
  - React controlled checkbox and RTL/user-event patterns are current.
  - Tauri/package surface is clean.

## Parent Decisions After Focused Review

- Add review-fix tests first.
- Task title interaction: the visible task title should be the open affordance. Checkbox remains a real accessible checkbox but should not duplicate the visible title text or make clicking the task title toggle status.
- Rapid repeated toggles: while a toggle for a source block is pending, further checkbox toggles for that same control should be disabled or ignored so UI cannot desync from committed command state.
- Checked task open: `task.open-task-page` should create/bind/open an unresolved checked task as a normal task page with `task.status = "done"` and no completion/reopen event. `task.resolve-task-block` remains unchecked-only.
- Docs P1/P2 drift will be handled by a docs sync agent after behavior fixes and focused review pass.

## Second Review-fix Test Handoff

- Status: completed by Newton the 4th (`test_writer`) on 2026-05-21 14:55 CST.
- Files changed:
  - `src/test/task-checkbox-toggle-events.test.tsx`.
- Commit: `2134c16` (`Newton the 4th(test)(Implement checkbox toggle and task events): cover focused interaction regressions`).
- Coverage added:
  - Visible task title appears once as the open button; checkbox remains accessible and separate.
  - Second checkbox click while the first toggle is pending must not dispatch another toggle; UI resolves to checked.
  - `task.open-task-page` creates/opens unresolved checked task as `task.status = "done"` with no task events.
  - `task.resolve-task-block` still rejects unresolved checked task lines.
- Validation:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts
bun run typecheck
git diff --check
```

- Result: expected red signal. Focused tests ran 3 files / 47 tests with 3 failed / 44 passed. Failures were duplicated visible task title text, repeated pending toggle dispatching twice, and `task.open-task-page` rejecting unresolved checked source with `Completed task source block is not resolved`. `bun run typecheck` passed. `git diff --check` passed.

## Second Review-fix Implementation Result

- Status: completed by Euler the 4th (`implementer`) on 2026-05-21 14:59 CST.
- Files changed:
  - `src/plugins/markdown-editor/components/MarkdownPageEditor.tsx`.
  - `src/plugins/task/plugin.ts`.
- Summary:
  - Keeps the visible task title as the open-page affordance.
  - Keeps the checkbox a real accessible checkbox by labelling it from the title button without duplicating visible title text.
  - Suppresses repeated checkbox dispatches while a toggle for the same source block is pending.
  - Allows `task.open-task-page` to create, bind, and open unresolved checked task lines as done task pages without writing completion or reopen events.
  - Leaves `task.resolve-task-block` unchanged as unchecked-only behavior.
- Validation:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-page-persistence.test.tsx src/test/plugin-host-lifecycle.test.ts
bun run typecheck
bun run lint
git diff --check
git diff --name-only master -- package.json bun.lock src-tauri/Cargo.lock src-tauri/Cargo.toml src-tauri/build.rs src-tauri/capabilities src-tauri/permissions src-tauri/src/commands src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tauri.conf.json
```

- Result: all passed or clean. Focused TASK-018/019/020 tests passed with 3 files / 47 tests. Expanded frontend coverage passed with 6 files / 113 tests. `bun run typecheck`, `bun run lint`, and `git diff --check` passed. Native/package/Tauri surface diff was empty.

## Second Focused Review Round

### Linnaeus the 4th - Changed Surface Explorer

- Status: completed read-only changed-surface exploration after commit `0b54251`.
- Finding:
  - P2: loaded/native facade integration remains a test coverage gap. Production runtime wires loaded Markdown pages through `createMarkdownPageRuntimeFacade(nativeBridge)`, while Task Plugin commands read/write transaction pages. Current loaded checkbox coverage uses a mocked `execute` result rather than real `runtime.commands.execute("task.toggle-status")`.
- Other notes:
  - No native/package/Tauri surface changes.
  - Docs still contain stale command names and unimplemented checkbox/event wording.

### Socrates the 4th - Correctness Reviewer

- Status: completed read-only correctness review after commit `0b54251`.
- Finding: no P0/P1/P2 source or test correctness findings.
- Checks run:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-page-persistence.test.tsx src/test/plugin-host-lifecycle.test.ts
bun run typecheck
bun run lint
git diff --check 0b54251^ 0b54251
git diff --check master...HEAD
```

- Result: all passed or clean; native/package/Tauri surface diff was clean.

### Averroes the 4th - Test Quality Reviewer

- Status: completed read-only test-quality review after commit `0b54251`.
- Finding: no P0/P1/P2 test-quality gaps in current focused coverage.
- Checks run:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts
git diff --check master...0b54251
```

- Result: all passed or clean. Skip/only/todo scan found no focused-test markers. Native/package/Tauri surface diff was empty.

### Beauvoir the 4th - Security Reviewer

- Status: completed read-only security review after commit `0b54251`.
- Finding: no P0/P1/P2 security findings.
- Confirmed source-only UI payloads, strict toggle trusted-field rejection, verified source/metadata task resolution, plugin-scoped event writes, inert unsafe titles, and clean native/package/Tauri surface.
- Checks run:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx
git diff --check master...0b54251
```

- Result: all passed or clean.

### Mencius the 4th - API/Deprecation Auditor

- Status: completed read-only API/deprecation audit after commit `0b54251`.
- Findings:
  - P0/P1 code blockers: none.
  - P1 docs-only drift: product/plugin docs still mention stale command names `task.toggle_status` and `task.toggle_checkbox`.
  - P1 docs-only drift: one development example still uses `task.toggle-status` with `{ pageId }` instead of `{ sourcePageId, sourceBlockId }`.
  - P2 docs-only drift: product/architecture/testing docs still describe checkbox toggle, checked task syntax, and task events as future or unimplemented.
- External docs verified:
  - React 19 `act` / test-utils deprecation, RTL API, Testing Library `userEvent.setup()` and `ByRole checked`, Vitest v4 API, Vite 7 Node support, and Tauri v2 capabilities docs.

## Parent Decisions After Second Focused Review

- Accept Linnaeus the 4th's P2 integration risk as actionable before docs sync.
- Delegate a test writer to add a focused regression for the real loaded editor `pageId/pageFacade + runtime.commands.execute("task.toggle-status")` path, without mocking the task command result.
- If the regression is red, delegate the fix to an implementer. If it is green, commit the test as coverage and continue.
- Accept Mencius the 4th's findings as docs-only blockers for task completion, to be handled by a doc writer after the integration coverage decision.

## Current Next Action

- Delegate real loaded-runtime integration regression coverage to `test_writer`.
