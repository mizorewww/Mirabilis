# TASK-018 Agent Communication - Task Plugin Syntax And Page Creation

## Task

- Task ID: TASK-018.
- Task name: Implement Task Plugin syntax and task page creation.
- Branch: `feat/task-018-task-plugin-syntax-page-creation`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/implementation/task-index.md#task-018-implement-task-plugin-syntax-and-task-page-creation`.
- `docs/product/04-editor-and-workflows.md#11-用户核心操作markdown-页面中写任务`.
- `docs/product/05-built-in-plugins.md#16-task-plugin`.
- `docs/product/03-plugin-platform.md`.
- `docs/architecture/04-slots-editor-task.md#9-task-plugin-代码架构`.
- `docs/architecture/07-runtime-flows.md#181-用户输入任务`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- `- [ ] A` is recognized as a task block.
- A corresponding Markdown Page is created if the block is not yet bound.
- Created task pages include `task.enabled`, `task.status`, `task.sourcePageId`, and `task.sourceBlockId` metadata.
- Duplicate task pages are not created for the same source block.

## Initial Parent Interpretation

- TASK-018 should add the first Task Plugin behavior slice after TASK-017 stable block IDs.
- Task syntax recognition should use existing Markdown document/block IDs as source identity.
- Page creation and metadata writes should go through existing Core/plugin runtime paths and commands, not raw NativeBridge or new Tauri commands.
- The parent thread remains orchestration-only; tests, implementation, docs, and review work will be delegated.
- Out of scope unless agents find a hard acceptance dependency: task text click navigation, infinite nesting UI beyond reusable creation behavior, checkbox toggle events, All Tasks / Today filters, Tag Plugin parsing, metadata UI, timer/calendar behavior, rich editor migration, filesystem/native import-export, package dependencies, and new Tauri permissions/capabilities.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully with 11 agent config files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK, plus the known desktop-terminal `TERM=dumb` failure. Parent treats this as non-blocking for repository agent work.

## Current Status

- Status: implementation agent running.
- Active agents:
  - Peirce the 3rd (`implementer`): production implementation for Task Plugin syntax/page creation.
- Completed agents:
  - Godel the 3rd (`planner`): read-only scope, TDD slices, boundaries, and risks completed.
  - Copernicus the 3rd (`docs_researcher`): read-only current official docs guidance completed.
  - Planck the 3rd (`deprecation_auditor`): read-only local API/deprecation/migration risk audit completed.
  - Euclid the 3rd (`security_reviewer`): read-only security and boundary guidance completed.
  - Harvey the 3rd (`test_writer`): red acceptance tests completed, verified red, committed, and closed.
- Next parent step: wait for Peirce the 3rd's implementation, then run focused TASK-018 checks and commit if green.

## Agent Handoffs

### Pre-test Guidance Round

- Status: completed.
- Agents:
  - Godel the 3rd (`planner`): read-only TASK-018 scope and TDD plan.
  - Copernicus the 3rd (`docs_researcher`): read-only current-doc guidance for APIs/tools TASK-018 may touch.
  - Planck the 3rd (`deprecation_auditor`): read-only local API/deprecation/migration risk audit.
  - Euclid the 3rd (`security_reviewer`): read-only security and boundary guidance before tests.

### Godel the 3rd (`planner`) Outcome

- Status: completed read-only planning; no files edited and no tests run.
- Recommendation: keep TASK-018 plugin-owned and command-driven. Do not add task logic to Core, App Shell, or Markdown Editor UI.
- Recommended metadata keys: namespace `task` with camelCase keys `enabled`, `status`, `sourcePageId`, and `sourceBlockId`.
- Proposed scope: add `src/plugins/task/**`, register `TaskPlugin` in `BUILT_IN_PLUGINS`, add task syntax recognition and a resolver command, create task pages and metadata through Core/plugin facades, and bind source blocks with `attrs.boundPageId`.
- TDD guidance: registration/syntax descriptor, structured `markdown.line` task recognition, task page/metadata/source binding in one transaction, and duplicate prevention.
- Out of scope: task text click navigation, infinite nesting UI, checkbox toggle/events, All Tasks/Today filters, Tag Plugin parsing, metadata UI, timer/calendar behavior, rich editor migration, new native surface, and task rename synchronization.

### Copernicus the 3rd (`docs_researcher`) Outcome

- Status: completed read-only current-doc research; no files edited and no tests run.
- Recommendation: keep TASK-018 in TypeScript/plugin/runtime with focused Vitest tests. No new Tauri commands, capabilities, filesystem permissions, Rust IPC, package dependencies, or raw NativeBridge access are needed.
- Test guidance: prove `- [ ] A` in a TASK-017 `markdown.line` block is recognized using stable `blockId`; resolving an unbound task creates one task page titled `A`; task metadata is written; source block is bound; repeated resolving does not duplicate pages; and manifest/runtime-extension contribution is visible if TaskPlugin contributes markdown syntax descriptors.
- Implementation warning: `PluginContext` is lifecycle-scoped and `ctx.commands` has no `execute`; do not register a command handler that mutates through captured register-time `ctx.transaction`.
- External docs verified: React 19 upgrade and `act`, Vitest 4 migration/mock/expect APIs, Testing Library `user-event` and queries/async APIs, TypeScript 5.8 and 4.9 notes, Vite 7 Node support, and Tauri v2 command/capability/permission docs.

