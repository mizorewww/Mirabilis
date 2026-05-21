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

- Status: review agents running.
- Active agents:
  - Nietzsche the 3rd (`pr_explorer`): changed-surface mapping.
  - Russell the 3rd (`reviewer`): correctness review.
  - Goodall the 3rd (`security_reviewer`): security review.
  - Helmholtz the 3rd (`deprecation_auditor`): API/deprecation review.
  - Schrodinger the 3rd (`docs_researcher`): docs/current-guidance review.
  - Bohr the 3rd (`test_quality_reviewer`): test quality review.
- Completed agents:
  - James the 3rd (`planner`): scope, design slices, TDD plan, implementation guidance, and risks completed.
  - Carver the 3rd (`docs_researcher`): current official docs guidance completed.
  - Mill the 3rd (`deprecation_auditor`): API/dependency/deprecation risk audit completed.
  - Gauss the 3rd (`security_reviewer`): Markdown import/export and boundary security review completed.
  - Euler the 3rd (`test_writer`): red tests completed, verified red, committed, and closed.
  - Erdos the 3rd (`implementer`): production implementation completed, focused tests green, committed, and closed.
  - Averroes the 3rd (`test_writer`): test-only typecheck fix completed, validated, committed, and closed.
- Next parent step: wait for active review agents; spawn the pending doc-writer review after an agent slot opens.

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

- Status: running.
- Active agents:
  - Nietzsche the 3rd (`pr_explorer`): read-only changed-surface mapping.
  - Russell the 3rd (`reviewer`): read-only correctness review.
  - Goodall the 3rd (`security_reviewer`): read-only security review.
  - Helmholtz the 3rd (`deprecation_auditor`): read-only API/deprecation review.
  - Schrodinger the 3rd (`docs_researcher`): read-only docs/current-guidance review.
  - Bohr the 3rd (`test_quality_reviewer`): read-only test quality review.
- Pending due to current agent thread limit:
  - `doc_writer`: read-only documentation gap review. Parent will spawn it after an agent slot opens.

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
