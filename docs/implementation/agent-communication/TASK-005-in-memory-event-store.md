# TASK-005 Agent Notes: Add In-Memory Event Store

## Task Context

- Task ID: TASK-005.
- Task name: Add in-memory Event Store.
- Branch: `feat/task-005-in-memory-event-store`.
- Worktree: `/home/aac6fef/Developer/mirabilis-task-005`.

## Source Docs

- `docs/implementation/task-index.md` TASK-005.
- `docs/product/02-core-data-model.md#43-event`.
- `docs/architecture/02-core-kernel.md#43-event-store`.

## Initial Scope

- Append and query immutable events.
- Events include namespace, type, payload, source plugin, created time, and optional page ID.
- Event queries support page and namespace filters needed by early plugins.
- Existing events are not mutated by updates.
- Stay within Core kernel behavior; do not add native persistence, Tauri IPC, UI, plugin behavior, or SQLite.

## Initial Decisions

- Use TASK-002 `AppEvent` from `src/core`.
- Follow the TASK-003/TASK-004 in-memory store pattern where it fits: deterministic dependency injection, typed errors, defensive clone boundaries, and no singleton store.
- Keep the parent thread as orchestration-only.
- Use commit format `<agent-name>(<category>)(Add in-memory Event Store): <specific change>`.

## Agent Recommendations And Outcomes

### Carver (`planner`)

- Status: completed pre-test planning.
- Recommended files:
  - Tests: `src/test/core-event-store.test.ts`.
  - Production: `src/core/stores/event-store.ts`, `src/core/stores/index.ts`, and `src/core/index.ts`.
- Recommended public API:
  - `createInMemoryEventStore`.
  - `EventStoreError` and `EventStoreErrorCode`.
  - `AppendEventInput`, `ListEventsOptions`, `EventStore`, and `CreateInMemoryEventStoreOptions`.
- Store contract:
  - `append(input)` is the only write operation.
  - `list(options?)` returns successful appends in append order.
  - `list({ pageId })`, `list({ namespace })`, and combined filters use exact equality.
  - No update, delete, replace, Event Bus, native persistence, IPC, plugin lifecycle, or plugin-specific query helpers.
- Validation guidance:
  - Required non-blank `namespace`, `type`, and `sourcePluginId`.
  - Optional `pageId`, but reject blank/whitespace-only values when provided.
  - Preserve exact `pageId`, `namespace`, and `type` values after validation, including significant whitespace.
  - Trim and store `sourcePluginId`, matching Metadata Store behavior.
  - Runtime-validate payloads as JSON-compatible while keeping `AppEvent.payload` typed as `unknown`.
- Test guidance:
  - Public exports/type shape.
  - Append with injected ID/time for page-bound and global events.
  - Default `event_` IDs, ISO timestamps, and `getRandomValues` fallback.
  - Append order, page/namespace filters, combined filters, no-match filters.
  - Exact delimiter-style and significant-whitespace filter behavior.
  - Defensive cloning at input, append return, list return, and result array boundaries.
  - Rejected appends and ID collisions leave prior events unchanged.
  - JSON-compatible payload matrix and invalid-payload rejection.
  - Clone failure rollback.

### Herschel (`docs_researcher`)

- Status: completed current-docs research.
- Local interpretation:
  - TASK-005 is a Core-only in-memory append/query store for event facts.
  - `AppEvent` already exists with `payload: unknown`; keep that shape.
  - Existing Page and Metadata stores establish local patterns for dependency injection, typed errors, clone boundaries, barrel exports, and exact filters.
- External docs verified:
  - TypeScript `unknown` and type-only import/export guidance.
  - MDN `structuredClone` and structured clone algorithm limitations.
  - MDN `JSON.stringify` lossy behavior.
  - MDN/Web Crypto `randomUUID` and `getRandomValues`.
  - Vitest `vi.stubGlobal`, `vi.unstubAllGlobals`, `expectTypeOf`, and jsdom environment guidance.
  - Vite 7 Node/browser guidance.
  - Tauri v2 WebView version constraints.
- Guidance:
  - Use `structuredClone` for defensive copying, not JSON validation.
  - Do not use `JSON.parse(JSON.stringify(...))` as validation or cloning.
  - Keep production Core generic; no task/timer/habit/calendar helper APIs.

### Harvey (`deprecation_auditor`)

- Status: completed risk/deprecation audit.
- P1 guidance:
  - Decide the payload contract before tests lock it in. `structuredClone` alone is too broad because it accepts `Date`, `Map`, `Set`, and cycles; future `payload_json` persistence favors JSON-compatible runtime validation.
  - Preserve append-only semantics by API shape and tests: no `update`, `delete`, or replacement path.
- P2 guidance:
  - Query filters should be exact. Reject blank filters, but do not trim meaningful `pageId`, `namespace`, or `type` values before matching.
  - Follow existing Web Crypto ID strategy with `event_` prefix, `randomUUID`, and `getRandomValues` fallback.
  - Keep Core plugin-agnostic; no production business-plugin terms or enums.
- External docs verified:
  - MDN `structuredClone` and structured clone algorithm.
  - MDN `crypto.randomUUID` and `crypto.getRandomValues`.
  - Vitest global stubbing and type testing.
  - Vite 7 migration / Node support.

### Sagan (`test_writer`)

- Status: completed and closed.
- Files changed:
  - `src/test/core-event-store.test.ts`.
- Commit:
  - `25974af Sagan(test)(Add in-memory Event Store): add event store acceptance tests`.
- Acceptance coverage:
  - Public Event Store API/types from `../core`.
  - Append-only behavior, append ordering, injected IDs/timestamps, default `event_` IDs, ISO timestamps, and `getRandomValues` fallback.
  - Exact `pageId`, `namespace`, and combined filters, including page-less/global events.
  - Required and trimmed `sourcePluginId`; blank identity/filter rejection; significant whitespace preservation.
  - JSON-compatible payload acceptance/rejection matrix while `AppEvent.payload` remains `unknown`.
  - Defensive clone boundaries, rejected append rollback, ID collision rollback, and `EVENT_CLONE_FAILED`.
- Parent confirmed expected red signal:
  - `bun run typecheck` fails because `../core` does not export `EventStoreError`, `createInMemoryEventStore`, `AppendEventInput`, `CreateInMemoryEventStoreOptions`, `EventStore`, or `ListEventsOptions`.
  - `bun run test:frontend -- src/test/core-event-store.test.ts` runs 13 tests and all fail because `createInMemoryEventStore` is not implemented/exported yet.

## Parent Decisions

- Keep `AppEvent.payload` typed as `unknown`, but enforce JSON-compatible runtime payloads at append time.
- Accept JSON-compatible primitives, arrays, and plain objects.
- Reject `undefined`, functions, symbols, bigint, non-finite numbers, cycles, `Date`, `Map`, `Set`, class instances, sparse arrays, arrays with own non-index or symbol properties, and objects with symbol keys.
- Use `structuredClone` only for defensive clone boundaries.
- Provide `list(options?)`, not `query`, to match Page/Metadata store naming.
- TASK-005 filters are only `pageId` and `namespace`; do not add `type`, source, date, or range filters yet.
- Preserve exact non-blank `pageId`, `namespace`, and `type` values. Reject whitespace-only values when provided.
- Trim and store `sourcePluginId`.
- Do not add a size/depth budget in this in-memory task; record that plugin/service/IPC boundaries must enforce budgets later.

## Next Action

Spawn an `implementer` agent to add the minimal in-memory Event Store implementation and make the focused tests pass.
