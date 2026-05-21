# TASK-017 Agent Communication - Stable Block IDs And Markdown Import/Export

## Task

- Task ID: TASK-017.
- Task name: Add stable block IDs and markdown import/export.
- Branch: `feat/task-017-stable-block-ids-markdown-import-export`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/architecture/02-core-kernel.md#41-markdown-page-store`.
- `docs/architecture/04-slots-editor-task.md#92-task-syntax`.
- `docs/implementation/task-index.md#task-017-add-stable-block-ids-and-markdown-importexport`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- Every structured block has a stable `blockId`.
- Markdown import creates structured documents with block IDs.
- Markdown export preserves user-visible content.
- Editing existing blocks does not unnecessarily replace block IDs.

## Initial Parent Interpretation

- TASK-017 should add stable block identity and Markdown conversion behavior after the TASK-016 textarea shell.
- Prefer a focused TypeScript core/editor conversion layer unless agents identify a strict need for a richer editor dependency.
- Markdown import/export should preserve user-visible Markdown content on round trip.
- Existing block IDs should be retained when an edit can be matched to the prior block identity.
- Task Plugin semantics, checkbox events, tag indexing, page-link navigation, `@date`, autocomplete, slash menu, sync, packaging, and rich editor migration remain out of scope unless agents find a hard acceptance dependency.
- New Tauri commands/capabilities, filesystem permissions, Rust changes, package dependencies, and native import/export behavior should not be added unless agents identify a TASK-017-specific requirement.
- The parent thread remains orchestration-only; tests, implementation, docs, and review work will be delegated.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully with 11 agent config files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK, plus the known desktop-terminal `TERM=dumb` failure. Parent treats this as non-blocking for repository agent work.

## Current Status

- Status: focused re-review complete; second review-fix red tests pending.
- Active agents: none.
- Completed agents:
  - James the 3rd (`planner`): scope, design slices, TDD plan, implementation guidance, and risks completed.
  - Carver the 3rd (`docs_researcher`): current official docs guidance completed.
  - Mill the 3rd (`deprecation_auditor`): API/dependency/deprecation risk audit completed.
  - Gauss the 3rd (`security_reviewer`): Markdown import/export and boundary security review completed.
  - Euler the 3rd (`test_writer`): red tests completed, verified red, committed, and closed.
  - Erdos the 3rd (`implementer`): production implementation completed, focused tests green, committed, and closed.
  - Averroes the 3rd (`test_writer`): test-only typecheck fix completed, validated, committed, and closed.
  - Nietzsche the 3rd (`pr_explorer`): changed-surface mapping completed.
  - Russell the 3rd (`reviewer`): correctness review completed with P1/P2 findings.
  - Goodall the 3rd (`security_reviewer`): security review completed with P1/P2 findings.
  - Helmholtz the 3rd (`deprecation_auditor`): API/deprecation review completed with no P0/P1/P2 findings.
  - Schrodinger the 3rd (`docs_researcher`): docs/current-guidance review completed with required docs sync findings.
  - Bohr the 3rd (`test_quality_reviewer`): test quality review completed with P1/P2 findings.
  - Rawls the 3rd (`doc_writer`): documentation gap review completed.
  - Newton the 3rd (`docs_researcher`): current guidance for Rust IPC body-validation and TypeScript conversion review fixes completed.
  - Tesla the 3rd (`test_writer`): review-fix red tests completed, verified red, committed, and closed.
  - Hooke the 3rd (`implementer`): review-fix implementation completed, focused checks green except test-file rustfmt, committed, and closed.
  - Aristotle the 3rd (`test_writer`): test-only Rust IPC formatting fix completed, validated, committed, and closed.
  - Lagrange the 3rd (`reviewer`): focused correctness re-review completed with two remaining P1 findings.
  - Laplace the 3rd (`security_reviewer`): focused security re-review completed with no P0/P1 findings and one P2 aligned with Lagrange's Rust validator finding.
  - Parfit the 3rd (`test_quality_reviewer`): focused test-quality re-review completed with no P0/P1 findings and one remaining P2 representation-overfit concern.
