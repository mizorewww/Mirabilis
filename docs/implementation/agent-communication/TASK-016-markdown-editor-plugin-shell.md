# TASK-016 Agent Communication - Markdown Editor Plugin Shell

## Task

- Task ID: TASK-016.
- Task name: Implement Markdown Editor Plugin shell.
- Branch: `feat/task-016-markdown-editor-plugin-shell`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/product/04-editor-and-workflows.md#12-markdown-first-编辑器`.
- `docs/architecture/04-slots-editor-task.md#8-markdown-editor-plugin`.
- `docs/implementation/task-index.md#task-016-implement-markdown-editor-plugin-shell`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- Markdown Editor Plugin registers a page editor view, insert text command, and mobile toolbar slot.
- Editor supports heading, paragraph, list, task syntax text, tag text, and page-link text at baseline.
- Documents save and reopen through Core/NativeBridge.
- Editor collects markdown extensions from runtime.

## Initial Parent Interpretation

- TASK-016 should introduce the first editor plugin shell, not the Task Plugin or full rich editor system.
- The editor must integrate through the existing Plugin Host context, View Registry, Command Registry, Slot Registry, and TASK-015 runtime/provider boundaries.
- Baseline markdown support can be textual and user-visible first; task/tag/page-link semantics remain plugin extension points unless agents find current-doc minimum behavior.
- Save/reopen should use the existing Core/runtime/native boundary from prior tasks without adding new Tauri commands or capabilities unless agents identify a strict requirement.
- The parent thread remains orchestration-only; tests, implementation, docs, and review work will be delegated.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully with 11 agent config files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK, plus the known desktop-terminal `TERM=dumb` failure. Parent treats this as non-blocking for repository agent work.

## Current Status

- Status: async-insert implementation completed and committed; narrow re-review pending.
- Active agents: none.
- Completed agents:
  - Kuhn the 2nd (`planner`): scope and implementation plan completed.
  - Averroes the 2nd (`docs_researcher`): current docs research completed.
  - Leibniz the 2nd (`deprecation_auditor`): API/deprecation audit completed.
  - Confucius the 2nd (`security_reviewer`): security boundary review completed.
  - Ohm the 2nd (`test_writer`): red tests completed, verified red, committed, and closed.
  - Mill the 2nd (`implementer`): production implementation completed, validated, committed, and closed.
  - Bernoulli the 2nd (`pr_explorer`): changed-surface mapping completed.
  - Meitner the 2nd (`reviewer`): correctness review completed.
  - Noether the 2nd (`security_reviewer`): security boundary review completed.
  - Avicenna the 2nd (`deprecation_auditor`): API/deprecation review completed.
  - Lovelace the 3rd (`docs_researcher`): docs/current-guidance review completed.
  - Boyle the 3rd (`test_quality_reviewer`): test quality review completed.
  - Maxwell the 3rd (`doc_writer`): documentation gap review completed.
  - Chandrasekhar the 3rd (`test_writer`): review-fix red tests completed, verified red, committed, and closed.
  - Fermat the 3rd (`implementer`): production review-fix implementation completed, validated, committed, and closed.
  - Poincare the 3rd (`test_writer`): narrow test-lint fix completed, validated, committed, and closed.
  - Arendt the 3rd (`reviewer`): correctness re-review completed.
  - Carson the 3rd (`security_reviewer`): security re-review completed.
  - Popper the 3rd (`test_quality_reviewer`): test quality re-review completed.
  - Noether the 3rd (`deprecation_auditor`): API/deprecation re-review completed.
  - Franklin the 3rd (`docs_researcher`): docs/current-guidance re-review completed.
  - Confucius the 3rd (`pr_explorer`): final changed-surface mapping completed.
  - Ampere the 3rd (`test_writer`): async-insert red test completed, verified red, committed, and closed.
  - Dewey the 3rd (`implementer`): async-insert race fix completed, validated, committed, and closed.
- Next parent step: run narrow re-review of the async insert fix.

## Agent Handoffs

### Pre-test Guidance Round

- Status: completed.
- Agents:
  - Kuhn the 2nd (`planner`): read-only plan for scope, design slices, tests, dependencies, and risks.
  - Averroes the 2nd (`docs_researcher`): read-only current docs guidance for editor integration and testing.
  - Leibniz the 2nd (`deprecation_auditor`): read-only React/editor-library/Vite/Vitest/API risk audit.
  - Confucius the 2nd (`security_reviewer`): read-only editor/plugin/persistence security boundary review.

