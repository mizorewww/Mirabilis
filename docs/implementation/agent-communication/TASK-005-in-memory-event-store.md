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

### Goodall (`implementer`)

- Status: completed and closed.
- Files changed:
  - `src/core/stores/event-store.ts`.
  - `src/core/stores/index.ts`.
  - `src/core/index.ts`.
- Commit:
  - `e7dda1c Goodall(implementation)(Add in-memory Event Store): implement event store`.
- Behavior implemented:
  - In-memory append-only Event Store with `append` and `list`.
  - Exact `pageId` and `namespace` filters with stable append order.
  - Optional page-less events.
  - Deterministic ID/time injection and default `event_` Web Crypto IDs.
  - Required identity/source validation, JSON-compatible payload validation, defensive clone boundaries, typed errors, collision rollback, and clone-failure rollback.
- Checks run by Goodall and repeated by parent:
  - `bun run typecheck`.
  - `bun run test:frontend -- src/test/core-event-store.test.ts`.
  - `bun run lint`.

### Review Round 1

- Status: completed with P1/P2 findings.
- Agents:
  - Arendt (`pr_explorer`) mapped the branch diff and public API.
  - Dalton (`reviewer`) completed correctness review.
  - Descartes (`deprecation_auditor`) completed API/version-risk audit.
  - Raman (`security_reviewer`) completed security and Core/plugin-boundary review.
  - Franklin (`test_quality_reviewer`) completed test quality review.
  - Volta (`docs_researcher`) completed local docs alignment review.
- Result:
  - No P0 findings.
  - P1 test quality: tests must prove append-only facts allow two successful events with the same `pageId` + `namespace` + `type` and preserve both in order.
  - P1 security: runtime callers can pass non-string values with inherited `trim()` into identity/source/filter fields; validate `typeof === "string"` before trimming or storing.
  - P2 test quality: invalid JSON payload matrix needs nested invalid values, such as nested `undefined`, functions, bigint, symbols, and array `undefined`.
  - P2 security/correctness: reject accessor/getter payload descriptors and normalize traversal exceptions to typed `EventStoreError`.
  - P2 correctness: deeply nested payloads can throw raw `RangeError`; add an explicit validation budget or iterative traversal so failures are typed.
  - P3 docs: the TASK-005 notes `Next Action` was stale after review agents were already active.
  - P3 risk: `structuredClone` dependency is consistent with existing stores but tied to runtime WebView support.
  - Accepted later-boundary risk: no payload size/depth budget at plugin/IPC boundary yet; in this store, a small validation budget is acceptable only to prevent raw stack overflows and preserve typed errors.
- Checks reported by reviewers:
  - `bun run typecheck`.
  - `bun run lint`.
  - `bun run test:frontend -- src/test/core-event-store.test.ts`.
  - `bun run test:frontend`.
  - `bun run build`.
  - `bun run test:frontend -- src/test/core-architecture-boundary.test.ts`.
  - `git diff --check master...HEAD`.

### Mencius (`test_writer`)

- Status: completed and closed.
- Files changed:
  - `src/test/core-event-store.test.ts`.
- Commit:
  - `74cc716 Mencius(test)(Add in-memory Event Store): add review-fix coverage`.
- Coverage added:
  - Duplicate event identities remain append-only and ordered.
  - Runtime non-string identity, source, and filter values are rejected before trimming.
  - Nested non-JSON-compatible payload values are rejected.
  - Accessor/getter payload descriptors are rejected without executing plugin-controlled getter logic.
  - Deep payload validation failures surface as typed `EventStoreError` failures instead of raw stack errors.
- Parent confirmed expected red signal:
  - `bun run typecheck` passes.
  - `bun run test:frontend -- src/test/core-event-store.test.ts` runs 18 tests with 15 passing and 3 failing: non-string runtime values are accepted, accessor payloads throw raw getter errors, and deep payloads throw raw `RangeError`.

### Lovelace (`implementer`)

- Status: completed and closed.
- Files changed:
  - `src/core/stores/event-store.ts`.
- Commit:
  - `147ca5a Lovelace(implementation)(Add in-memory Event Store): fix review edge cases`.
- Fixes implemented:
  - Runtime string validation before trimming identity, source plugin, and list filter values.
  - Payload validation rejects own accessor descriptors without executing getters.
  - Payload validation uses a conservative depth/node budget so pathological nesting returns `EVENT_PAYLOAD_NOT_JSON_COMPATIBLE` instead of raw `RangeError`.