- Next parent step: commit focused re-review findings and delegate second review-fix red tests.

## Agent Handoffs

### Pre-test Guidance Round

- Status: completed.
- Agents:
  - James the 3rd (`planner`): read-only scope, design slices, tests, dependencies, and risks.
  - Carver the 3rd (`docs_researcher`): read-only current official docs guidance for Markdown parsing/export choices and current React/Vitest/editor testing guidance if needed.
  - Mill the 3rd (`deprecation_auditor`): read-only API/dependency/deprecation risk audit for any proposed Markdown parsing/editor library path.
  - Gauss the 3rd (`security_reviewer`): read-only Markdown import/export and structured document security boundary review.

### James the 3rd (`planner`) Outcome

- Status: completed read-only planning; no files edited and no tests run.
- Recommendation: implement TASK-017 as a focused TypeScript core/editor conversion layer.
- Proposed scope:
  - Add Markdown string import/export helpers that produce `StructuredMarkdownDocument` blocks with stable `blockId`s.
  - Integrate helpers into `src/core/runtime/markdown-pages.ts` so load exports structured bodies to textarea Markdown and save imports textarea Markdown back to structured bodies.
  - Preserve TASK-016's controlled textarea editor.
  - Keep task syntax as visible Markdown text only.
- Proposed files: new `src/core/markdown/block-ids.ts`, `src/core/markdown/markdown-import.ts`, `src/core/markdown/markdown-export.ts`, `src/core/markdown/index.ts`; exports from `src/core/index.ts`; updates to `src/core/runtime/markdown-pages.ts`; new `src/test/markdown-import-export.test.ts`; updates to `src/test/markdown-page-persistence.test.tsx`.
- TDD guidance:
  - Import heading, paragraph, list item, `- [ ]` task syntax text, `#tag`, and `[[Page]]` into blocks with unique IDs.
  - Export imported documents back to visible Markdown without leaking IDs.
  - Verify every recursive block has `blockId`.
  - Verify duplicate visible blocks receive distinct IDs.
  - Verify editing an existing block and inserting a new block before existing blocks preserves prior IDs.
  - Verify runtime save sends structured bodies with block IDs and runtime load exports structured bodies back to Markdown.
- Implementation guidance:
  - Use a small local converter, not a rich-editor dependency.
  - Make block ID generation injectable for deterministic tests.
  - Prefer exact stable-key matches first, then same-order/same-kind unmatched blocks for ordinary edits, and allocate new IDs only for new blocks.
- Open ambiguity: define “Markdown export preserves user-visible content” as exact round trip for current textarea-supported Markdown samples.

### Carver the 3rd (`docs_researcher`) Outcome

- Status: completed read-only current-doc research; no files edited and no tests run.
- Recommendation: treat Markdown import/export as pure string `<-> StructuredMarkdownDocument` conversion, not native file import/export.
- Dependency guidance: no new dependency for TASK-017. If full CommonMark AST support becomes necessary later, prefer `mdast-util-from-markdown@2.0.3` plus `mdast-util-to-markdown@2.1.2`; docs note complete Markdown round-tripping is not guaranteed. `remark@15.0.1` is broader processor tooling and unnecessary for this task.
- Test guidance:
  - Preserve visible Markdown text including blank lines, headings, lists, checkbox syntax, tags, links, fenced code, and raw HTML as text.
  - Use injected deterministic block ID generation.
  - Keep React tests user-facing with `userEvent.setup()`, role queries, and `waitFor` only where async state changes.
- Implementation guidance:
  - Update `src/core/runtime/markdown-pages.ts` so load exports structured bodies to editor Markdown and save imports editor Markdown into structured blocks while reusing cached prior IDs.
  - Keep Core plugin-agnostic. Do not put task/business terms in production Core files.
  - Do not add Tauri commands, capabilities, Rust code, filesystem permissions, Tiptap, ProseMirror, or package dependencies.