### Averroes the 2nd (`docs_researcher`) Outcome

- Status: completed read-only docs research; no files edited and no tests run.
- Recommendation: do not add Tiptap/ProseMirror for TASK-016 unless planner expands scope. Local docs support a first textual React editor shell that registers `markdown.page-editor`, `markdown.insert-text`, and `editor.mobile.toolbar`, preserves typed Markdown syntax, and leaves Task/Tag/Page-link semantics to later plugin extension points.
- Guidance for `test_writer`:
  - Use React Testing Library and `userEvent.setup()` for visible editor behavior.
  - Test a labeled multiline editor preserving `# Heading`, paragraph text, `- item`, `- [ ] task`, `#tag`, and `[[Page]]`.
  - Test toolbar buttons inserting literal Markdown snippets such as `- [ ] `, `#`, and `[[ ]]`.
  - Test save updates a provided runtime/page facade and reopening the same page shows saved content.
  - Test registration through `PluginHost`: loading the Markdown Editor Plugin should add the owned view, command, and slot to Core registries.
  - Test extension collection separately from editor rendering; current architecture mentions `runtime.markdown.collectEditorExtensions()`, but no such facade exists yet.
- Guidance for `implementer`:
  - Start with a plain controlled React `<textarea>` shell, not a rich editor dependency.
  - Store baseline Markdown as the existing `StructuredMarkdownDocument` with a simple text-oriented conversion layer; do not add stable block IDs because TASK-017 owns that.
  - Keep user actions behind commands. Toolbar insertion should execute `markdown.insert-text`, not bypass the command path.
  - Do not expose full runtime through `useRuntime()` or plugin UI props.
  - Save/reopen caveat: production bootstrap still uses in-memory Core stores and does not wire pages to NativeBridge DB IPC. If strict SQLite-backed reopen is required, TASK-016 needs an explicit storage wiring decision beyond editor plugin shell.
- Tiptap/ProseMirror note: if selected later, Tiptap 3 React is lower-risk than direct ProseMirror, but Tiptap Markdown is beta; direct ProseMirror React integration would require manual `EditorView` lifecycle and is too heavy for the first shell.
- Local mismatches:
  - `task-index.md` still has outdated package-script notes even though `package.json` now has Vitest/RTL/ESLint/check scripts.
  - Architecture mentions `runtime.markdown.collectEditorExtensions()`, but current runtime/plugin API has no markdown runtime facade.
  - Manifest docs include `mobileToolbarItems`, but runtime registration facades currently cover commands/views/slots.
- External docs consulted: React textarea/effects/StrictMode, Testing Library and user-event, Vitest v4, Tiptap 3 React/persistence/Markdown, ProseMirror guide/basic example, and Tauri v2 invoke/capabilities.

### Confucius the 2nd (`security_reviewer`) Outcome

- Status: completed read-only security boundary review; no files edited and no tests run.
- P0 risks to prevent:
  - Raw Markdown/HTML XSS in the Tauri main window. Do not render untrusted Markdown with `dangerouslySetInnerHTML`, raw HTML Markdown options, unsafe editor HTML nodes, or unsanitized plugin extension output. This is P0 because current Tauri config has `csp: null` and the main window can invoke DB commands.
  - Do not pass full runtime, `NativeBridge`, raw `invoke`, DB handles, services, registries, or command mutation handles into editor views, slots, toolbar components, or plugin-provided extensions.
  - Do not treat in-process plugin React components/extensions as sandboxed untrusted code. Current boundaries scope APIs but do not sandbox arbitrary dynamic/user-installed code.
- P1 risks to prevent:
  - Do not keep register-time `PluginContext` alive for editor save/insert behavior; lifecycle scopes are revoked intentionally. Use a fresh host-owned command/action boundary.
  - Do not add filesystem/path/shell/file import-export Tauri permissions for TASK-016 save/reopen.
  - Validate persisted editor documents before save and render. Frontend/Core must bound schema, depth, node count, text length, marks/attrs, and disallow executable/html-shaped nodes.
  - Keep markdown extension collection inert or host-adapted; current `markdownSyntax` is a manifest descriptor, not executable extension registry.
  - Sanitize Markdown/page links and avoid direct opener use for user-controlled hrefs.
  - App Shell must remain generic; editor business logic/native calls/persistence wiring should stay behind controlled runtime/plugin boundaries.