- Checks run by Lovelace and repeated by parent:
  - `bun run typecheck`.
  - `bun run test:frontend -- src/test/core-event-store.test.ts` with 18 tests passing.
  - `bun run lint`.

### Targeted Re-review Round 1

- Status: completed with two remaining P2 items.
- Agents:
  - Boyle (`reviewer`) completed targeted correctness re-review.
  - Dirac (`security_reviewer`) completed targeted security re-review.
  - Bacon (`test_quality_reviewer`) completed targeted test-quality re-review.
- Result:
  - No P0/P1 findings.
  - Bacon reported no remaining test-quality P0/P1/P2 findings.
  - Boyle reported P2: non-string list filter rejection can still throw raw errors while building error details because the invalid filter value is interpolated.
  - Dirac reported P2: proxy/trap payloads can still throw raw errors from reflection APIs such as `Object.getPrototypeOf`, `Object.getOwnPropertyNames`, `Object.getOwnPropertySymbols`, and `Object.getOwnPropertyDescriptor`.
- Checks reported:
  - `bun run typecheck`.
  - `bun run lint`.
  - `bun run test:frontend -- src/test/core-event-store.test.ts`.
  - `git diff` checks for native/IPC/package surfaces.

### Linnaeus (`test_writer`)

- Status: completed and closed.
- Files changed:
  - `src/test/core-event-store.test.ts`.
- Commit:
  - `43f0c2e Linnaeus(test)(Add in-memory Event Store): cover final raw-error cases`.
- Coverage added:
  - Non-string list filters using `Symbol` or hostile `toString`/`valueOf` must fail with typed `EventStoreError` and `EVENT_IDENTITY_REQUIRED`.
  - Proxy payload reflection traps for `getPrototypeOf`, `ownKeys`, and `getOwnPropertyDescriptor` must fail with typed `EventStoreError` and `EVENT_PAYLOAD_NOT_JSON_COMPATIBLE`.
- Parent confirmed expected red signal:
  - `bun run typecheck` passes.
  - `bun run test:frontend -- src/test/core-event-store.test.ts` runs 20 tests with 18 passing and 2 failing: filter values still throw raw `TypeError`, and proxy payload traps still throw raw errors.

### Mendel (`implementer`)

- Status: completed and closed.
- Files changed:
  - `src/core/stores/event-store.ts`.
- Commit:
  - `b8728e0 Mendel(implementation)(Add in-memory Event Store): normalize raw error cases`.
- Fixes implemented:
  - Non-string list filters now throw `EVENT_IDENTITY_REQUIRED` with safe static error details instead of coercing hostile values.
  - Payload validation normalizes reflection/proxy trap failures to `EVENT_PAYLOAD_NOT_JSON_COMPATIBLE`.
- Checks run by Mendel and repeated by parent:
  - `bun run typecheck`.
  - `bun run test:frontend -- src/test/core-event-store.test.ts` with 20 tests passing.
  - `bun run lint`.

### Final Targeted Re-review Round

- Status: completed with one remaining P2 item.
- Agents:
  - Ptolemy (`reviewer`) reported no remaining correctness P0/P1/P2 for non-string filters and proxy payload reflection traps.
  - Dewey (`security_reviewer`) reported no P0/P1 findings, but found one remaining P2: hostile `list(options)` proxy traps can throw raw errors while reading `pageId` or `namespace` before filter normalization.
- Result:
  - Non-string filter values and proxy payload traps are fixed.
  - Remaining P2: normalize proxy/trap errors from reading list option properties into typed `EventStoreError` failures.
- Checks reported:
  - `bun run test:frontend -- src/test/core-event-store.test.ts`.
  - Tauri/IPC/filesystem diff checks showed no broadened native exposure.

### Planck (`test_writer`)

- Status: completed and closed.
- Agent id: `019e40db-f6ae-7301-a325-bdea75aa9381`.
- Ownership:
  - `src/test/core-event-store.test.ts` only.
- Commit:
  - `0800902 Planck(test)(Add in-memory Event Store): cover list option proxy traps`.
- Assignment:
  - Add focused tests proving hostile `list(options)` proxy traps for `pageId` and `namespace` are normalized to typed `EventStoreError` failures with `EVENT_IDENTITY_REQUIRED`.
  - Assert existing appended events remain unchanged/queryable after the failed `list` call.
- Parent confirmed expected red signal:
  - `bun run typecheck` passes.
  - `bun run test:frontend -- src/test/core-event-store.test.ts` runs 22 tests with 20 passing and 2 failing because raw `pageId` and `namespace` option get-trap errors escape.