- External docs consulted: CommonMark spec, mdast, `mdast-util-from-markdown`, `mdast-util-to-markdown`, micromark, remark, React textarea and `useEffect`, Vitest v4, Testing Library user-event, and Testing Library queries/async.

### Mill the 3rd (`deprecation_auditor`) Outcome

- Status: completed read-only API/deprecation audit; no files edited and no tests run.
- P1 risks:
  - Current `src/core/runtime/markdown-pages.ts` defines and saves a local `markdown.text` body without `blockId`; this conflicts with `src/core/types/page.ts`, where every `BlockNode` requires `blockId`.
  - Do not use `NativeBridge.files.importMarkdown/exportMarkdown`; TS constants exist, but Rust only registers DB commands and capabilities only allow DB commands.
  - Avoid Tiptap Markdown beta APIs for this task unless scope expands to rich editor behavior.
  - Rust IPC currently accepts page `body` as arbitrary JSON; if TASK-017 persists structured docs through DB IPC, add focused validation or keep conversion behind a strongly typed TS facade plus tests.
- Recommended APIs:
  - Add pure TypeScript conversion helpers with injected `createBlockId()` and optional previous document for ID retention.
  - If a parser is needed later, prefer ESM `unified`/`remark-parse`/`remark-stringify` or lower-level mdast utilities; add GFM only when task semantics require it.
  - Continue using the existing NativeBridge wrapper for Tauri calls.
- APIs to avoid: v1 Tauri imports, raw `invoke()` from React components, filesystem bridge calls, Tiptap v1 packages, `dangerouslySetInnerHTML`, unsanitized Marked HTML output, deprecated Marked sanitize options, and CommonJS `require()` for unified/remark packages.
- External docs verified: Tauri v2 commands/capabilities/fs/dialog, unified/remark, Tiptap Markdown beta APIs, Marked security note, Vite 7 migration, Vitest, React Testing Library/user-event.

### Gauss the 3rd (`security_reviewer`) Outcome

- Status: completed read-only security review; no files edited and no tests run.
- P0 blocker if implementation renders imported Markdown/HTML into the Tauri window through `dangerouslySetInnerHTML`, raw HTML Markdown output, unsafe editor nodes, or unsanitized link HTML. Markdown must remain inert text unless a reviewed sanitizer/rendering model is added.
- P1 risks:
  - `PageCreatePayload` and `PageUpdatePayload` accept body JSON; malformed bodies, missing/duplicate `blockId`s, excessive depth, or hostile attrs could persist unless validated.
  - Current `runtime.markdown.pages` flattening into one no-`blockId` node would destroy block identity.
  - File bridge commands are not registered or capability-granted and should not be used.
- Test guidance:
  - Pure conversion tests for unique nonblank IDs and inert raw HTML / `javascript:` link text.
  - Stability tests for edits, insert/delete, deleted ID non-reuse, and duplicate line ID preservation.
  - Validation tests for missing/duplicate IDs, non-`doc` root, non-array content, unsupported executable-like attrs, excessive depth/block count/input length.
  - Runtime/native boundary tests proving page save uses only `core.pages.get/update`, never native file/path DTOs.
- Implementation constraints: use opaque generated IDs, preferably through an injected factory; do not derive IDs from user text; validate structured documents at module boundaries; treat NativeBridge responses as untrusted.

## Parent Decisions