- Tests/review focus:
  - XSS regressions for scripts, event handlers, `javascript:` links, raw HTML blocks, SVG/data URLs, pasted HTML, and persisted malicious content reopen.
  - Plugin-rendered UI props should not contain runtime, stores, registries, services, pluginHost, NativeBridge, invoke, db, filesystem, path, or raw command mutation handles.
  - Editor command flow should go through Command Registry or a reviewed host action boundary, not captured stale `ctx`.
  - Persistence should use allowlisted page operations, redacted native errors, and avoid raw SQL/path DTOs.
  - If native behavior changes, re-check Tauri commands, capabilities, generated permissions, Cargo/package deps, and Tauri config.

### Kuhn the 2nd (`planner`) Outcome

- Status: completed read-only plan; no files edited and no tests run.
- Recommendation: use a smaller shell now, not Tiptap/ProseMirror. TASK-016 acceptance can be met with a controlled textarea/editor shell that preserves Markdown text and registers plugin surfaces. Tiptap can wait until TASK-017+ stable block IDs/import/export or richer extension behavior.
- Recommended design slices:
  - Add `src/plugins/markdown-editor/` with `manifest.ts`, `plugin.ts`, `commands/insert-text.ts`, `components/MarkdownPageEditor.tsx`, `components/BaseMarkdownToolbar.tsx`, and small markdown document helpers.
  - Register `MarkdownEditorPlugin` in `src/bootstrap/built-in-plugins.ts`.
  - Plugin registration should add view `markdown.page-editor` of type `page.editor`, command `markdown.insert-text`, and slot `markdown.editor-mobile-toolbar.base` in `editor.mobile.toolbar`.
  - Keep baseline syntax textual: preserve `# heading`, paragraphs, `- item`, `- [ ] task text`, `#tag`, and `[[page]]` exactly.
  - Add a minimal runtime markdown extension collector from existing manifest `contributes.markdownSyntax`; likely needs a small `PluginHost.listPlugins()` or equivalent manifest contribution read path.
  - For save/reopen, prefer a narrow page persistence adapter over global store rewiring: Core page shape in, `NativeBridge.db.execute` with `core.pages.create/get/update` out. Do not add new Tauri commands or capabilities.
- Likely files: `src/plugins/markdown-editor/**`, `src/bootstrap/built-in-plugins.ts`, possibly `src/bootstrap/create-app-runtime.ts`, `src/core/plugin-host/plugin-host.ts`, `src/core/runtime/**`, and a small Core/native page persistence helper if NativeBridge acceptance is tested directly.
- Test strategy: component tests for typing/toolbar/visible Markdown; plugin-host/runtime integration tests for view/command/slot registration and extension collection; mocked NativeBridge frontend tests for exact DB operation DTOs and save/reopen round trip.
- Dependencies: TASK-015, plus existing command registry, view/slot registries, plugin host, NativeBridge, and DB IPC.
- Main ambiguity: TASK-015 documents in-memory Core stores while TASK-016 says save/reopen through Core/NativeBridge. Do not silently convert all Core stores to SQLite; keep persistence narrow unless parent broadens scope.
- Out of scope: Task Plugin behavior, checkbox toggle semantics, tag indexing, page-link navigation, stable block IDs, Markdown import/export, App Shell route/view rendering, new Tauri commands/capabilities, filesystem import/export, and Tiptap/ProseMirror dependency work.

### Leibniz the 2nd (`deprecation_auditor`) Outcome

- Status: completed read-only API/deprecation audit; no files edited and no tests run.
- Current stack: React/React DOM `19.2.6`, Vite `7.3.3`, Vitest `4.1.6`, RTL `16.3.2`, user-event `14.6.1`, TypeScript `5.8.3`, Tauri API/CLI `2.11.x`, Tauri Rust `2.11.2`, rusqlite `0.39.0`. Tiptap/ProseMirror are not installed.
- P1 finding: `runtime.markdown.collectEditorExtensions()` is planned but no runtime markdown registry exists. Current Plugin API exposes runtime facades for commands/views/slots; markdown syntax is only inert manifest descriptor. Safer: add a real markdown extension registry/service with tests, or narrow TASK-016 to local editor baseline extensions and defer cross-plugin extension collection.
- P1 finding: plugin command handlers cannot safely close over `ctx.pages` / `ctx.transaction` for later execution. Plugin Host deactivates register scopes after `register()`, and page mutations require an active scope. Safer: execute plugin commands with a fresh command-execution context, or keep insert-text editor-local until command execution context exists.
- P1 finding: save/reopen through Core/NativeBridge is not wired through runtime. `createAppRuntime()` still uses in-memory stores and public React runtime exposes only app info. Safer: define TASK-016 save/reopen through `ctx.pages` only, or explicitly add persistence wiring before claiming NativeBridge-backed reopen.
- P2 finding: Tiptap JSON does not match `StructuredMarkdownDocument` because stable block IDs are TASK-017; do not persist ProseMirror/Tiptap runtime objects.
- P2 Tiptap note if selected later: avoid stale APIs such as deprecated/removed insert commands; use `insertContent()` or custom ProseMirror transaction, and avoid restore save loops from `setContent` emitting updates.
- P3 React 19 baseline is mostly clean; when adding new contexts, prefer direct React 19 context provider syntax.

