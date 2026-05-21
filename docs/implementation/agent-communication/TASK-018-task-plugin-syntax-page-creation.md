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

- Status: review-fix implementation agent running.
- Active agents:
  - Curie the 3rd (`implementer`): review-fix implementation for TASK-018 P2/P3 findings.
- Completed agents:
  - Godel the 3rd (`planner`): read-only scope, TDD slices, boundaries, and risks completed.
  - Copernicus the 3rd (`docs_researcher`): read-only current official docs guidance completed.
  - Planck the 3rd (`deprecation_auditor`): read-only local API/deprecation/migration risk audit completed.
  - Euclid the 3rd (`security_reviewer`): read-only security and boundary guidance completed.
  - Harvey the 3rd (`test_writer`): red acceptance tests completed, verified red, committed, and closed.
  - Peirce the 3rd (`implementer`): production implementation completed, focused checks green, committed, and closed.
  - Review round 1 agents completed and reported findings.
  - Boole the 3rd (`test_writer`): review-fix regression tests completed, verified red, committed, and closed.
- Next parent step: wait for Curie the 3rd's review-fix implementation, run focused checks, and commit if green.

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

- Status: completed, committed, and closed.
- Ownership: production implementation only, with tiny test typing/import fixes only if unavoidable and without weakening assertions.
- Files changed:
  - `src/bootstrap/built-in-plugins.ts`.
  - `src/core/index.ts`.
  - `src/core/plugin-api/context.ts`.
  - `src/core/plugin-api/index.ts`.
  - `src/core/plugin-host/plugin-host.ts`.
  - `src/plugins/task/index.ts`.
  - `src/plugins/task/plugin.ts`.
- Commit: `399807d` (`Peirce the 3rd(implementation)(Implement Task Plugin syntax and task page creation): add task block resolver`).
- Summary: added built-in `TaskPlugin` with checkbox markdown syntax contribution and `task.resolve-task-block`; added command-time Plugin Host context so plugin commands mutate through a fresh active plugin scope instead of captured register-time context; resolver validates source `markdown.line`, ignores malformed/non-task/fenced-code lines, creates one task page per `(sourcePageId, sourceBlockId)`, writes task metadata through Plugin Host ownership, and binds the source block with copied `attrs.boundPageId`.
- Parent verification:

```bash
bun run test:frontend -- src/test/task-plugin-syntax-page-creation.test.ts
bun run typecheck
bun run lint
bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts src/test/markdown-runtime-extensions.test.ts src/test/app-bootstrap-runtime.test.ts
git diff --check
git diff --name-only master -- package.json bun.lock src-tauri/Cargo.lock src-tauri/Cargo.toml src-tauri/build.rs src-tauri/capabilities src-tauri/permissions src-tauri/src/commands src-tauri/src/lib.rs src-tauri/src/main.rs src-tauri/tauri.conf.json
```

- Result: all checks passed. Focused TASK-018 tests passed with 1 file / 8 tests. Plugin Host/Markdown runtime/bootstrap regression tests passed with 3 files / 55 tests. Native/package/Tauri surface diff was empty.

### Review Round 1

- Status: completed.
- Agents:
  - Herschel the 3rd (`pr_explorer`): read-only changed-surface map.
  - Ramanujan the 3rd (`reviewer`): read-only correctness review.
  - Einstein the 3rd (`security_reviewer`): read-only security/boundary review.
  - Faraday the 3rd (`deprecation_auditor`): read-only API/deprecation review.
  - Hubble the 3rd (`docs_researcher`): read-only docs/current-guidance review.
  - Singer the 3rd (`test_quality_reviewer`): read-only test quality review.
  - Kepler the 3rd (`doc_writer`): read-only docs sync plan.

### Herschel the 3rd (`pr_explorer`) Outcome