- Delegate red tests first; parent remains orchestration-only.
- Implement TASK-017 as a small TypeScript Markdown conversion and runtime integration task.
- Do not add package dependencies, Tiptap, ProseMirror, Rust changes, Tauri commands/capabilities, filesystem import/export, package/Cargo changes, or native permissions in the first red-test scope.
- Interpret Markdown import/export as editor/runtime string `<-> StructuredMarkdownDocument`, not OS file import/export.
- Treat task checkbox syntax, tags, and page links as visible Markdown text only. TASK-018+ owns semantic Task/Tag/PageLink behavior.
- Require injected deterministic block ID generation in tests and opaque generated IDs in production.
- Require tests for:
  - import/export round trip preserving user-visible text;
  - unique nonblank `blockId`s on every structured block;
  - stable IDs across ordinary edits, insertions, deletions, duplicate visible blocks, blank lines, fenced code, raw HTML, and link-like text;
  - runtime `markdown.pages.load/save` no longer flattening structured docs into no-`blockId` `markdown.text`;
  - validation or rejection of malformed structured docs;
  - native-surface guard: no file/path bridge use and no new Tauri permission/capability surface.
- Focused red-test command should start with:

```bash
bun run test:frontend -- src/test/markdown-import-export.test.ts src/test/markdown-page-persistence.test.tsx
```

### Euler the 3rd (`test_writer`) Handoff

- Status: completed, committed, and closed.
- Ownership: tests and test helpers only.
- Files changed:
  - `src/test/markdown-import-export.test.ts`.
  - `src/test/markdown-page-persistence.test.tsx`.
- Coverage added:
  - Markdown import/export round trip and block ID uniqueness.
  - Stable IDs across edits, insertions, deletions, duplicate visible blocks, blank lines, fenced code, raw HTML, and link-like text.
  - Structured document validation or rejection surface for malformed docs.
  - Runtime `markdown.pages.load/save` structured body behavior.
  - Native-surface guard against file/path bridge usage and new Tauri permission assumptions.
- Commit: `27118dc` (`Euler the 3rd(test)(Add stable block IDs and markdown import/export): add markdown block id acceptance tests`).
- Parent verification:

```bash
bun run test:frontend -- src/test/markdown-import-export.test.ts src/test/markdown-page-persistence.test.tsx
```

- Result: expected red signal. 2 failed files, 8 failed tests, 3 passed.
- Main failures:
  - Missing `importMarkdownToStructuredDocument`, `exportStructuredDocumentToMarkdown`, and `validateStructuredMarkdownDocument` exports.
  - Current runtime still flattens persisted Markdown into one `markdown.text` node and reads only the first structured line.
- `git diff --check` passed before commit.

### Erdos the 3rd (`implementer`) Handoff

- Status: completed, committed, and closed.
- Ownership: production TypeScript implementation only.
- Files changed:
  - `src/core/markdown/**`.
  - `src/core/index.ts`.
  - `src/core/runtime/markdown-pages.ts`.
- Commit: `22e2753` (`Erdos the 3rd(implementation)(Add stable block IDs and markdown import/export): implement markdown block conversion`).
- Implementation summary:
  - Added core Markdown conversion exports for import, export, and validation.
  - Integrated runtime `markdown.pages.load/save` with structured bodies and previous-document ID reuse.
  - Preserved legacy TASK-016 `markdown.text` load fallback.
  - Kept behavior TypeScript-only with no new dependencies, Tauri commands/capabilities, Rust, filesystem import/export, or package changes.
- Parent verification:

```bash
bun run test:frontend -- src/test/markdown-import-export.test.ts src/test/markdown-page-persistence.test.tsx
bun run lint
git diff --check
```

- Result: focused tests passed with 2 files / 11 tests. `bun run lint` passed. `git diff --check` passed.
- `bun run typecheck` still fails in `src/test/markdown-import-export.test.ts:269` with TS7053. This is a test-only typing issue from the red-test helper and is outside the implementer scope.

### Averroes the 3rd (`test_writer`) Handoff

- Status: completed, committed, and closed.
- Ownership: test-only TypeScript typing fix.
- File changed:
  - `src/test/markdown-import-export.test.ts`.