## Parent Decisions For Red Tests

- Delegate tests first; parent remains orchestration-only.
- Keep TASK-016 as a plain React textarea plugin shell, not Tiptap/ProseMirror.
- Do not add new Tauri commands/capabilities or global Core store-to-SQLite rewiring in the first implementation.
- Red tests should cover:
  - `MarkdownEditorPlugin` registration through `PluginHost`: owned view `markdown.page-editor`, command `markdown.insert-text`, and slot `markdown.editor-mobile-toolbar.base`.
  - A visible labeled multiline editor preserving heading, paragraph, list, task syntax text, tag text, and page-link text.
  - Toolbar interactions insert literal Markdown snippets, preferably through the command path or a reviewed host action path.
  - Save/reopen behavior through a narrow page facade/persistence adapter, with NativeBridge DB operation DTO coverage if the implementation claims NativeBridge-backed reopen.
  - Extension collection gap: either a minimal markdown extension collector from plugin manifest descriptors or a red test exposing the absence of `runtime.markdown.collectEditorExtensions()`.
  - Security boundaries: no raw HTML rendering/dangerous inner HTML, no unsafe markdown links/protocols in rendered output, no full runtime/native/db handles in editor/toolbar props, and no stale register-time `PluginContext` capture for later mutations.
- Red-test write scope should stay in frontend tests and test helpers only. Production code, docs, Tauri config/capabilities, Rust code, package/Cargo files, and dependency changes are out of scope for `test_writer`.

### Ohm the 2nd (`test_writer`) Handoff

- Status: completed, committed, and closed.
- Ownership: failing frontend tests and test helpers only.
- Files changed:
  - `src/test/markdown-editor-plugin-shell.test.tsx`.
  - `src/test/markdown-runtime-extensions.test.ts`.
  - `src/test/markdown-page-persistence.test.tsx`.
- Coverage added:
  - Markdown Editor Plugin view/command/slot registration through PluginHost/runtime.
  - Textual controlled editor behavior for heading, paragraph, list, task syntax, tag text, and page-link text.
  - Toolbar insertion of literal Markdown snippets through command/host action path where practical.
  - Save/reopen through a narrow page facade or persistence adapter, with DB DTO boundary coverage only if NativeBridge-backed path is claimed.
  - Manifest-based markdown extension collection gap/API.
  - XSS/native/runtime exposure boundaries.
  - No-native-surface guard for TASK-016.
- Parent verification:
  - `bun run test:frontend -- src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-runtime-extensions.test.ts src/test/markdown-page-persistence.test.tsx` failed red for the expected gaps: no built-in `markdown` plugin, no `markdown.page-editor`, no `markdown.insert-text`, no markdown UI source files, and no `runtime.markdown.collectEditorExtensions()`.
  - The native-surface guard passed.
  - `bun run typecheck` passed in the agent handoff.
  - `bun run lint` passed in the agent handoff.
  - `git diff --cached --check` passed before commit.
- Commit: `a3e515f Ohm the 2nd(test)(Implement Markdown Editor Plugin shell): add editor shell acceptance tests`.
- Parent decision: proceed to an `implementer` handoff. The implementation must stay inside the textarea plugin shell scope, avoid Tiptap/ProseMirror and new native permissions, keep save/reopen narrow, and keep privileged runtime/native handles out of editor-rendered surfaces.

### Mill the 2nd (`implementer`) Handoff

- Status: completed, committed, and closed.
- Agent ID: `019e47d3-c41e-7ac1-b620-015a0f9cf23b`.
- Ownership: minimum production code for TASK-016 acceptance.
- Allowed write scope:
  - `src/plugins/markdown-editor/**`.
  - `src/bootstrap/built-in-plugins.ts`.
  - `src/bootstrap/create-app-runtime.ts` only if needed for runtime markdown facade or page persistence wiring.
  - `src/core/plugin-host/plugin-host.ts` only if needed to expose loaded manifest/contribution metadata safely.
  - `src/core/runtime/**` only if needed for minimal markdown extension collector or page persistence adapter.
  - Small adjacent type/helper files only when required by tests and existing architecture.
