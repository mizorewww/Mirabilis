# Testing Strategy

This strategy is the local release gate for Mirabilis. GitHub CI is intentionally not required during the current agent-development phase.

## Current Stack

- Tauri v2 desktop app.
- React 19 frontend.
- Vite 7 build pipeline.
- Vite 7 requires Node.js 20.19+ or 22.12+ when Vite/Vitest tooling runs through Node-based environments; keep local Node on a matching version even though package scripts are launched with Bun. See [Vite 7 Node.js support](https://v7.vite.dev/guide/migration#node-js-support).
- TypeScript 5.8.
- Bun lockfile and Bun-based Tauri commands.
- Rust 2021 crate under `src-tauri`.

## Test Principles

- Write failing tests before production implementation when a task has acceptance criteria.
- Test observable behavior instead of internal implementation details.
- Do not delete, skip, or weaken tests to make a branch pass.
- Prefer the smallest test that proves the acceptance criterion.
- Keep architecture assertions close to the boundary they protect.
- When docs or APIs are unclear, run `docs_researcher` before writing tests.

## Recommended Layers

| Layer | What It Tests | Tooling |
| --- | --- | --- |
| React component | Forms, command UI, editor affordances, visible errors, user interaction | Vitest + React Testing Library |
| Frontend API wrapper | Tauri invoke wrapper behavior and typed errors | Vitest with boundary mocks |
| Core type contracts | exported domain type shapes, type-only invariants, module entrypoints | Vitest `expectTypeOf` tests |
| Core kernel | stores, registries, command bus, event bus, filter engine | Vitest unit tests |
| Plugin runtime | manifest parsing, lifecycle ordering, registration, dependency handling | Vitest integration tests |
| Rust domain/service | SQLite repositories, DTO validation, filesystem-safe helpers | `cargo test` |
| Tauri IPC contract | command names, request DTOs, response DTOs, error shape | Rust integration tests or mock runtime where practical |
| E2E smoke | real app path for Markdown page -> task page -> timer -> note | Tauri WebDriver later |
| Security review | Tauri capabilities, filesystem, IPC, local data, plugin boundaries | `security_reviewer` + targeted tests |

## Reference Direct Commands

These commands were the pre-TASK-001 baseline and remain useful when debugging individual frontend build or Rust check failures. The active local gates are the Bun scripts below.

```bash
bun run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features
```

## Local Package Scripts

TASK-001 establishes these Bun scripts for local validation:

```json
{
  "scripts": {
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.node.json",
    "lint": "eslint . --max-warnings=0",
    "test:frontend": "NODE_ENV=test vitest run",
    "test:rust": "cargo test --manifest-path src-tauri/Cargo.toml --all-features",
    "fmt:rust": "cargo fmt --manifest-path src-tauri/Cargo.toml --check",
    "clippy": "cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features -- -D warnings",
    "check:quick": "bun run typecheck && bun run lint && bun run test:frontend && bun run fmt:rust && bun run clippy && bun run test:rust",
    "check:full": "bun run check:quick && bun run tauri build"
  }
}
```

Frontend tests use Vitest with the project-level `jsdom` environment and `src/test/setup.ts` for `@testing-library/jest-dom/vitest` matchers. React Testing Library 16+ requires the `@testing-library/dom` peer dependency to be installed explicitly. ESLint uses flat config presets for React Hooks, Vite React Refresh, Testing Library, and jest-dom, with Testing Library and jest-dom rules scoped to test files. Run tests with `bun run test:frontend`; do not use `bun test` for this app.

## Focused Test Guidance

For each task in `docs/implementation/task-index.md`:

- `test_writer` writes the smallest failing tests for the task acceptance criteria.
- `implementer` makes those focused tests pass with minimum production code.
- For Core-owned TypeScript contracts, prefer Vitest type assertions such as `expectTypeOf` plus small runtime samples that prove exports are usable from the public module entrypoint.
- For Core boundary rules, keep grep-style architecture tests scoped to production Core files so business-plugin terms are blocked without coupling tests to implementation details.
- `test_quality_reviewer` checks whether tests cover behavior instead of implementation details.
- `reviewer` checks for missing edge cases.
- `security_reviewer` runs for IPC, permission, filesystem, SQLite, or plugin-boundary changes.
- `deprecation_auditor` runs for dependency, framework, or API changes.

## Rust SQLite Repository Guidance

For private Rust repository work under `src-tauri/src/db`, tests should use temporary file-backed databases rather than only in-memory databases. File-backed tests must apply migrations, insert data, reopen the same path, apply migrations again, and verify existing data is still present.

SQLite persistence tests should cover:

- `PRAGMA user_version` and `PRAGMA foreign_keys` on opened connections.
- `core_schema_migrations` ledger rows, migration names/checksums, repeat application, and future/drift behavior when implemented.
- Expected tables, columns, foreign keys where present, and indexes for Core repository queries, including `core_plugin_indexes.plugin_id -> core_plugins(id) ON DELETE CASCADE`.
- JSON round trips through repository DTOs, including SQL `NULL` versus JSON `null`.
- Corrupt JSON stored in JSON columns returning typed repository errors instead of panics or raw parse failures.
- Deterministic list ordering with explicit `ORDER BY`.
- SQL-injection-looking strings preserved literally in records while tables remain queryable.
- Typed table-specific repositories for pages, metadata, events, filters, plugins, command descriptors, and view descriptors instead of a generic SQL executor.

Boundary scans for SQLite work should keep stable architecture contracts narrow: no `tauri-plugin-sql` dependency/configuration, no frontend/plugin raw-SQL DTO, and no `sql` / `params` shape in TypeScript `DbQuery`. Temporary TASK-013 assertions that no DB IPC or capability exists must not become long-lived blockers for TASK-014; once DB IPC is implemented, tests should instead verify reviewed operation allowlists, DTOs, and Tauri capability scope.

TASK-013 repository persistence does not by itself require app-data path, provider/bootstrap, IPC, or capability tests because it is private Rust persistence only. When a task wires persistence into the app runtime or Tauri IPC, add checks for app database path ownership, capability permissions, safe IPC error DTOs, operation allowlisting, and bootstrap lifecycle. WAL, `busy_timeout`, and `PRAGMA trusted_schema = OFF` are deferred bootstrap hardening topics unless a task explicitly changes connection policy.

For TASK-014 DB IPC, the durable gate is: `db_execute` / `db_transaction` are the only registered TASK-014 app commands, `DbQuery.operation` matches the reviewed 15-operation allowlist, generated permission TOMLs map `allow-db-execute` and `allow-db-transaction` to `commands.allow`, default capability grants only those DB command permissions for this task, IPC errors remain redacted, and transactions roll back earlier writes on validation or persistence failure.

## TASK-015 App Bootstrap and Runtime Provider Guidance

TASK-015 tests should cover the observable app bootstrap/provider contract without adding business plugin behavior:

- Ordered `createAppRuntime()` bootstrap with injected factories: `createTauriNativeBridge()` -> storage facade `{ persistence: "in-memory-core" }` -> Core stores -> Core registries -> Core services -> `PluginHost` -> runtime object -> `loadBuiltInPlugins(BUILT_IN_PLUGINS)` -> `activateAll()`. Later runtime facades such as TASK-016 `runtime.markdown` may be added to the runtime object without changing this ordering.
- TASK-015 originally asserted an explicit empty production `BUILT_IN_PLUGINS`. After TASK-021, production `BUILT_IN_PLUGINS` contains the built-in `markdown`, `task`, and `tag` plugins; bootstrap tests should inject explicit empty or fake plugin lists when they need to isolate load/activation behavior.
- Rejection propagation for startup failures, including `loadBuiltInPlugins()` and `activateAll()` failures; startup must not report a ready runtime after those failures.
- React StrictMode single-flight initialization so bootstrap and plugin activation are not duplicated during development double-mount behavior.
- Retry after a failed initializer mount with the same initializer; rejected initializer promises must not poison future mounts forever.
- Safe public runtime facade from `useRuntime()`: only copied/frozen `{ app: { version, pluginApiVersion? } }`, with no stores, registries, services, pluginHost, NativeBridge, raw invoke, db, storage, filesystem, file, or path APIs.
- `useRuntime()` guard outside `RuntimeProvider`.
- Generic visible startup failure alert that does not leak raw errors, stack traces, SQL, filesystem paths, plugin IDs, tokens, or causes.
- App Shell boundary checks for no raw Tauri imports, no task/habit/timer/calendar/editor business behavior, no business plugin owner imports, and no direct Core owner-module imports.
- Diff-based native-surface guard against `master` for Tauri config, capabilities, generated permissions, Rust command registration, Cargo files, and `src-tauri` command surfaces.

TASK-015 merge checks should include:

```bash
bun run test:frontend -- src/test/app-bootstrap-runtime.test.ts src/test/runtime-provider.test.tsx src/test/app-shell-boundary.test.ts
bun run typecheck
bun run lint
bun run build
bun run check:quick
```

Run `bun run check:full` only if later edits add or change persistence wiring, Tauri IPC, permissions/capabilities, filesystem/native behavior, packaging, or release behavior.

## TASK-016 Markdown Editor Plugin Shell Guidance

TASK-016 tests cover the first built-in editor plugin without adding a rich editor dependency or new native surface:

- Built-in `markdown` plugin is present in `BUILT_IN_PLUGINS` and registers owned `markdown.page-editor`, `markdown.insert-text`, and `markdown.editor-mobile-toolbar.base`.
- `MarkdownPageEditor` is a visible labeled multiline controlled textarea that preserves heading, paragraph, list, task syntax text, tag text, and page-link text exactly as Markdown.
- Toolbar buttons insert literal snippets `- [ ] `, `#`, and `[[ ]]` through `markdown.insert-text` / command-bus execution.
- `markdown.insert-text` normalizes offsets, treats omitted `selectionEnd` as normalized `selectionStart`, returns caret positions, and is covered through the real runtime command registry.
- Async insert results are guarded: a slow command result must not overwrite newer user edits or a page switch.
- `runtime.markdown.collectEditorExtensions()` collects only inert `contributes.markdownSyntax` descriptors from active plugin manifests, preserves host-owned `pluginId`, ignores deactivated plugins, and does not expose executable Tiptap / ProseMirror extensions.
- `runtime.markdown.pages` is covered as a production narrow NativeBridge page facade using allowlisted `core.pages.get` / `core.pages.update` DTOs, without raw `sql`, `params`, table names, filesystem paths, or file DTOs.
- Page load/save tests cover save/reopen, page-switch loading, stale save completion, disabled save while loading, and controlled value updates.
- Native-surface guard stays focused on proving TASK-016 did not change package/Cargo files, Tauri config, capabilities, generated permissions, Rust command registration, or native command surfaces.

Review-fix concerns that remain follow-up material unless a later task expands the editor or persistence surface: stronger Markdown DTO/body size validation, load/save rejection UX, insert-only command capability props instead of a generic command bus, and explicit behavior for custom plugin hosts without `listPlugins()`.

TASK-016 focused validation command:

```bash
bun run test:frontend -- src/test/markdown-editor-plugin-shell.test.tsx src/test/markdown-runtime-extensions.test.ts src/test/markdown-page-persistence.test.tsx
```

Run `bun run typecheck`, `bun run lint`, and `git diff --check` with the focused tests. Escalate to `bun run check:full` only if a later edit changes Tauri IPC, permissions/capabilities, filesystem/native behavior, packaging, or release behavior; TASK-016 uses existing DB IPC allowlisted operations and adds no new native commands or permissions.

## TASK-017 Stable Block IDs and Markdown Import/Export Guidance

TASK-017 tests cover internal textarea Markdown `<-> StructuredMarkdownDocument` conversion and the narrow persistence path:

- Public Core helpers are exported and tested: `importMarkdownToStructuredDocument`, `exportStructuredDocumentToMarkdown`, and `validateStructuredMarkdownDocument`.
- Import creates interim line-oriented `markdown.line` blocks, one block per Markdown line including blank lines, each with a unique nonblank `blockId`.
- Export preserves visible Markdown text for the tested textarea-supported samples, including headings, paragraphs, lists, checkbox syntax text, tags, page links, fenced code, raw HTML text, and `javascript:`-like link text as inert text.
- ID reconciliation uses the previous structured document and keeps stable IDs across ordinary edits, insertions, deletions, duplicate visible text, deleted-ID generator collisions, and similar inserted lines before edited old lines.
- `runtime.markdown.pages.load()` exports structured stored bodies to editor Markdown and keeps only the exact TASK-016 one-node `markdown.text` load fallback.
- `runtime.markdown.pages.save()` imports editor Markdown into structured bodies and uses only allowlisted `core.pages.get` / `core.pages.update`; new saves do not write `markdown.text`.
- Rust IPC validation for `core.pages.create` / `core.pages.update` rejects malformed structured bodies with redacted `INVALID_REQUEST`, including non-`doc` roots, missing/non-array content, missing/blank/duplicate `blockId`, excessive depth/count, structured `markdown.text`, invalid text/content, malformed `attrs` / `marks`, event-handler-like keys, and executable URL-like values.
- Native-surface guards should continue proving no new Tauri commands, capabilities, permissions, package/Cargo dependencies, filesystem import/export behavior, raw Tauri invoke usage, file/path DTOs, or HTML rendering sinks were added for TASK-017.

TASK-017 focused validation commands:

```bash
bun run test:frontend -- src/test/markdown-import-export.test.ts src/test/markdown-page-persistence.test.tsx
cargo test --manifest-path src-tauri/Cargo.toml --all-features --test ipc_persistence
bun run typecheck
bun run lint
git diff --check
```

Escalate to `bun run check:full` for future work that changes Tauri commands/capabilities, filesystem/native import-export, app-runtime persistence wiring, packaging, release behavior, or broader IPC contracts beyond the TASK-017 body validation now covered by focused Rust IPC tests.

## TASK-018 Task Plugin Syntax and Page Creation Guidance

TASK-018 tests cover the first built-in Task Plugin slice without adding automatic editor-save scanning, navigation, filters, views, or native surface:

- Built-in `task` plugin is present in `BUILT_IN_PLUGINS`, contributes inert checkbox syntax descriptor `- [ ]`, and registers owned command `task.resolve-task-block`.
- Resolver command tests should execute through the real runtime command bus with payload `{ sourcePageId, sourceBlockId }`; tests should not call plugin internals directly.
- Positive coverage should prove an unbound stable top-level `markdown.line` task block creates exactly one Markdown Page, derives the title from the current source block, writes `task.enabled`, `task.status`, `task.sourcePageId`, and `task.sourceBlockId`, and binds the source block with `attrs.boundPageId`.
- Duplicate coverage should use the full `(sourcePageId, sourceBlockId)` relation, including same `sourceBlockId` on different pages, metadata-only relation reuse, verified `attrs.boundPageId` reuse, and binding restoration after Markdown save/import drops attrs.
- Negative coverage should prove no mutation for invalid payloads, stale source blocks, duplicate top-level block IDs, non-task blocks, malformed checkbox lines, four-space or tab-indented code lines, fenced-code task-looking lines, forged/unverified `attrs.boundPageId`, and unsafe-looking title text that must remain inert data.
- Atomicity coverage should prove page creation, metadata writes, and source binding roll back together on resolver failure.
- Plugin Host lifecycle tests should cover command-time `PluginContext`: handler signature `PluginCommandHandler(input, context)`, fresh command execution context, command-time data mutation allowed, runtime contribution registration rejected during command execution, and stale command context writes rejected after command completion.
- Command Registry / Plugin Host tests should cover command error provenance: only Plugin Host-marked command execution failures preserve `CommandRegistryError.cause`; ordinary command handlers must keep raw causes redacted even if they throw PluginHostError-shaped plain objects or constructible `PluginHostError` instances.
- Native-surface guards should continue proving TASK-018 does not change package/Cargo files, Tauri config, capabilities, generated permissions, Rust command registration, filesystem behavior, or native command surfaces.

TASK-018 focused validation commands:

```bash
bun run test:frontend -- src/test/task-plugin-syntax-page-creation.test.ts src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts src/test/core-command-registry.test.ts
bun run typecheck
bun run lint
git diff --check
```

Run `bun run check:full` only if later edits add or change Tauri IPC, permissions/capabilities, filesystem/native behavior, package/Cargo dependencies, packaging, release behavior, or app-runtime persistence wiring. TASK-018 itself is TypeScript Core/plugin runtime behavior with no new native, IPC, permission, filesystem, package, or Rust surface.

## TASK-019 Task Navigation and Infinite Nesting Guidance

TASK-019 tests cover explicit task-title click/open navigation without adding automatic save-time scanning, filters/views, rich editor behavior, or native surface:

- Built-in `task` plugin registers owned command `task.open-task-page`.
- Open command tests should execute through the real runtime command bus with payload `{ sourcePageId, sourceBlockId }` and assert the return shape is exactly `{ pageId }`.
- Positive coverage should prove an unbound task opens once, creates/reuses a normal Markdown Page, writes the same `task.enabled`, `task.status`, `task.sourcePageId`, and `task.sourceBlockId` metadata relation as TASK-018, binds the source block, and exposes the opened page from the page source used by navigation.
- Relation coverage should prove verified `attrs.boundPageId` reuse, metadata-only recovery after attrs are lost, forged/unverified binding rejection, and malformed `attrs.boundPageId` being treated as absent/untrusted.
- Nested coverage should prove page A can contain a `- [ ] B` source block and `task.open-task-page({ sourcePageId: pageA.id, sourceBlockId })` opens/creates page B through the same source relation mechanism.
- Negative coverage should prove invalid payloads, missing/stale source pages or blocks, duplicate top-level block IDs, non-task blocks, and fenced/code-looking task lines fail without mutation or navigation.
- Editor coverage should use Testing Library user interactions and accessible role queries for structured-body task-title buttons. The UI must send only `{ sourcePageId, sourceBlockId }`, never navigate directly to `attrs.boundPageId`, and must call `onOpenPage` only with the command's returned `pageId`.
- Loaded editor coverage should pin the real `createMarkdownPageRuntimeFacade().load()` path carrying structured `body` into loaded `pageId/pageFacade` mode so reopened pages can render task-title buttons.
- Stale-navigation coverage should delay `task.open-task-page` and prove old results are ignored after page switches and same-page content edits.
- Unsaved-edit coverage should prove task-title buttons are hidden or disabled when current textarea Markdown no longer matches the structured body snapshot they came from.
- Unsafe-title coverage should prove task titles render as inert React text, not HTML, links, hrefs, or scriptable markup.
- Native-surface guards should continue proving TASK-019 does not change package/Cargo files, Tauri config, capabilities, generated permissions, Rust command registration, filesystem behavior, or native command surfaces.

TASK-019 focused validation commands:

```bash
bun run test:frontend -- src/test/task-navigation-infinite-nesting.test.tsx src/test/markdown-page-persistence.test.tsx src/test/task-plugin-syntax-page-creation.test.ts
bun run typecheck
bun run lint
git diff --check
```

Run `bun run check:full` only if later edits add or change Tauri IPC, permissions/capabilities, filesystem/native behavior, package/Cargo dependencies, packaging, release behavior, or app-runtime persistence wiring. TASK-019 itself is TypeScript plugin/runtime/editor behavior with no new native, IPC, permission, filesystem, package, or Rust surface.

## TASK-020 Checkbox Toggle and Task Events Guidance

TASK-020 tests cover checkbox-driven task status changes and task events without adding automatic save-time scanning, filters/views, rich editor behavior, or native surface:

- Built-in `task` plugin registers only the canonical command `task.toggle-status`; legacy snake_case or checkbox aliases must not be registered.
- Toggle command tests should execute through the real runtime command bus with payload `{ sourcePageId, sourceBlockId }` and assert the return shape is exactly `{ pageId, status }`, where `status` is `"todo" | "done"`.
- Completion coverage should prove an unchecked source task line toggles from `- [ ]` to `- [x]`, writes `task.status = "done"`, preserves source block attrs, binds `attrs.boundPageId`, and appends an event with `namespace: "task"` and `type: "completed"`.
- Reopen coverage should prove checked source task lines `- [x]` and `- [X]` toggle back to `- [ ]`, write `task.status = "todo"`, and append an event with `namespace: "task"` and `type: "reopened"`.
- Event payload coverage should include `taskPageId`, `sourcePageId`, `sourceBlockId`, `previousStatus`, and `status`; tests should not expect event `type` to be stored as dotted task event IDs.
- Negative coverage should prove no mutation for invalid payloads, extra untrusted payload fields, stale source blocks, duplicate top-level block IDs, non-task blocks, malformed checkbox lines, four-space or tab-indented code lines, fenced-code task-looking lines, and unsafe-looking title text that must remain inert data.
- Editor coverage should use Testing Library user interactions and accessible checkbox role queries. Checkbox clicks must send only `{ sourcePageId, sourceBlockId }`, must not navigate, and must keep task-title open behavior separate.
- Loaded editor coverage should include the real `pageId/pageFacade` path using `runtime.commands.execute("task.toggle-status", { sourcePageId, sourceBlockId })`, proving source Markdown/body update, metadata update, task event append, and checked checkbox visibility after completion.
- Stale-toggle coverage should delay `task.toggle-status` and prove old results are ignored after page switches and same-page content edits; repeated clicks for the same source block should be ignored while the first toggle is pending.
- Open/resolve boundary coverage should prove `task.open-task-page` can create, bind, and open an unresolved checked source task line as a `done` task page without writing completion/reopen events, while `task.resolve-task-block` remains unchecked-only.
- Native-surface guards should continue proving TASK-020 does not change package/Cargo files, Tauri config, capabilities, generated permissions, Rust command registration, filesystem behavior, or native command surfaces.

TASK-020 focused validation commands:

```bash
bun run test:frontend -- src/test/task-checkbox-toggle-events.test.tsx src/test/task-navigation-infinite-nesting.test.tsx src/test/task-plugin-syntax-page-creation.test.ts
bun run typecheck
bun run lint
git diff --check
```

Run `bun run check:full` only if later edits add or change Tauri IPC, permissions/capabilities, filesystem/native behavior, package/Cargo dependencies, packaging, release behavior, or app-runtime persistence wiring. TASK-020 itself is TypeScript plugin/runtime/editor behavior with no new native, IPC, permission, filesystem, package, or Rust surface.

## TASK-021 Tag Plugin Baseline Guidance

TASK-021 tests cover explicit Tag Plugin metadata recognition and page-scoped tag controls without adding automatic save-time scanning, background indexing, rich inline tokens, autocomplete, global metadata bar, tag-specific filter result rendering, or native surface:

- Built-in `tag` plugin is present in `BUILT_IN_PLUGINS`, contributes inert Markdown syntax descriptor `tag.hashtag` with syntax `#tag`, contributes metadata field descriptor `tag.tags` with `namespace: "tag"`, `key: "tags"`, and `valueType: "json"`, and registers owned commands `tag.refresh-tags`, `tag.add-tag`, `tag.remove-tag`, and `tag.create-filter`.
- `tag.refresh-tags` tests should execute through the real runtime command bus with payload `{ pageId }`; tests should prove it scans saved structured `markdown.line` blocks and replaces `tag.tags` exactly with current source tags or `[]`.
- Source extraction coverage should include headings, fenced code, escaped hashes, non-token boundaries such as `foo#bar`, URL-ish invalid source tokens, HTML-like fragments, non-ASCII tokens, control-ish tokens, trailing punctuation, duplicate tags, and the first 32 unique tags only.
- Normalization coverage should prove command and source tags trim input, strip at most one leading `#`, require raw ASCII slug before lowercasing, produce lowercase `string[]` values without `#`, cap each tag at 32 chars, and reject non-ASCII values such as `K` instead of Unicode case-folding them.
- `tag.add-tag` / `tag.remove-tag` tests should execute through the command bus with payload `{ pageId, tag }`, reject extra untrusted ownership fields, dedupe first-seen order, reject a 33rd unique page tag without mutation, and prove remove on a touched page writes explicit empty `[]`.
- UI coverage should render the registered `TagMetadataSlot` from `page.header.metadata` contribution `tag.page-header-metadata.tags` with order `300`, assert inert tag text display, accessible add/remove controls, exact command-bus payloads, invalid input feedback, and rejection of command results for the wrong page.
- `tag.create-filter` tests should prove it accepts only `{ tag }`, stores a plugin-owned filter named `#tag`, uses query `{ where: [{ field: "metadata.tag.tags", op: "includes", value: tag }] }`, sets `viewType: "page.list"`, and does not accept caller-supplied query, view type, plugin ownership, or source ownership.
- Native-surface guards should continue proving TASK-021 does not change package/Cargo files, Tauri config, capabilities, generated permissions, Rust command registration, filesystem behavior, or native command surfaces.

TASK-021 focused validation commands:

```bash
bun run test:frontend -- src/test/tag-plugin-baseline.test.tsx
bun run typecheck
bun run lint
git diff --check
```

Run `bun run check:full` only if later edits add or change Tauri IPC, permissions/capabilities, filesystem/native behavior, package/Cargo dependencies, packaging, release behavior, or app-runtime persistence wiring. TASK-021 itself is TypeScript plugin/runtime/slot behavior with no new native, IPC, permission, filesystem, package, Cargo, or Rust surface.

## TASK-022 All Tasks and Today Filter Guidance

TASK-022 tests cover a generic Core filter executor plus Task Plugin-owned default filters and registered rendering surfaces, without adding save-time scanning, global filter navigation, app-shell filter routes, JS filters, Event/plugin-index execution, native/Tauri/package/Rust changes, or persistence rewiring:

- Core filter coverage should prove `executeFilterQuery` is exported from the public Core entrypoint, takes current `pages`, `metadata`, `query`, optional deterministic `currentDate`, and optional `metadataOwnerReservations`, returns matching pages, excludes archived pages, and does not mutate stores.
- Query coverage should include metadata field paths, `eq`, `neq`, `gt`, `lt`, `includes`, `exists`, `and`, and `or`. Unknown/unsafe fields, malformed values, wrong value types, invalid date metadata, cyclic queries, and over-depth queries must fail closed.
- `within` coverage should document the current boundary: it remains a legal AST/store operator but the current page/metadata executor has no Event/plugin-index semantics and returns no matches.
- Owner-boundary coverage should prove Core stays business-agnostic and that built-in Task/Tag trust is enforced only when callers pass host-derived `metadataOwnerReservations`.
- Plugin Host coverage should prove valid manifest `metadataFields` derive reservations only for complete descriptors whose `namespace === manifest.id`, whose namespace/key are safe metadata segments, and whose `valueType` is valid. Malformed/non-array/incomplete descriptors must not reserve, and same-batch `loadBuiltInPlugins()` reservations must apply before install/register writes, including transaction-scoped writes.
- Task Plugin coverage should assert manifest metadata fields `task.enabled`, `task.status`, `task.sourcePageId`, `task.sourceBlockId`, `task.scheduled`, and `task.due`.
- All Tasks coverage should assert fixed id `task.filter.all-tasks`, name `All Tasks`, `viewType: "page.list"`, query `metadata.task.enabled eq true`, inclusion of done tasks, exclusion of archived pages, and rejection of forged non-task-owned task metadata when reservations are supplied.
- Today coverage should assert fixed id `task.filter.today`, name `Today`, `viewType: "page.list"`, enabled/not-done conditions, scheduled-or-due relative today matching, `valueType: "date"`, local `YYYY-MM-DD` values, deterministic `currentDate`, and fail-closed invalid/string-typed date metadata.
- UI coverage should resolve the registered view from `filter.viewType`, render `task.page-list` / `type: "page.list"` for page results, keep unsafe titles inert as React text, and render empty results through `filter.empty_state` using generic page copy.
- Native-surface guards should continue proving TASK-022 does not change package/Cargo files, Tauri config, capabilities, generated permissions, Rust command registration, filesystem behavior, or native command surfaces.

TASK-022 focused validation commands:

```bash
bun run test:frontend -- src/test/core-filter-engine.test.ts src/test/task-filters-view-rendering.test.tsx src/test/plugin-api-contracts.test.ts
bun run typecheck
bun run lint
git diff --check
```

Run `bun run check:full` only if later edits add or change Tauri IPC, permissions/capabilities, filesystem/native behavior, package/Cargo dependencies, packaging, release behavior, or app-runtime persistence wiring. TASK-022 itself is TypeScript Core/plugin/runtime/view behavior with no new native, IPC, permission, filesystem, package, Cargo, or Rust surface.

## TASK-023 Metadata UI Plugin Guidance

TASK-023 tests cover a reusable, plugin-driven metadata UI slice without adding a full renderer/editor registry, production app-shell/editor mounting, save-time scanning/indexing, or native/Tauri/package/Rust changes:

- Built-in plugin coverage should assert `metadata-ui` is present in `BUILT_IN_PLUGINS` and exports `MetadataBar`.
- Ordering coverage should render `page.header.metadata` through the real SlotRegistry and prove deterministic SlotRegistry order, including default order ties and existing Tag order `300`.
- Tag compatibility coverage should render `tag.page-header-metadata.tags` through `MetadataBar`, assert inert `#tag` text, accessible add/remove controls, exact `tag.add-tag` / `tag.remove-tag` payloads, wrong-page command-result rejection, and real runtime metadata mutation through owner commands.
- Task coverage should assert `task.page-header-metadata.current-fields` renders read-only values for current manifest fields `enabled`, `status`, `sourcePageId`, `sourceBlockId`, `scheduled`, and `due`, without `estimate` or editable widgets.
- Timer coverage for TASK-023 should treat the Timer metadata contribution as a slot reservation; current Timer runtime behavior is covered by TASK-024 tests.
- Boundary coverage should prove `MetadataBar` fails closed without Plugin Host ownership data, uses only active owner manifest `metadataFields`, rejects malformed/non-array descriptors, unsafe namespace/key segments, mismatched `sourcePluginId`, and mismatched stored `valueType`, and keeps trusted values prototype-safe.
- Security coverage should assert slot props remain narrow, command execution is scoped to the contributing plugin namespace, unsafe metadata values render as inert React text, and no raw runtime/store/registry/Plugin Host/NativeBridge/DB/filesystem/path/shell/notification/shortcut handles reach plugin-rendered slot UI.
- Native-surface guards should continue proving TASK-023 does not change package/Cargo files, Tauri config, capabilities, generated permissions, Rust command registration, filesystem behavior, or native command surfaces.
- Accepted residual test-hardening notes after TASK-023: future tests may cover stale/inactive host records, the `prototype` unsafe segment explicitly, and sloppy command-prefix edge cases such as `review` vs `reviewer`.

TASK-023 focused validation commands:

```bash
bun run test:frontend -- src/test/metadata-ui-plugin.test.tsx src/test/tag-plugin-baseline.test.tsx src/test/core-view-slot-registry.test.ts src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts
bun run typecheck
bun run lint
git diff --check
```

Run `bun run check:full` only if later edits add or change Tauri IPC, permissions/capabilities, filesystem/native behavior, package/Cargo dependencies, packaging, release behavior, or app-runtime persistence wiring. TASK-023 itself is TypeScript plugin/runtime/slot UI behavior with no new native, IPC, permission, filesystem, package, Cargo, or Rust surface.

## TASK-024 Timer Plugin Runtime Guidance

TASK-024 tests cover Timer Plugin lifecycle commands, active timer UI, and boundaries without adding Time Segment persistence, note pages, Calendar/Stats integration, native/Tauri/package/Rust changes, or schema-backed storage:

- Registration coverage should assert built-in `timer` registers only canonical commands `timer.start`, `timer.stop`, `timer.pause`, `timer.resume`, and `timer.switch`, plus `timer.global-active-bar` on `global.floating`.
- Start coverage should execute `timer.start({ pageId })`, assert page association, `timer.started` with payload `startAt`, active DTO `startedAt`, narrow DTO keys, and MetadataBar Start execution through the scoped Timer command executor.
- State-transition coverage should prove pause, resume, stop, active start-while-active, switch no-active, switch paused, switch same-page, and missing-page preservation behavior.
- Payload-boundary coverage should reject malformed, extra, caller-owned, prototype-shaped, accessor, symbol-keyed, non-enumerable, and unsafe-key payloads; `pause` / `resume` / `stop` should allow exact empty null-prototype payloads.
- UI coverage should render `timer.global-active-bar`, assert active page title and elapsed time remain visible/inert, and assert Pause / Resume / Stop execute exact Timer command IDs with `{}` payloads.
- Side-effect coverage should assert TASK-024 does not append `timer.time_segment_created`, create note pages, update Timer metadata totals, write timeline data, or change native/Tauri/package/Cargo/Rust surfaces.
- Security/static coverage should keep production Timer code free of fake-clock/global timer monkeypatches, `eval` / `Function(...)`, string timer handlers, production jsdom branches, and broad active-bar command execution. The fake timer cleanup compatibility shim is test-only in `src/test/setup.ts`.

TASK-024 focused validation commands:

```bash
bun run test:frontend -- src/test/timer-plugin-runtime.test.tsx src/test/metadata-ui-plugin.test.tsx src/test/tag-plugin-baseline.test.tsx src/test/core-view-slot-registry.test.ts src/test/plugin-host-lifecycle.test.ts
bun run typecheck
bun run lint
git diff --check
```

Run `bun run check:full` only if later edits add or change Tauri IPC, permissions/capabilities, filesystem/native behavior, package/Cargo dependencies, packaging, release behavior, app-runtime persistence wiring, or schema-backed Timer storage. TASK-024 itself is TypeScript plugin/runtime/slot UI behavior with no new native, IPC, permission, filesystem, package, Cargo, Rust, or persistence-schema surface.

## Merge Gate

Before merging to `master`:

1. Run focused tests for the changed behavior.
2. Run `bun run check:quick` for the branch local gate.
3. Run `bun run check:full` for changes touching Tauri IPC, permissions, filesystem, app-runtime persistence wiring, packaging, or release behavior. Private Rust repository persistence should still run focused `cargo test`, `fmt`, and `clippy`; escalate to `check:full` when it is exposed through IPC, capabilities, app data paths, bootstrap providers, or release packaging.
4. Fix P0/P1 review findings.
5. Record remaining P2/P3 findings as follow-up tasks when not fixed in the branch.