- Commit: `6c5ccaa` (`Averroes the 3rd(test-fix)(Add stable block IDs and markdown import/export): fix markdown conversion test typing`).
- Summary: typed required conversion exports as `keyof MarkdownConversionApi`; assertions and coverage unchanged.
- Parent verification:

```bash
bun run typecheck
bun run test:frontend -- src/test/markdown-import-export.test.ts src/test/markdown-page-persistence.test.tsx
git diff --check
```

- Result: all passed.

### Review Round 1

- Status: completed.

### Nietzsche the 3rd (`pr_explorer`) Outcome

- Status: completed read-only changed-surface mapping; no files edited.
- Changed surface: 9 files versus `master`, including Core Markdown conversion exports, runtime markdown page integration, two focused test files, and orchestration docs.
- Runtime/native boundary: no Rust, Tauri capability, permission, package, or Cargo files changed in the original implementation. Runtime still uses only `core.pages.get` and `core.pages.update` through `nativeBridge.db.execute`.
- Risk focus:
  - ID reconciliation is line-oriented and position-biased.
  - `BlockNode.marks` are not validated.
  - Legacy `markdown.text` fallback matches TASK-016 but should be reviewed for malformed legacy-like bodies.
  - Rust still accepts page `body` as arbitrary JSON.
- Checks run: `git diff --check master...HEAD`, `bun run typecheck`, focused TASK-017 tests, and `bun run lint`; all passed.

### Russell the 3rd (`reviewer`) Outcome

- Status: completed read-only correctness review; no files edited.
- P1: same-length insert/delete edits corrupt block identity because the initial algorithm blindly reused previous IDs by index when line counts matched.
- P2: shifted edited blocks can get unnecessary new IDs after insert/delete because only exact prefix/suffix lines are retained.
- P2: legacy `markdown.text` fallback accepts malformed legacy-shaped bodies with invalid extra block data, such as non-string `blockId`.
- Check run: focused TASK-017 tests passed with 2 files / 11 tests.

### Goodall the 3rd (`security_reviewer`) Outcome

- Status: completed read-only security review; no files edited.
- P1: Rust IPC `core.pages.create` and `core.pages.update` still accept `body: serde_json::Value` and validate only page IDs/parent IDs. Main-window callers with allowed `db_execute` can bypass TS limits and persist malformed, oversized, deeply nested, duplicate-ID, or executable-attr bodies. IPC should enforce the same structured document schema and limits before writing `body_json`.
- P2: `importMarkdownToStructuredDocument()` rejects too many blocks only after splitting, assigning IDs, and constructing block objects; it should reject `lines.length > maxBlockCount` before ID generation/object construction.
- P2: attr URL validation only rejects strings starting with `javascript:` and should reject `data:` and URL-normalization variants or enforce a strict scheme allowlist.
- No TASK-017 native file-command, capability, filesystem, or raw HTML rendering broadening found.

### Helmholtz the 3rd (`deprecation_auditor`) Outcome

- Status: completed read-only API/deprecation review; no files edited.
- Finding: no P0/P1/P2 API or deprecation issues.
- Confirmed no dependency, lockfile, Cargo, Tauri config, capability, or permission changes in the original implementation.
- External docs checked: Tauri v2 core invoke/release docs, Vitest `expect`/`vi`, Testing Library user-event setup, and React Testing Library API.

### Schrodinger the 3rd (`docs_researcher`) Outcome

- Status: completed read-only docs/current-guidance review; no files edited.
- P1: docs sync is needed before merge because local docs still describe stable block IDs and Markdown import/export as deferred or still show the TASK-016 single `markdown.text` save wrapper.
- Docs to update later: `docs/product/04-editor-and-workflows.md`, `docs/architecture/02-core-kernel.md`, `docs/architecture/04-slots-editor-task.md`, `docs/architecture/07-runtime-flows.md`, `docs/development/02-implementation-roadmap-and-constraints.md`, and `docs/testing/strategy.md`.
- No external docs were needed because the branch adds no new external API/dependency surface.