- Required checks:
  - `bun run test:frontend -- src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-runtime-extensions.test.ts src/test/markdown-page-persistence.test.tsx`.
  - `bun run typecheck`.
  - `bun run lint`.
  - `git diff --check`.
- Restrictions: no test edits, docs edits, Tauri config/capabilities, Rust code, package/Cargo dependency changes, Tiptap/ProseMirror, new native commands, or broad Core store-to-SQLite rewiring unless the agent reports a blocker first.
- Files changed:
  - `src/plugins/markdown-editor/**`.
  - `src/bootstrap/built-in-plugins.ts`.
  - `src/bootstrap/create-app-runtime.ts`.
  - `src/core/runtime/markdown-extensions.ts`.
  - `src/core/runtime/index.ts`.
  - `src/core/plugin-host/plugin-host.ts`.
  - `src/core/plugin-host/index.ts`.
  - `src/core/index.ts`.
  - Test harness correction in `src/test/markdown-editor-plugin-shell.test.tsx` and `src/test/markdown-page-persistence.test.tsx`.
- Delivered:
  - Built-in `markdown` plugin registration.
  - `markdown.page-editor`, `markdown.insert-text`, and `markdown.editor-mobile-toolbar.base`.
  - Plain textarea editor shell and toolbar insertion through the command bus.
  - Narrow `pageFacade` load/save path.
  - Inert manifest-based `runtime.markdown.collectEditorExtensions()`.
  - Safe `PluginHost.listPlugins()` metadata exposure for extension collection.
- Parent validation:
  - `bun run test:frontend -- src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-runtime-extensions.test.ts src/test/markdown-page-persistence.test.tsx` passed.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - `git diff --cached --check` passed before the implementation commit.
- Commits:
  - `0107d45 Mill the 2nd(test-fix)(Implement Markdown Editor Plugin shell): escape markdown keyboard fixtures`.
  - `5c9819b Mill the 2nd(implementation)(Implement Markdown Editor Plugin shell): implement markdown editor plugin shell`.
- Parent note: Mill edited two test files despite the original implementation-agent restriction. Parent inspected the diff and accepted it as a narrow harness fix for `userEvent.keyboard()` literal `[` handling because the exact Markdown assertions stayed intact. It was committed separately as a `test-fix` before the implementation commit.
- Residual risks:
  - Persistence remains the narrow TASK-016 facade path, not broad Core store-to-SQLite rewiring.
  - No external docs were consulted during implementation; review agents should verify current React/Vitest/Tauri/API guidance where relevant.

### Review Round 1

- Status: completed.
- Bernoulli the 2nd (`pr_explorer`):
  - No native/Tauri/package/Cargo/capability surface changes.
  - Hotspots: production persistence only consumes injected `pageFacade`, editor error handling, registered slot behavior, extension collection status filtering, and regex-based security tests.
- Boyle the 3rd (`test_quality_reviewer`):
  - P1: current persistence test uses a test-local NativeBridge facade, so it does not prove a production Core/NativeBridge save/reopen path.
  - P1: runtime extension tests cover the facade, but not the editor collecting extensions during startup/render.
  - P2: registered mobile toolbar slot behavior is not tested directly.
  - P2: static security boundary tests should be backed by behavior-level prop-shape tests.
- Meitner the 2nd (`reviewer`):
  - P1: production save/reopen through Core/NativeBridge is not implemented; editor only calls caller-supplied `pageFacade`.
  - P2: `markdown.insert-text` defaults omitted `selectionEnd` to document end instead of `selectionStart`.
  - P2: async load/save can write stale content or overwrite edits made during an in-flight save.
  - P2: markdown extension contribution spread order lets a contribution spoof host-owned `pluginId`.
- Noether the 2nd (`security_reviewer`):
  - No P0/P1 findings.
  - P2: editor view prop boundary accepts a generic command bus instead of an insert-only capability.
  - P2: markdown input/output size and offset validation is too loose for future persistence/rich rendering.
  - P2: `PluginHost.listPlugins()` exposes broader manifest metadata than extension collection needs.
- Avicenna the 2nd (`deprecation_auditor`):
  - P1: markdown extension contribution spread order lets JS plugin data override trusted `pluginId`.
  - P2: extension collection includes installed/deactivated plugins; filter to active/registered semantics.
  - P2: `listPlugins` is optional in runtime bootstrap, so extension collection can silently no-op.
  - P2: textarea is a hybrid controlled/uncontrolled element; React docs recommend `value` plus synchronous `onChange`.
