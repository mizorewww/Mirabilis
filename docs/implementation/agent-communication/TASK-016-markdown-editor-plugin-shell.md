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

- Status: implementation completed and committed; review handoff pending.
- Active agents: none.
- Completed agents:
  - Kuhn the 2nd (`planner`): scope and implementation plan completed.
  - Averroes the 2nd (`docs_researcher`): current docs research completed.
  - Leibniz the 2nd (`deprecation_auditor`): API/deprecation audit completed.
  - Confucius the 2nd (`security_reviewer`): security boundary review completed.
  - Ohm the 2nd (`test_writer`): red tests completed, verified red, committed, and closed.
  - Mill the 2nd (`implementer`): production implementation completed, validated, committed, and closed.
- Next parent step: spawn review agents for correctness, security, docs/current-guidance, API/deprecation, test quality, and docs gaps.

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