### Bohr the 3rd (`test_quality_reviewer`) Outcome

- Status: completed read-only test-quality review; no files edited.
- P1: missing combined edit-plus-insertion coverage for block ID stability. Existing tests cover same-length edits and unchanged-neighbor insert/delete separately, but not an existing block edited while another block is inserted/deleted.
- P2: deleted-ID non-reuse assertion is weak because the deterministic ID factory never attempts to return a deleted prior ID.
- P2: some assertions overfit the one-line-per-block representation instead of observable import/export behavior.
- Check run: focused TASK-017 tests passed with 2 files / 11 tests.

### Rawls the 3rd (`doc_writer`) Outcome

- Status: completed read-only documentation gap review; no files edited.
- Recommended docs sync after review fixes:
  - `docs/product/04-editor-and-workflows.md`: update TASK-016/TASK-017 state and deferred list.
  - `docs/architecture/02-core-kernel.md`: clarify TASK-017 interim line-oriented `markdown.line` format, not Tiptap/ProseMirror JSON yet.
  - `docs/architecture/04-slots-editor-task.md`: replace obsolete single `markdown.text` save-shape snippet and note legacy fallback only.
  - `docs/architecture/07-runtime-flows.md`: document runtime load/export and save/import behavior through `core.pages.get/update`.
  - `docs/development/02-implementation-roadmap-and-constraints.md`: move stable block IDs and internal conversion out of deferred work.
  - `docs/testing/strategy.md`: add TASK-017 focused tests and security boundaries.
- Deferred items to keep documented: Task/Tag/PageLink semantics, checkbox events, tag indexing, page-link navigation, `@date`, autocomplete, slash menu, rich editor/Tiptap/ProseMirror adaptation, full CommonMark AST round-tripping, native filesystem Markdown import/export, broader Rust/IPC body schema hardening until fixed, and user-facing load/save error UX.
- Check run: focused TASK-017 tests passed with 2 files / 11 tests.

## Review-Fix Plan

- P1 fixes required before merge:
  - Add red tests for same-length insert/delete ID corruption and combined edit+insert ID retention, then update reconciliation.
  - Add Rust IPC red tests for invalid structured page bodies through `core.pages.create/update`, then enforce validation natively.
  - Sync docs after code/test review fixes.
- P2 fixes to include if practical in the same review-fix loop:
  - Early block-count rejection before ID generation/object construction.
  - Stronger URL attr validation for `data:` and normalized `javascript:` variants.
  - Malformed legacy fallback rejection.
  - Deleted-ID collision coverage.
  - Avoid adding more representation-overfit tests where observable behavior is enough.

### Newton the 3rd (`docs_researcher`) Handoff

- Status: completed and closed.
- Ownership: read-only current guidance for Rust/Tauri/Serde review-fix tests and implementation.
- Scope:
  - Rust IPC `core.pages.create/update` structured body validation.
  - TypeScript Markdown conversion validation/reconciliation test guidance.
  - Current official docs only as needed for Tauri v2 command/error patterns, Serde/serde_json validation, and Rust testing style.
- Guidance for `test_writer`:
  - Add Rust IPC tests in `src-tauri/tests/ipc_persistence.rs`.
  - Update existing page test helpers there to use canonical TASK-017 bodies `{ type: "doc", content: [{ blockId, type: "markdown.line", text }] }`; old `{"blocks": ...}` bodies should become invalid for `core.pages.create/update`.
  - Add failing cases proving `core.pages.create` and `core.pages.update` reject malformed body with `INVALID_REQUEST`, including non-`doc`, missing/non-array content, non-object blocks, missing/blank/duplicate IDs, excessive depth/block count, invalid `type`/`text`/`content`/`attrs`/`marks`, and executable attrs (`onClick`, `javascript:`, `data:`, normalized URL variants).
  - Add a transaction test where an earlier valid write plus later invalid body leaves the earlier page absent.
  - Add TypeScript tests for same-length delete+insert ID retention, combined insertion plus edited block ID retention, deleted-ID reservation on generator collision, early max block-count rejection before ID generation, URL attr rejection, malformed marks, and malformed legacy `markdown.text` fallback rejection.