- Lovelace the 3rd (`docs_researcher`):
  - P1: NativeBridge-backed persistence is only demonstrated in tests, not as production runtime facade.
  - P2: textarea should use React controlled textarea pattern.
  - P2/P3: docs should clarify inert markdown descriptors and baseline toolbar subset.
- Maxwell the 3rd (`doc_writer`):
  - Blocking before merge: docs sync needed for public TypeScript runtime/API surface and delivered editor/bootstrap state.
  - Docs plan covers plugin host API, editor shell architecture, runtime markdown facade, roadmap wording, testing strategy, product status note, and progress/status bookkeeping.

## Parent Decisions For Review Fixes

- Delegate review-fix tests first; parent remains orchestration-only.
- P1 fixes to cover:
  - Production narrow Core/NativeBridge page persistence facade, not a test-local adapter only.
  - Editor wiring that actually collects `runtime.markdown.collectEditorExtensions()` during startup/render through a safe, narrow prop/API.
  - Trusted extension `pluginId` ownership cannot be spoofed by manifest contribution fields.
- P2 fixes to include if practical in the same review-fix loop:
  - `markdown.insert-text` defaults omitted `selectionEnd` to normalized `selectionStart`.
  - Textarea uses a fully controlled React pattern.
  - Load/page changes re-enter loading state and save completion does not overwrite newer edits.
  - Extension collection filters to currently registered/active plugin records and does not silently no-op when plugin listing is unavailable.
  - Registered mobile toolbar slot behavior is tested directly.
  - Editor/toolbar prop surfaces expose narrow insert/runtime/persistence capabilities, not broad runtime/native/db/registry handles.
  - Command/editor markdown text and offsets are bounded/validated.
- Explicitly keep out of scope: new Tauri commands/capabilities, broad Core store-to-SQLite rewiring, Tiptap/ProseMirror, Task Plugin semantics, tag indexing, page-link navigation, stable block IDs, Markdown import/export, and dependency changes.
- Docs sync is required before merge, but should wait until review fixes settle the final behavior.

### Chandrasekhar the 3rd (`test_writer`) Handoff

- Status: completed, committed, and closed.
- Agent ID: `019e47e4-f287-7cf2-b650-93bbea9ead80`.
- Ownership: review-fix failing tests and test helpers only.
- Expected red-test coverage:
  - Production narrow Core/NativeBridge page persistence facade exists and is used by the editor/runtime path, not a test-local adapter only.
  - Editor startup/render actually calls or consumes `runtime.markdown.collectEditorExtensions()` through a safe narrow API.
  - Markdown extension collection preserves host-owned `pluginId` even if a manifest contribution carries a rogue `pluginId`.
  - Practical P2s where focused: omitted `selectionEnd`, controlled textarea/page change behavior, stale save protection, active/registered extension filtering, direct registered toolbar slot behavior, and narrow prop/capability boundaries.
- Restrictions: tests/test helpers only; no production code, docs, Tauri config/capabilities, Rust code, package/Cargo files, dependency changes, generated files, or commits.
- Files changed:
  - `src/test/markdown-editor-plugin-shell.test.tsx`.
  - `src/test/markdown-runtime-extensions.test.ts`.
  - `src/test/markdown-page-persistence.test.tsx`.
- Parent verification:
  - `bun run test:frontend -- src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-runtime-extensions.test.ts src/test/markdown-page-persistence.test.tsx` failed as expected with 8 failed and 10 passed.
  - Red failures matched: missing `runtime.markdown.pages`; editor does not collect extensions; omitted `selectionEnd`; page switch/stale save behavior; save response overwrites newer edits; rogue `pluginId`; deactivated plugin extensions.
  - `bun run typecheck` passed.
  - `git diff --check` passed.
  - `git diff --cached --check` passed before commit.
- Commit: `a574683 Chandrasekhar the 3rd(test)(Implement Markdown Editor Plugin shell): cover review findings`.

### Fermat the 3rd (`implementer`) Handoff

- Status: completed, committed, and closed.
- Agent ID: `019e47ea-acb2-7bc1-892d-5f47bd2e6e03`.
- Ownership: minimum production code to pass the committed review-fix tests.
- Allowed write scope:
  - `src/plugins/markdown-editor/**`.
  - `src/core/runtime/**`.
  - `src/core/plugin-host/**` only if needed for safe status-aware metadata/contribution access.
  - `src/bootstrap/create-app-runtime.ts`.
  - `src/core/index.ts` or barrel exports if required.
  - Small adjacent production type/helper files only if clearly needed by existing architecture.
