# TASK-006 Agent Communication - Filter Store and Query AST Baseline

## Task

- Task ID: TASK-006.
- Task name: Add Filter Store and Query AST baseline.
- Branch: `feat/task-006-filter-store-query-ast`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
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

### Pauli the 2nd (`test_writer`)

- Status: replaced before output.
- Agent id: `019e40fe-1b68-78d2-92de-17083eb62579`.
- Ownership:
  - `src/test/core-filter-store.test.ts` only unless unavoidable test-only support is needed.
- Assignment:
  - Write failing TASK-006 acceptance tests for public exports, CRUD, update semantics, list filters, Query AST validation, typed errors, and defensive clone boundaries.
  - Do not edit production code.
- Replacement reason:
  - Pauli the 2nd was assigned to the stale `/home/aac6fef/Developer/mirabilis-task-006` worktree path. The stale worktree records were pruned and the branch moved back into the main repository checkout at `/home/aac6fef/Developer/Mirabilis`; the agent id was no longer reachable for interruption.

## Workflow Correction

- Default task development now uses one focused Git branch in the main repository checkout.
- Do not create sibling `../mirabilis-task-*` worktree directories unless the user explicitly asks for worktree isolation.
- If a worktree is explicitly used, prune/remove it after merge so Git branches and commits remain the only durable version-management surface.

### Fermat (`test_writer`)

- Status: completed and closed.
- Agent id: `019e4315-bb48-7ff3-a790-8b947bf4301d`.
- Ownership:
  - `src/test/core-filter-store.test.ts` only unless unavoidable test-only support is needed.
- Commit:
  - `62ccd62 Fermat(test)(Add Filter Store and Query AST baseline): add filter store acceptance tests`.
- Assignment:
  - Write failing TASK-006 acceptance tests for public exports, CRUD, update semantics, list filters, Query AST validation, typed errors, and defensive clone boundaries.
  - Use `/home/aac6fef/Developer/Mirabilis`; do not create sibling worktree directories.
  - Do not edit production code.
- Parent confirmed expected red signal:
  - `bun run typecheck` fails on missing Filter Store exports.
  - `bun run test:frontend -- src/test/core-filter-store.test.ts` runs 22 tests with 22 failing because `createInMemoryFilterStore` is not implemented/exported.

### Hume (`implementer`)

- Status: completed and closed.
- Agent id: `019e431e-09bf-7ea1-a7cd-92cdff15a301`.
- Ownership:
  - `src/core/stores/filter-store.ts`.
  - `src/core/stores/index.ts`.
  - `src/core/index.ts`.
- Commit:
  - `611125c Hume(implementation)(Add Filter Store and Query AST baseline): implement filter store`.
- Assignment:
  - Implement minimum in-memory Filter Store production code to pass Fermat's tests.
  - Keep TASK-006 to storage and validation only.
- Checks run by Hume and repeated by parent:
  - `bun run typecheck`.
  - `bun run test:frontend -- src/test/core-filter-store.test.ts` with 22 tests passing.
  - `bun run lint`.

### Review Round 1

- Status: completed with P1/P2 findings.
- Agents:
  - Nietzsche (`pr_explorer`) mapped branch diff and confirmed no unrelated native/package/Tauri surfaces changed.
  - Bohr (`reviewer`) found no correctness P0/P1/P2/P3. Checks: `bun run test:frontend -- src/test/core-filter-store.test.ts`, `bun run typecheck`, `bun run lint`.
  - Boyle (`security_reviewer`) found one P1 and one P2:
    - P1: proxy/reflection traps can still escape as raw errors after the first JSON-compatible validation pass during later Query AST shape traversal.
    - P2: `get`, `update`, and `delete` do not runtime-validate `filterId`, allowing hostile `toString` or `Symbol` values to escape raw errors in `FILTER_NOT_FOUND` details.
  - Darwin (`test_quality_reviewer`) found three P2 test gaps:
    - Hostile JSON-compatible input coverage is incomplete for functions, symbols, bigint, raw `undefined`, `Date`, `Map`, `Set`, class instances, sparse arrays, symbol keys, node-count exhaustion, and hostile sort/group shapes.
    - Defensive-copy tests do not mutate nested condition `value` objects or recursive `and`/`or` branches.
    - Mutation atomicity tests do not cover mixed-field rejected updates such as valid query plus invalid `sourcePluginId` or valid name plus unsupported operator.
  - Confucius (`deprecation_auditor`) found one P2 and one P3:
    - P2: non-enumerable Query AST properties pass validation but are dropped by `structuredClone`.
    - P3: future `FilterOperator` drift is not compile-exhaustive.
  - Laplace (`docs_researcher`) found no docs P0/P1/P2 and two P3 docs improvements:
    - Refresh this task communication file's current status before merge.
    - Add exact external documentation URLs for traceability.
- Selected fixes:
  - Add review-fix tests for Boyle's P1/P2 and Confucius's P2.
  - Add coverage for Darwin's P2 gaps where focused and practical.
  - Add a low-cost operator drift regression test or type check if it fits the test file cleanly.
  - Clean up Laplace's P3 docs items before merge.

### Dirac (`test_writer`)

- Status: completed and closed.
- Agent id: `019e432c-87d5-7930-bf9c-eced69fd1366`.
- Ownership:
  - `src/test/core-filter-store.test.ts` only unless unavoidable.
- Commit:
  - `a7d7aa0 Dirac(test)(Add Filter Store and Query AST baseline): add review-fix coverage`.
- Assignment:
  - Add tests for Boyle's P1 raw proxy/reflection-trap escape and P2 hostile `filterId` errors.
  - Add tests for Confucius's P2 non-enumerable Query AST property issue.
  - Add focused coverage for Darwin's P2 gaps around hostile JSON values, nested defensive copies, and mixed-field rejected update atomicity.
  - Keep production code untouched.
- Parent confirmed expected red signal:
  - `bun run typecheck` passes.
  - `bun run test:frontend -- src/test/core-filter-store.test.ts` runs 49 tests with 36 passing and 13 failing on hostile filter IDs, proxy/reflection trap escapes, and non-enumerable properties.

### Ptolemy (`implementer`)

- Status: completed and closed.
- Agent id: `019e4333-a10b-7682-b904-2d48afc172b1`.
- Ownership:
  - `src/core/stores/filter-store.ts` only unless unavoidable.
- Commit:
  - `ec5cc46 Ptolemy(implementation)(Add Filter Store and Query AST baseline): fix review edge cases`.
- Assignment:
  - Normalize proxy/reflection traps during Query AST and sort/group shape traversal.
  - Runtime-validate `filterId` for `get`, `update`, and `delete`.
  - Reject non-enumerable query, condition, sort, and group properties before cloning.
  - Preserve existing public behavior and operator support.
- Checks run by Ptolemy and repeated by parent:
  - `bun run typecheck`.
  - `bun run test:frontend -- src/test/core-filter-store.test.ts` with 49 tests passing.
  - `bun run lint`.

## Next Action

Run targeted re-review for TASK-006 P1/P2 fixes.
