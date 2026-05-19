# TASK-006 Agent Communication - Filter Store and Query AST Baseline

## Task

- Task ID: TASK-006.
- Task name: Add Filter Store and Query AST baseline.
- Branch: `feat/task-006-filter-store-query-ast`.
- Worktree: `/home/aac6fef/Developer/mirabilis-task-006`.
- Parent role: orchestration only.

## Source Docs

- `docs/product/02-core-data-model.md#44-filter`.
- `docs/architecture/06-filter-native-database.md#141-query-ast`.
- `docs/implementation/task-index.md#task-006-add-filter-store-and-query-ast-baseline`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- Save, update, list, and delete filter definitions.
- Query AST supports basic `eq`, `exists`, `within`, `and`, and `or` shapes required by documented filters.
- Unsupported query operators return typed errors.
- Filter definitions include `viewType`.

## Initial Parent Interpretation

- This task adds storage and validation, not a full query execution engine.
- Use the existing Core store style from Page, Metadata, and Event stores.
- Preserve exact non-blank filter identity fields and defensive clone boundaries.
- Keep validation focused on the documented operator baseline: `eq`, `exists`, `within`, `and`, and `or`.
- Treat `FilterDefinition.viewType` as required and non-blank.
- Record plugin/service/IPC authorization and query-cost limits as later-layer risks if needed; TASK-006 should not add native exposure.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network OK and a desktop-terminal `TERM=dumb` failure, treated as non-blocking for repository agent work.

## Current Status

- Status: pre-test guidance complete.
- Active agents: none.

## Agent Handoffs

### Pre-test Guidance Round

- Status: completed.
- Agents:
  - Lovelace the 2nd (`planner`) proposed a focused in-memory Filter Store API, error codes, validation plan, and test outline.
  - Cicero the 2nd (`docs_researcher`) checked local docs plus current TypeScript, Vitest, structured clone, and JSON serialization guidance.
  - James the 2nd (`deprecation_auditor`) audited recursive validation, clone, runtime input, and public `FilterOperator` risks.
- External docs cited:
  - TypeScript recursive aliases and TS config options.
  - Vitest `expectTypeOf` and typecheck guidance.
  - WHATWG structured clone and TC39 `JSON.stringify`.
  - Vitest globals/migration, Vite migration, TypeScript 5.8 notes, and MDN `structuredClone`.

## Parent Decisions

- TASK-006 implements storage and validation only: no query execution engine, JS filters, plugin-specific task/habit/timer semantics, UI, NativeBridge, SQLite, Tauri IPC, or permissions.
- Add `createInMemoryFilterStore` in `src/core/stores/filter-store.ts`, export it from `src/core/stores/index.ts` and `src/core/index.ts`, and cover it with `src/test/core-filter-store.test.ts`.
- Public API:
  - `save(input: SaveFilterInput): FilterDefinition`.
  - `get(filterId: string): FilterDefinition`.
  - `update(filterId: string, input: UpdateFilterInput): FilterDefinition`.
  - `list(options?: ListFiltersOptions): FilterDefinition[]`.
  - `delete(filterId: string): FilterDefinition`.
- `SaveFilterInput` includes `name`, `query`, optional `sort`, optional `group`, required `viewType`, and optional `sourcePluginId`.
- `UpdateFilterInput` uses optional fields; `sort`, `group`, and `sourcePluginId` may be set to `null` to clear them.
- `ListFiltersOptions` supports exact `viewType` and `sourcePluginId` filters only.
- Error codes should include typed not-found, ID collision, identity/source/query/operator/sort/group/clone failures.
- Preserve the existing public `FilterOperator` union. Runtime validation should accept all currently documented/exported operators: `eq`, `neq`, `gt`, `lt`, `includes`, `exists`, and `within`; TASK-006 tests must at least prove the required baseline operators `eq`, `exists`, and `within`. Unknown runtime operators such as `regex` must fail with a typed unsupported-operator error.
- `and` and `or` are recursive `FilterQuery` keys, not `FilterOperator` values.
- `exists` must not include an own `value` property, including `value: undefined`.
- All non-`exists` operators must include an own JSON-compatible `value` property.
- `within` only validates that a value is present and JSON-compatible in TASK-006; do not lock a duration schema until product docs define one.
- `{ where: [] }` is valid as a stored query shape for now. Validation is shape-focused; execution semantics such as match-all are out of scope.
- Query, sort, group, and condition values must be JSON-compatible plain data before cloning. Reject raw `undefined`, functions, symbols, bigint, non-finite numbers, cycles, `Date`, `Map`, `Set`, class instances, sparse arrays, symbol keys, accessors/getters, hostile proxy reflection traps, and excessive depth/node counts with typed errors.
- Rejected `save` or `update` must not mutate existing stored filters.
- Use Event Store's hardened validation style rather than the older Metadata Store validation pattern.

## Next Action

Spawn test writer for failing Filter Store acceptance tests.
