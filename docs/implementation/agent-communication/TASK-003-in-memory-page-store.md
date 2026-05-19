# TASK-003 Agent Notes: Add In-Memory Page Store

## Task Context

- Task ID: TASK-003.
- Task name: Add in-memory Page Store.
- Branch: `feat/task-003-in-memory-page-store`.
- Worktree: `/home/aac6fef/Developer/mirabilis-task-003`.

## Source Docs

- `docs/implementation/task-index.md` TASK-003.
- `docs/architecture/02-core-kernel.md#41-markdown-page-store`.
- `docs/development/01-data-roadmap-and-mvp.md#271-core_pages`.

## Initial Scope

- Create, read, update, archive, and list Markdown pages in memory.
- Keep page IDs stable and unique.
- Handle `createdAt`, `updatedAt`, and `archivedAt` consistently.
- Preserve structured document bodies and stable block IDs.
- Stay within Core kernel behavior; do not add native persistence, Tauri IPC, UI, plugin behavior, or SQLite.

## Initial Decisions

- Use TASK-002 Core domain types from `src/core`.
- Keep the parent thread as orchestration-only.
- Delegate planning, docs research, tests, implementation, and review to agents.
- Use commit format `<agent-name>(<category>)(Add in-memory Page Store): <specific change>`.

## Agent Recommendations And Outcomes

### Schrodinger - planner

- Recommended files: `src/core/stores/page-store.ts`, `src/core/stores/index.ts`, `src/core/index.ts`, and `src/test/core-page-store.test.ts`.
- Recommended API: `createInMemoryPageStore`, `PageStore`, `CreatePageInput`, `UpdatePageInput`, and `ListPagesOptions`.
- Recommended sync in-memory methods: `create`, `get`, `update`, `archive`, and `list`.
- Recommended typed error: `PageStoreError` with a missing-page code and `pageId`; tests should not rely on brittle full message strings.
- Recommended archive/list semantics: `get` returns active or archived pages; `list()` returns active pages; `list({ includeArchived: true })` returns all pages; archive is non-destructive and idempotent.
- Recommended update semantics: preserve `id`, `createdAt`, and existing `archivedAt`; allow updating archived pages; `parentPageId: null` clears the parent and `undefined` means no parent change.
- Parent decision: accepted as the baseline for tests and implementation.

### Kierkegaard - docs_researcher

- Recommended current single-package layout under `src/core/stores`, not future monorepo package shape.
- Recommended dependency injection for deterministic tests: `createId` and `now`.
- Recommended defensive cloning at every boundary using `structuredClone`.
- Recommended collision detection for generated IDs.
- Verified TypeScript strict/type-only module guidance, Vitest test guidance, and `structuredClone` docs.
- Parent decision: accepted.

### Pasteur - deprecation_auditor

- P1 risk: mutable state leaks if caller-owned bodies are retained or stored page references are returned.
- P1 risk: hard-wired time/ID generation makes tests non-deterministic; inject `now` and `createId`.
- P1 risk: Node APIs such as `node:crypto` in `src/core` would be browser-compatibility hazards.
- Recommended no singleton store or module-level `Map`.
- Recommended avoiding fake timers unless needed; injected `now` is simpler.
- Verified Vitest global/fake timer guidance, Vite browser compatibility, TypeScript strict class fields, `structuredClone`, and `crypto.randomUUID`.
- Parent decision: accepted; tests must cover mutation leaks and deterministic ID/time behavior.