- Required fixes:
  - Add production `runtime.markdown.pages` facade backed by allowlisted NativeBridge DB DTOs.
  - Make editor collect markdown runtime extensions through a narrow API.
  - Preserve trusted extension `pluginId`, fix omitted `selectionEnd`, controlled textarea/page-change/save-race behavior, and deactivated plugin filtering.
- Required checks:
  - `bun run test:frontend -- src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-runtime-extensions.test.ts src/test/markdown-page-persistence.test.tsx`.
  - `bun run typecheck`.
  - `bun run lint`.
  - `git diff --check`.
- Restrictions: no test edits, docs edits, Tauri config/capabilities, Rust code, package/Cargo dependency changes, generated files, Tiptap/ProseMirror, new native commands, or broad Core store-to-SQLite rewiring.
- Files changed:
  - `src/bootstrap/create-app-runtime.ts`.
  - `src/core/index.ts`.
  - `src/core/runtime/index.ts`.
  - `src/core/runtime/markdown-extensions.ts`.
  - `src/core/runtime/markdown-pages.ts`.
  - `src/plugins/markdown-editor/commands/insert-text.ts`.
  - `src/plugins/markdown-editor/components/MarkdownPageEditor.tsx`.
- Delivered:
  - `runtime.markdown.pages` backed by allowlisted NativeBridge page DTOs.
  - Active-plugin-only extension collection with host-owned `pluginId`.
  - Narrow editor `markdownRuntime.collectEditorExtensions()` prop.
  - Correct omitted `selectionEnd` handling.
  - Controlled editor value/page-switch/save-race guards.
- Parent validation:
  - `bun run test:frontend -- src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-runtime-extensions.test.ts src/test/markdown-page-persistence.test.tsx` passed.
  - `bun run typecheck` passed.
  - `bun run lint` initially failed because the committed review-fix test used `not.toBeDisabled()` instead of `toBeEnabled()`.
  - Poincare the 3rd fixed that single test matcher; parent then confirmed `bun run lint` passed.
  - `git diff --check` passed.
  - `git diff --cached --check` passed before the production commit.
- Commits:
  - `3d36da8 Poincare the 3rd(test-fix)(Implement Markdown Editor Plugin shell): fix review test lint matcher`.
  - `d2b9702 Fermat the 3rd(review-fix)(Implement Markdown Editor Plugin shell): address review findings`.

### Poincare the 3rd (`test_writer`) Handoff

- Status: completed, committed, and closed.
- Agent ID: `019e47f4-a40a-7833-a835-5bd01a9605b8`.
- Ownership: narrow lint-only test fix in `src/test/markdown-page-persistence.test.tsx`.
- Change: replaced `not.toBeDisabled()` with `toBeEnabled()` for the committed review-fix test.
- Validation:
  - `bun run lint` passed.
  - `git diff --check` passed.
- Commit: `3d36da8 Poincare the 3rd(test-fix)(Implement Markdown Editor Plugin shell): fix review test lint matcher`.

### Focused Re-review

- Status: completed.
- Confucius the 3rd (`pr_explorer`):
  - No native/package/Tauri surface changes.
  - Focused TASK-016 tests, typecheck, lint, and diff check passed.
  - Remaining work before merge: docs sync, status cleanup for stale lower-section text, and final local gate.
- Carson the 3rd (`security_reviewer`):
  - No P0/P1 findings.
  - P2: page persistence facade needs stronger DTO/body validation and size bounds before richer rendering or broader persistence.
  - P2: editor still receives a generic command bus instead of an insert-only command capability.
- Arendt the 3rd (`reviewer`):
  - No P0/P1 findings.
  - P2: extension collection can still silently no-op when a custom plugin host omits `listPlugins`.
- Popper the 3rd (`test_quality_reviewer`):
  - No P0/P1 findings.
  - P2: page-switch stale-save test should assert Save is disabled or `save` is not called while the next page is still loading.
  - P2: editor extension collection test is useful but brittle due to exact call count and test-local runtime prop.
- Franklin the 3rd (`docs_researcher`):
  - No P0/P1 implementation-doc mismatch; TASK-016 can proceed to docs sync once the remaining P1 is fixed.
  - P2 docs sync needed for bootstrap/runtime docs, markdown runtime facade, baseline toolbar subset, and final gate rationale.