### Hegel (`implementer`)

- Status: completed and closed.
- Agent id: `019e40df-194d-7eb0-8105-1ac0fbc4917d`.
- Ownership:
  - `src/core/stores/event-store.ts` only.
- Commit:
  - `83bc586 Hegel(implementation)(Add in-memory Event Store): normalize list option proxy traps`.
- Assignment:
  - Normalize thrown errors from reading `list(options).pageId` or `list(options).namespace` into typed `EventStoreError` failures with `EVENT_IDENTITY_REQUIRED`.
  - Avoid hostile value coercion in error details.
  - Preserve normal list filtering, append immutability, and payload validation behavior.
- Checks run by Hegel and repeated by parent:
  - `bun run typecheck`.
  - `bun run test:frontend -- src/test/core-event-store.test.ts` with 22 tests passing.
  - `bun run lint`.

### Final Targeted Re-review Round 2

- Status: completed with one remaining P2 item.
- Agents:
  - Aristotle the 2nd (`reviewer`) found no remaining correctness P0/P1/P2/P3 issues. Checks: `bun run test:frontend -- src/test/core-event-store.test.ts`, `bun run typecheck`.
  - Gibbs the 2nd (`security_reviewer`) found one P2: append-time hostile input property reads can still throw raw errors before validation normalizes them. Probed fields: `namespace`, `type`, `sourcePluginId`, and `payload`.
  - Lagrange the 2nd (`test_quality_reviewer`) found no P0/P1/P2 test-quality issues and one non-blocking P3: the deep payload rejection test is stricter than TASK-005 criteria but useful as stack-safety coverage. Check: `bun run test:frontend -- src/test/core-event-store.test.ts`.
- Result:
  - Remaining P2: normalize append input property-read failures into typed `EventStoreError` failures before merge.
- Native/IPC/package scope:
  - Gibbs the 2nd reported no Tauri capability, filesystem/IPC, network, dependency, package, Cargo, or permission broadening in the TASK-005 diff.

### Volta the 2nd (`test_writer`)

- Status: completed and closed.
- Agent id: `019e40e8-c763-7aa3-b4fc-2350ca1cb5b2`.
- Ownership:
  - `src/test/core-event-store.test.ts` only.
- Commit:
  - `98a3bde Volta the 2nd(test)(Add in-memory Event Store): cover append input property traps`.
- Assignment:
  - Add focused tests for `append(input)` property-read failures on `namespace`, `type`, `sourcePluginId`, and `payload`.
  - Expected behavior: typed `EventStoreError` failures, not raw getter/proxy trap errors.
  - Assert existing events remain unchanged/queryable after failed appends.
- Parent confirmed expected red signal:
  - `bun run typecheck` passes.
  - `bun run test:frontend -- src/test/core-event-store.test.ts` runs 27 tests with 22 passing and 5 failing because raw append input getter errors escape.

### Planck the 2nd (`implementer`)

- Status: completed and closed.
- Agent id: `019e40ec-23ce-7ff1-b20a-a4c14f076ead`.
- Ownership:
  - `src/core/stores/event-store.ts` only.
- Commit:
  - `bf0b28d Planck the 2nd(implementation)(Add in-memory Event Store): normalize append input property traps`.
- Assignment:
  - Normalize `append(input)` property-read failures for `namespace`, `type`, and `pageId` to `EVENT_IDENTITY_REQUIRED`.
  - Normalize `sourcePluginId` property-read failures to `EVENT_SOURCE_PLUGIN_REQUIRED`.
  - Normalize `payload` property-read failures to `EVENT_PAYLOAD_NOT_JSON_COMPATIBLE`.
  - Preserve existing append/list behavior, immutability, ID collisions, and payload validation.
- Checks run by Planck the 2nd and repeated by parent:
  - `bun run typecheck`.
  - `bun run test:frontend -- src/test/core-event-store.test.ts` with 27 tests passing.
  - `bun run lint`.

### Append-read Targeted Re-review

- Status: active.
- Agents:
  - Feynman the 2nd (`security_reviewer`, `019e40ef-493a-7032-9521-2a016c50f3a0`): confirm append-time property-read P2 is fixed and no native/IPC exposure broadened.
  - Descartes the 2nd (`test_quality_reviewer`, `019e40ef-4fc8-7b33-8957-e7d7f62e49a9`): confirm append-time property-read tests cover the P2 meaningfully.

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

Wait for append-read targeted re-review agents, then run final gate if no P0/P1/P2 remain.