- Status: completed read-only changed-surface map; no files edited.
- Changed surface: 11 files versus `master`, including `src/plugins/task/**`, built-in plugin registration, Plugin API command handler signature, Plugin Host command-time context support, TASK-018 tests, and orchestration docs.
- Native/package/Tauri surface: no changed files under `package.json`, `bun.lock`, or `src-tauri/**`.
- Checks run: `git diff --check master...HEAD` passed and focused TASK-018 tests passed with 1 file / 8 tests.
- Risk areas flagged for reviewers: public `PluginCommandHandler` API shape, command-time lifecycle interactions, unverified `attrs.boundPageId`, stale metadata/orphaned page handling, intentionally narrow task parsing, and shell-based native-surface test brittleness.

### Ramanujan the 3rd (`reviewer`) Outcome

- Status: completed read-only correctness review; no files edited.
- No P0/P1 correctness findings.
- P2 findings:
  - Source `attrs.boundPageId` binding is dropped by the existing Markdown save/import path because `importMarkdownToStructuredDocument()` preserves block IDs and text but not attrs.
  - The task syntax matcher accepts indented code lines such as `    - [ ] Not task`.
- Checks run: focused TASK-018 tests, Plugin Host/Markdown runtime/bootstrap regressions, `bun run typecheck`, `bun run lint`, `git diff --check master...HEAD`, and native/package/Tauri surface diff check; all passed. Manual probes confirmed both findings.

### Einstein the 3rd (`security_reviewer`) Outcome

- Status: completed read-only security review; no files edited.
- No P0/P1 security findings.
- P2 findings:
  - Duplicate top-level `blockId`s can cause binding to update unvalidated blocks because validation finds the first match but binding updates every matching `blockId`.
  - Existing `attrs.boundPageId` is trusted without verifying task-owned metadata linking back to the same source page/block, so malformed source content can bind a task line to an unrelated page.
- P3 findings: title length/control-character hardening and direct command-time PluginContext regression coverage.
- Checks run: `git diff --check master...HEAD`, `bun run typecheck`, focused TASK-018 tests, native/app-shell boundary frontend tests, and Rust IPC/sqlite boundary tests; all relevant checks passed.

### Faraday the 3rd (`deprecation_auditor`) Outcome

- Status: completed read-only API/deprecation review; no files edited.
- No deprecated React/Vite/Vitest/Tauri/API usage introduced and no native/package surface changes.
- P2 findings:
  - Plugin command failures lose their original cause at the new plugin command boundary because `CommandRegistry.execute()` wraps failures as `COMMAND_HANDLER_FAILED` without cause.
  - The new exported `PluginCommandHandler` type is not locked by public API contract tests/docs.
- P3 finding: task syntax matcher should reject CommonMark indented code lines with four spaces or a tab.
- External docs consulted: Vitest `expect.soft`, Vite 7 migration/Node support, Tauri v2 invoke docs, React 19 upgrade guide, and CommonMark indented/fenced code behavior.

### Hubble the 3rd (`docs_researcher`) Outcome

- Status: completed read-only docs/current-guidance review; no files edited.
- P1 docs drift blocks merge:
  - Plugin command API docs need command-time `PluginContext` / `PluginCommandHandler(input, context)` coverage.
  - Product docs still show snake_case task source metadata in places.
  - Runtime/testing docs still describe built-ins as markdown-only and Task Plugin as future-only.
- Required docs: `docs/architecture/03-plugin-api-and-host.md`, `docs/architecture/04-slots-editor-task.md`, `docs/architecture/07-runtime-flows.md`, `docs/product/04-editor-and-workflows.md`, `docs/product/05-built-in-plugins.md`, `docs/development/02-implementation-roadmap-and-constraints.md`, `docs/testing/strategy.md`, and final progress/communication docs.
- External docs verified: none; local docs/code were sufficient.

### Singer the 3rd (`test_quality_reviewer`) Outcome