- Guidance for `implementer`:
  - In `src-tauri/src/commands/db.rs`, call a new page-body validator from `PageCreatePayload::validate` and `PageUpdatePayload::validate`.
  - Return only `IpcError::invalid_request()` for schema failures, without schema/body/block ID/URL/SQL/path/serde details.
  - Mirror TS schema and use constants aligned with TS defaults where practical: max block count `20_000`, max depth `100`.
  - Replace raw same-length index reuse in `markdown-conversion.ts`; reserve all previous IDs so new blocks cannot reuse deleted IDs.
- External docs consulted: Tauri v2 commands/error handling, Tauri capabilities, Serde container attributes, `serde_json::Value`, `serde_json::from_value`, and Cargo integration test layout.

### Tesla the 3rd (`test_writer`) Handoff

- Status: completed, committed, and closed.
- Ownership: review-fix tests and test helpers only.
- Files changed:
  - `src/test/markdown-import-export.test.ts`.
  - `src/test/markdown-page-persistence.test.tsx`.
  - `src-tauri/tests/ipc_persistence.rs`.
- Coverage added:
  - Same-length delete+insert ID stability.
  - Combined insertion plus edited existing block ID retention.
  - Rust IPC `core.pages.create/update` body validation with redacted `INVALID_REQUEST`.
  - Deleted-ID generator collision, early max-block rejection, stricter attr URL and marks validation, malformed legacy fallback rejection, and invalid-body transaction rollback if practical.
- Commit: `3820fca` (`Tesla the 3rd(test)(Add stable block IDs and markdown import/export): add review-fix acceptance tests`).
- Parent verification:

```bash
bun run test:frontend -- src/test/markdown-import-export.test.ts src/test/markdown-page-persistence.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml --all-features --test ipc_persistence page
git diff --check
```

- Result: expected red signals. Frontend focused tests: 2 failed files, 5 failed / 10 passed. Rust IPC page tests: 3 run, 2 failed / 1 passed. `git diff --check` passed.

### Hooke the 3rd (`implementer`) Handoff

- Status: completed, committed, and closed.
- Ownership: production implementation only.
- Files changed:
  - `src/core/markdown/markdown-conversion.ts`.
  - `src/core/runtime/markdown-pages.ts`.
  - `src-tauri/src/commands/db.rs`.
- Commit: `618eaae` (`Hooke the 3rd(review-fix)(Add stable block IDs and markdown import/export): harden block IDs and IPC body validation`).
- Summary:
  - Replaced unsafe same-length ID reuse with reconciliation that preserves shifted/edited blocks and reserves previous IDs.
  - Added early max-block rejection, stronger URL/mark validation, and strict legacy `markdown.text` fallback matching.
  - Added Rust IPC structured page body validation for `core.pages.create/update`.
- Parent/agent verification:

```bash
bun run test:frontend -- src/test/markdown-import-export.test.ts src/test/markdown-page-persistence.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml --all-features --test ipc_persistence page
bun run typecheck
git diff --check
```

- Result: focused frontend tests passed with 15/15 tests. Rust IPC page tests passed with 3/3 tests. `bun run typecheck` passed. `git diff --check` passed.
- Remaining blocker: `cargo fmt --manifest-path src-tauri/Cargo.toml --check` fails only on formatting in `src-tauri/tests/ipc_persistence.rs` from the review-fix red-test commit. Parent will delegate this test-only formatting fix to `test_writer`.

### Aristotle the 3rd (`test_writer`) Handoff