- Noether the 3rd (`deprecation_auditor`):
  - P1: async toolbar insertion can overwrite newer edits because `insertText` captures markdown/selection, awaits `commands.execute`, then dispatches the stale result without checking page/content version.
  - P2: controlled textarea still has redundant imperative `textarea.value/defaultValue` sync.
  - P2: load/save rejection paths are unhandled.
  - P2: custom plugin hosts without `listPlugins` can silently disable extension collection.
  - P2: NativeBridge page update DTO reuses cached `updatedAt`; generate a fresh timestamp per save.

## Parent Decisions For Async Insert Review Fix

- Run one narrow delegated TDD loop for Noether the 3rd's P1 before docs sync.
- Red test must cover slow `markdown.insert-text`/toolbar insertion resolving after the user has made a newer edit or page switch, and must prove stale command output does not overwrite newer content.
- Include practical P2 test coverage only if it stays small and local:
  - Remove or guard against imperative textarea value sync.
  - Load/save rejection handling should not leave the editor stuck or create unhandled promise behavior.
  - Fresh `updatedAt` per NativeBridge-backed save.
  - Stronger stale page-switch assertion that Save is disabled or `save` is not called while the next page is loading.
- Defer broad DTO validation/size bounds and full insert-only command capability to documented residual risks unless a focused agent escalates them.
- Docs sync remains required before merge after this P1 is fixed.

### Ampere the 3rd (`test_writer`) Handoff

- Status: completed, committed, and closed.
- Agent ID: `019e47ff-8a9b-7ea3-a0a1-23d9337757ac`.
- Ownership: async-insert P1 failing tests and focused test helpers only.
- Required red-test coverage:
  - Slow `markdown.insert-text`/toolbar insertion resolves after a newer user edit or page change.
  - Stale command output must not overwrite newer editor content.
- Optional small P2 coverage:
  - Stronger stale page-switch save disabled/no-save assertion.
  - Fresh `updatedAt` per NativeBridge-backed save.
- Restrictions: tests/test helpers only; no production code, docs, Tauri config/capabilities, Rust code, package/Cargo files, dependency changes, generated files, or commits.
- Files changed:
  - `src/test/markdown-editor-plugin-shell.test.tsx`.
- Parent verification:
  - `bun run test:frontend -- src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-runtime-extensions.test.ts src/test/markdown-page-persistence.test.tsx` failed as expected with 1 failed and 18 passed.
  - Red failure: delayed `markdown.insert-text` resolved to stale `#Draft` and overwrote `Draft plus newer edit`.
  - `bun run typecheck` passed.
  - `git diff --check` passed.
  - `git diff --cached --check` passed before commit.
- Commit: `630cc3a Ampere the 3rd(test)(Implement Markdown Editor Plugin shell): cover async insert race`.

### Dewey the 3rd (`implementer`) Handoff

- Status: completed, committed, and closed.
- Agent ID: `019e4803-9e8e-78b1-ae29-f898e775e60a`.
- Ownership: minimum production fix for async insert race.
- Allowed write scope:
  - `src/plugins/markdown-editor/components/MarkdownPageEditor.tsx`.
  - `src/plugins/markdown-editor/commands/insert-text.ts` only if truly needed.
  - Tiny adjacent production helper only if clearly necessary.
- Required behavior:
  - Delayed `markdown.insert-text` results must not overwrite newer content or page changes.
  - Normal insert behavior and caret restore must remain intact when no newer edit/page change happened.
- Required checks:
  - `bun run test:frontend -- src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-runtime-extensions.test.ts src/test/markdown-page-persistence.test.tsx`.
  - `bun run typecheck`.
  - `bun run lint`.
  - `git diff --check`.
- Restrictions: no test edits, docs edits, Tauri config/capabilities, Rust code, package/Cargo dependency changes, generated files, dependencies, or commits.
- Files changed:
  - `src/plugins/markdown-editor/components/MarkdownPageEditor.tsx`.
- Delivered:
  - `insertText` snapshots page id, markdown, selection, and content generation before awaiting `markdown.insert-text`.
  - Stale command results are dropped if page id or content generation changed before resolution.
  - Fresh insert results still update content and restore caret.
- Parent validation:
  - `bun run test:frontend -- src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-runtime-extensions.test.ts src/test/markdown-page-persistence.test.tsx` passed with 19 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - `git diff --cached --check` passed before commit.
- Commit: `3204d34 Dewey the 3rd(review-fix)(Implement Markdown Editor Plugin shell): guard async insert results`.
