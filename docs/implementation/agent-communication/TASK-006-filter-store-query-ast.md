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

- Status: pre-test guidance active.
- Active agents:
  - Lovelace the 2nd (`planner`, `019e40f8-7c4b-7520-a448-d2a1ba8f7ffa`): planning scope, API, validation rules, test plan, and review risks.
  - Cicero the 2nd (`docs_researcher`, `019e40f8-80e0-7560-9ecd-842a3eaf98ee`): researching current TypeScript/Vitest/structured clone guidance.
  - James the 2nd (`deprecation_auditor`, `019e40f8-852d-7333-9c3f-2c92697660a6`): auditing deprecated/fragile API patterns and recursive validation risks.

## Agent Handoffs

### Pre-test Guidance Round

- Status: active.
- Agents:
  - Lovelace the 2nd (`planner`).
  - Cicero the 2nd (`docs_researcher`).
  - James the 2nd (`deprecation_auditor`).
- Purpose:
  - Set TASK-006 boundaries before tests.
  - Identify current docs and deprecation guidance.
  - Produce a concrete test-writer handoff for Filter Store CRUD and Query AST validation.

## Next Action

Wait for pre-test guidance agents and record parent decisions.