### Planck the 3rd (`deprecation_auditor`) Outcome

- Status: completed read-only API/deprecation audit; no files edited and no tests run.
- P1 findings:
  - The docs' command pattern is not directly implementable with current APIs because command handlers receive only input and register-time `PluginContext` scopes are revoked after `register()`.
  - Runtime persistence is split: Plugin Host uses in-memory Core stores while `runtime.markdown.pages.save()` writes through NativeBridge DB operations. TASK-018 should deliberately stay Core/plugin-runtime focused unless scope changes.
- P2 findings: `tx.pages.updateBlockAttrs` is a placeholder and not a current API; product docs still show older snake_case source metadata in one place; inert `manifest.contributes.markdownSyntax` descriptors alone do not create pages.
- Recommended APIs: parse TASK-017 `markdown.line` blocks with stable `blockId`s; write metadata through plugin-facing `metadata.set` so Plugin Host injects `sourcePluginId`; detect duplicates by `sourcePageId + sourceBlockId`; follow the existing built-in plugin pattern.
- External docs verified: Tauri v2 invoke and permissions, React textarea, Vitest `expectTypeOf`, and Testing Library user-event setup.

### Euclid the 3rd (`security_reviewer`) Outcome

- Status: completed read-only security review; no files edited and no tests run.
- No P0 findings and no native permissions required.
- P1 risks:
  - Do not close over register-time `PluginContext` for `task.resolve-task-block`; lifecycle scopes are revoked after registration.
  - Keep task creation behind Command Registry while providing a safe execution boundary.
  - Do not add `task.*` native operations, NativeBridge handles, raw stores, raw registries, filesystem, SQL, or Tauri handles to Task Plugin.
- Security test guidance: invalid payloads and stale source blocks must not mutate; derive or verify title from the current source block, not caller input alone; page creation, metadata writes, and source block binding must be atomic; duplicate prevention must use `(sourcePageId, sourceBlockId)`; same block IDs on different pages should create distinct task pages; `boundPageId` and existing metadata relations should be reused; code fences and malformed lines should not create tasks; HTML or `javascript:`-like titles remain inert text; native-surface guards stay green.

### Harvey the 3rd (`test_writer`) Handoff

- Status: completed, committed, and closed.
- Ownership: tests only.
- File changed:
  - `src/test/task-plugin-syntax-page-creation.test.ts`.
- Commit: `dc2453f` (`Harvey the 3rd(test)(Implement Task Plugin syntax and task page creation): add task plugin acceptance tests`).
- Coverage added:
  - Task Plugin registration and task syntax recognition for `- [ ] A` in a `markdown.line` block with stable `blockId`.
  - A registered Task Plugin resolver command executable through the runtime command bus without stale register-time `PluginContext` mutation.
  - Task page creation, camelCase task metadata writes, and source block `attrs.boundPageId` binding.
  - Duplicate prevention by `(sourcePageId, sourceBlockId)`, including same `blockId` on different source pages creating distinct pages.
  - Negative cases for invalid payloads, stale/non-task blocks, malformed task lines, and inert HTML / `javascript:`-like titles where practical.
- Parent verification:

```bash
bun run test:frontend -- src/test/task-plugin-syntax-page-creation.test.ts
bun run typecheck
git diff --check
```

- Result: expected red signal from the focused test command. 1 file failed, 5 tests failed, 3 tests passed. Main failures: missing built-in `task` plugin, missing task checkbox syntax contribution, and missing `task.resolve-task-block` command (`COMMAND_NOT_FOUND`). `bun run typecheck` and `git diff --check` passed.

### Peirce the 3rd (`implementer`) Handoff

- Status: running.
- Ownership: production implementation only, with tiny test typing/import fixes only if unavoidable and without weakening assertions.
- Expected files: likely `src/plugins/task/**`, `src/bootstrap/built-in-plugins.ts`, and a minimal generic command execution context in Core command/plugin-host code if needed.
- Constraints: no task business logic in Core/App Shell/MarkdownEditor UI; no native/Tauri/Rust/package/capability/filesystem changes; no stale register-time `PluginContext` mutation; no nonexistent `updateBlockAttrs`; no duplicate task pages for `(sourcePageId, sourceBlockId)`.

## Parent Decisions

- Select TASK-018 because it is the first unblocked `[ ]` task after TASK-017 completed and merged.
- Use branch `feat/task-018-task-plugin-syntax-page-creation`.
- Keep parent orchestration-only per user instruction.
- Accept camelCase task metadata keys from TASK-018 acceptance and architecture docs.
- Keep TASK-018 TypeScript/plugin/runtime scoped with no new native surface.
- Require TDD tests to expose the command execution context gap: final behavior must let a registered Task Plugin command resolve task blocks without mutating through a stale register-time `PluginContext`.
- Require duplicate prevention by `(sourcePageId, sourceBlockId)` and source block binding through copied block attrs, not a nonexistent `updateBlockAttrs` API.