- Status: completed read-only test-quality review; no files edited.
- No P0/P1 test-quality findings.
- P2 findings:
  - Duplicate-prevention tests do not isolate metadata-only reuse or pre-existing `attrs.boundPageId` reuse.
  - Negative cases swallow resolver failures and do not protect command error contract.
  - Resolver atomicity is not directly covered with a failure after partial writes.
- P3 finding: native-surface guard is useful but brittle because it shells out to `git diff master`.
- Checks run: focused TASK-018, Plugin Host lifecycle, transaction manager, Markdown runtime, and app bootstrap tests passed with 5 files / 80 tests.

### Kepler the 3rd (`doc_writer`) Outcome

- Status: completed read-only documentation plan; no files edited.
- Recommendation: docs sync is blocking before merge because branch behavior and public plugin API semantics changed.
- Docs to update after review fixes: `docs/product/04-editor-and-workflows.md`, `docs/product/05-built-in-plugins.md`, `docs/architecture/03-plugin-api-and-host.md`, `docs/architecture/04-slots-editor-task.md`, `docs/architecture/07-runtime-flows.md`, `docs/development/02-implementation-roadmap-and-constraints.md`, `docs/testing/strategy.md`, and final progress/agent-communication docs.
- Not required: Tauri IPC/capability/permission/Rust docs, because native surface is unchanged.

### Boole the 3rd (`test_writer`) Handoff

- Status: completed, committed, and closed.
- Ownership: tests only.
- Files changed:
  - `src/test/task-plugin-syntax-page-creation.test.ts`.
  - `src/test/plugin-host-lifecycle.test.ts`.
  - `src/test/plugin-api-contracts.test.ts`.
- Commit: `4b1001f` (`Boole the 3rd(test)(Implement Task Plugin syntax and task page creation): add review-fix regression tests`).
- Review-fix coverage added:
  - Duplicate top-level `blockId` source safety.
  - Unverified `attrs.boundPageId` safety and verified relation reuse.
  - Metadata-only relation reuse and source binding restoration.
  - Markdown save/import durability for safe `boundPageId`.
  - Indented-code task-looking lines.
  - Plugin command failure cause/context preservation.
  - Public `PluginCommandHandler` API contract coverage.
  - Command-time PluginContext hardening where practical.
  - Resolver atomicity if a clean test seam exists.
- Parent verification:

```bash
bun run test:frontend -- src/test/task-plugin-syntax-page-creation.test.ts src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts
bun run typecheck
git diff --check
```

- Result: expected red signal. 3 files ran, 2 failed, 1 passed; 4 tests failed and 72 passed. Failures covered duplicate top-level `blockId` mutation, unverified `attrs.boundPageId` reuse, CommonMark indented-code task parsing, and missing command failure cause/context preservation. `bun run typecheck` and `git diff --check` passed.

### Curie the 3rd (`implementer`) Handoff

- Status: running.
- Ownership: production review-fix implementation only, with tiny test typing/import fixes only if unavoidable and without weakening assertions.
- Fix targets:
  - Duplicate source block ID safety.
  - Verified `attrs.boundPageId` reuse and metadata-only relation recovery.
  - CommonMark indented-code task rejection.
  - Plugin command failure cause/context preservation.
  - Command-time PluginContext hardening and transaction atomicity required by Boole's tests.

## Parent Decisions

- Select TASK-018 because it is the first unblocked `[ ]` task after TASK-017 completed and merged.
- Use branch `feat/task-018-task-plugin-syntax-page-creation`.
- Keep parent orchestration-only per user instruction.
- Accept camelCase task metadata keys from TASK-018 acceptance and architecture docs.
- Keep TASK-018 TypeScript/plugin/runtime scoped with no new native surface.
- Require TDD tests to expose the command execution context gap: final behavior must let a registered Task Plugin command resolve task blocks without mutating through a stale register-time `PluginContext`.
- Require duplicate prevention by `(sourcePageId, sourceBlockId)` and source block binding through copied block attrs, not a nonexistent `updateBlockAttrs` API.
