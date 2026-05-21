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

## Current Next Action

- Delegate implementation to `implementer`.
