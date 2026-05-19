# TASK-004 Agent Notes: Add In-Memory Metadata Store

## Task Context

- Task ID: TASK-004.
- Task name: Add in-memory Metadata Store.
- Branch: `feat/task-004-in-memory-metadata-store`.
- Worktree: `/home/aac6fef/Developer/mirabilis-task-004`.

## Source Docs

- `docs/implementation/task-index.md` TASK-004.
- `docs/product/02-core-data-model.md#42-metadata`.
- `docs/architecture/02-core-kernel.md#42-metadata-store`.

## Initial Scope

- Set, get, list, and delete metadata by `pageId`, `namespace`, and `key`.
- Store values as unknown JSON-compatible data with a value type.
- Require `sourcePluginId`.
- Keep Metadata Store plugin-agnostic.
- Stay within Core kernel behavior; do not add native persistence, Tauri IPC, UI, plugin behavior, or SQLite.

## Initial Decisions

- Use TASK-002 `MetadataRecord` and `MetadataValueType` from `src/core`.
- Follow the TASK-003 in-memory store pattern where it fits: deterministic dependency injection, typed errors, defensive clone boundaries, and no singleton store.
- Keep the parent thread as orchestration-only.
- Use commit format `<agent-name>(<category>)(Add in-memory Metadata Store): <specific change>`.

## Agent Recommendations And Outcomes

### Poincare (`planner`)

- Status: completed pre-test planning.
- Files to target:
  - Tests: `src/test/core-metadata-store.test.ts`.
  - Production: `src/core/stores/metadata-store.ts`, `src/core/stores/index.ts`, and `src/core/index.ts`.
- Recommended public API:
  - `createInMemoryMetadataStore`.
  - `MetadataStore`, `SetMetadataInput`, `ListMetadataOptions`, and `CreateInMemoryMetadataStoreOptions`.
  - `MetadataStoreError` and `MetadataStoreErrorCode`.
- Store contract:
  - `set(input)` creates or replaces a record for the exact `(pageId, namespace, key)` identity.
  - `get(pageId, namespace, key)` returns the exact record or throws a typed not-found error.
  - `list(options?)` returns records in stable creation order with exact optional filters.
  - `delete(pageId, namespace, key)` removes and returns the deleted record.
- Replacement behavior:
  - Preserve `id` and `createdAt` for the same identity.
  - Update `value`, `valueType`, `sourcePluginId`, and `updatedAt`.
  - Do not move the record in list order.
  - A delete followed by set creates a new `id` and `createdAt`.
- Use nested maps or another collision-safe identity structure. Do not concatenate raw identity parts with delimiters.
- Inject `createId` and `now` for deterministic tests. Default IDs should use a `metadata_` prefix and Web Crypto, not `Math.random`.
- Required typed error cases:
  - `METADATA_NOT_FOUND`.
  - `METADATA_ID_COLLISION`.
  - `METADATA_IDENTITY_REQUIRED`.
  - `METADATA_SOURCE_PLUGIN_REQUIRED`.
  - `METADATA_VALUE_TYPE_MISMATCH`.
  - `METADATA_VALUE_NOT_JSON_COMPATIBLE`.
  - `METADATA_CLONE_FAILED`.

### Ramanujan (`docs_researcher`)

- Status: completed current-docs research.
- Keep `MetadataRecord.value` as `unknown`; TASK-002 already established that public record shape.
- Add a stricter write/input helper type such as `MetadataJsonValue`, but still validate runtime values.
- Do not use `structuredClone` as JSON validation. It allows values such as `Date`, `Map`, `Set`, and cycles.
- Prefer reserving `valueType: "json"` for arrays and plain objects; primitives should use their explicit value types.
- Use `bun run` commands for repo scripts. If tests stub globals with Vitest, clean them up with `vi.unstubAllGlobals()`.
- External docs verified:
  - TypeScript `unknown` and type-only import/export behavior.
  - MDN JSON serialization compatibility caveats.
  - MDN `structuredClone` and structured clone limitations.
  - Vitest v4.1.7 behavior for assertions and globals.
  - Vite 7 and Tauri v2 environment constraints.

### Euler (`deprecation_auditor`)

- Status: completed risk/deprecation audit.
- P1 risks to avoid:
  - Do not rely on `structuredClone` or `JSON.parse(JSON.stringify(value))` for JSON compatibility.
  - Clone on every store boundary: input, set return, get return, list return, delete return, and replacement.
  - Keep the factory isolated; no singleton or module-level store map.
  - Validate non-empty `pageId`, `namespace`, `key`, and `sourcePluginId` at runtime.
  - Keep Core production code plugin-agnostic; avoid domain-specific task, timer, calendar, habit, tag, chart, or AI behavior.
- Default IDs should use injected IDs in tests and Web Crypto in production.
- External docs verified:
  - `structuredClone` and structured clone algorithm.
  - `JSON.stringify`.
  - `Map`.
  - `crypto.randomUUID` and `crypto.getRandomValues`.
  - Vitest globals.

### Galileo (`test_writer`)

- Status: completed and closed.
- Files changed:
  - `src/test/core-metadata-store.test.ts`.
- Commit:
  - `d8f7dd0 Galileo(test)(Add in-memory Metadata Store): add metadata store acceptance tests`.
- Acceptance coverage:
  - Public exports from `../core`.
  - Set, get, list, and delete by exact `pageId`, `namespace`, and `key`.
  - Create versus replace semantics, stable list order, collision handling, filters, distinct identities, and delete-then-set freshness.
  - Required `sourcePluginId` without making it part of identity.
  - Defensive cloning at input, set return, get return, list return, delete return, and replacement boundaries.
  - Allowed value types, value-type mismatch errors, JSON compatibility rejection, missing identity, not-found, clone failure, default IDs, and ISO timestamps.
- Galileo's local check environment initially had no `node_modules`, so its first check run failed before reaching TypeScript or Vitest.
- Parent installed dependencies with `bun install --frozen-lockfile` in this worktree, then confirmed the intended red signal:
  - `bun run typecheck` failed because `../core` does not export `MetadataStoreError`, `createInMemoryMetadataStore`, `ListMetadataOptions`, `MetadataJsonValue`, `MetadataStore`, or `SetMetadataInput`.
  - `bun run test:frontend -- src/test/core-metadata-store.test.ts` failed 15 tests because `createInMemoryMetadataStore` is not implemented/exported yet.

## Parent Decisions

- The parent thread remains orchestration-only and will delegate test-writing, implementation, and review.
- The first implementation target is a pure in-memory Core store with no Tauri IPC, SQLite, persistence, UI, or plugin-specific behavior.
- `valueType: "json"` will accept only arrays and plain objects. JSON-compatible primitives must use `string`, `number`, `boolean`, or `null`.
- Values must be recursively JSON-compatible:
  - Accept strings, finite numbers, booleans, null, arrays, and plain objects.
  - Reject `undefined`, functions, symbols, bigint, non-finite numbers, cycles, sparse arrays, array elements that are `undefined`, `Date`, `Map`, `Set`, and class instances.
- `sourcePluginId` is required and non-empty, but it is not part of record identity and does not need to match `namespace`.

## Next Action

Spawn an `implementer` agent to add the minimal in-memory Metadata Store implementation and make the focused tests pass.