- Status: completed, committed, and closed.
- Ownership: test-file formatting only.
- File changed:
  - `src-tauri/tests/ipc_persistence.rs`.
- Commit: `916b51c` (`Aristotle the 3rd(test-fix)(Add stable block IDs and markdown import/export): format IPC review tests`).
- Parent verification:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo test --manifest-path src-tauri/Cargo.toml --all-features --test ipc_persistence page
bun run test:frontend -- src/test/markdown-import-export.test.ts src/test/markdown-page-persistence.test.tsx
git diff --check
```

- Result: all passed.

### Focused Re-review Round

- Status: completed.

### Lagrange the 3rd (`reviewer`) Outcome

- Status: completed read-only correctness re-review; no files edited.
- P1: Rust IPC validation still accepts structured blocks with `type: "markdown.text"` when they include a `blockId`. TS validation rejects that same body as a malformed legacy node, so `core.pages.create/update` can persist a page that `runtime.markdown.pages.load()` later rejects.
- P1: combined insert+edit ID retention remains fragile when the inserted line is textually similar to the edited existing block. A new line like `Review PR backlog` can inherit the old `Review PR` ID while `Review PR with notes` receives a new ID.
- P2: docs sync remains incomplete; docs still describe stable block IDs / Markdown import-export as deferred and show old `markdown.text` save shape.
- Checks run: focused frontend tests, focused Rust IPC page tests, and `git diff --check master...HEAD`.

### Laplace the 3rd (`security_reviewer`) Outcome

- Status: completed read-only security re-review; no files edited.
- Finding: no P0/P1 security issues.
- P2: Rust IPC body validation still accepts structured `markdown.text` blocks with `blockId`, while TS validation rejects them. This is covered as P1 by Lagrange because it can persist bodies the frontend later rejects.
- No new Tauri commands, capability/filesystem broadening, raw HTML rendering, or raw invoke usage found.
- Checks run: full `ipc_persistence` integration test, focused frontend tests. A direct `bun test` attempt was invalid because it bypassed Vitest/jsdom setup.

### Parfit the 3rd (`test_quality_reviewer`) Outcome

- Status: completed read-only test-quality re-review; no files edited.
- Finding: no P0/P1 test gaps.
- P2: runtime persistence tests still overfit the current one-line-per-block representation with assertions on `body.content.map((block) => block.text)`. Prefer asserting `exportStructuredDocumentToMarkdown(updatePayload.body)` plus recursive block ID uniqueness/stability.
- Checks run: focused frontend tests and focused Rust IPC page tests.

## Second Review-Fix Plan

- Required P1 fixes:
  - Add red tests for similar inserted line plus edited existing block ID retention.
  - Add Rust IPC red tests rejecting structured `markdown.text` blocks with `blockId` through `core.pages.create/update`.
- P2 cleanup to include if practical:
  - Loosen runtime persistence tests away from one-line-per-block assertions and toward export/recursive ID behavior.
- Docs sync remains after code/test re-review is clean.

## Validation

- Validation so far:

```bash
python - <<'PY'
import glob, tomllib
paths = sorted(glob.glob('.codex/agents/*.toml'))
for path in paths:
    with open(path, 'rb') as f:
        tomllib.load(f)
print(f'parsed {len(paths)} agent toml files')
PY

codex --strict-config doctor --summary --ascii
bun run test:frontend -- src/test/markdown-import-export.test.ts src/test/markdown-page-persistence.test.tsx
bun run lint
bun run typecheck
git diff --check
```

## Risks And Open Questions

- Implementer must make the current `StructuredMarkdownDocument` shape sufficient for TASK-017 or report a blocker before broadening scope.
- Stable-ID reconciliation must handle edits, insertions, deletions, duplicate visible lines, blank lines, fenced code, raw HTML, and link-like text as covered by the red tests.
- Markdown raw HTML and link-like text must remain inert text. Do not introduce rendering sinks, filesystem permissions, or native file import/export behavior.
