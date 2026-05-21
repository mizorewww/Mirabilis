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
- TASK-015 originally asserted an explicit empty production `BUILT_IN_PLUGINS`. After TASK-016, production `BUILT_IN_PLUGINS` contains the built-in `markdown` plugin; bootstrap tests should inject explicit empty or fake plugin lists when they need to isolate load/activation behavior.
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

## Merge Gate

Before merging to `master`:

1. Run focused tests for the changed behavior.
2. Run `bun run check:quick` for the branch local gate.
3. Run `bun run check:full` for changes touching Tauri IPC, permissions, filesystem, app-runtime persistence wiring, packaging, or release behavior. Private Rust repository persistence should still run focused `cargo test`, `fmt`, and `clippy`; escalate to `check:full` when it is exposed through IPC, capabilities, app data paths, bootstrap providers, or release packaging.
4. Fix P0/P1 review findings.
5. Record remaining P2/P3 findings as follow-up tasks when not fixed in the branch.
