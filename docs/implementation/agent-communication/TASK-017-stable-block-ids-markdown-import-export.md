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

- Status: pre-test guidance complete.
- Active agents: none.
- Completed agents:
  - James the 3rd (`planner`): scope, design slices, TDD plan, implementation guidance, and risks completed.
  - Carver the 3rd (`docs_researcher`): current official docs guidance completed.
  - Mill the 3rd (`deprecation_auditor`): API/dependency/deprecation risk audit completed.
  - Gauss the 3rd (`security_reviewer`): Markdown import/export and boundary security review completed.
- Next parent step: commit parent decisions and delegate failing acceptance tests to `test_writer`.

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

## Validation

- Start gate only:

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
```

## Risks And Open Questions

- Need agents to determine whether current `StructuredMarkdownDocument` / `DocumentBlock` shape is sufficient for import/export, or whether a small helper module is needed.
- Need tests to define how stable block IDs are retained across edits, insertions, deletions, duplicate text, task syntax blocks, and blank lines.
- Need security guidance for Markdown raw HTML, links, data URLs, body size, depth, and malformed structured document input.
