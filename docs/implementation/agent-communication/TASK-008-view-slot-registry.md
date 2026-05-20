# TASK-008 Agent Communication - View Registry and Slot Registry

## Task

- Task ID: TASK-008.
- Task name: Add View Registry and Slot Registry.
- Branch: `feat/task-008-view-slot-registry`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/product/02-core-data-model.md#45-view-registry`.
- `docs/architecture/04-slots-editor-task.md#7-slot-系统`.
- `docs/product/06-view-slots.md`.
- `docs/implementation/task-index.md#task-008-add-view-registry-and-slot-registry`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- Plugins can register views by id/type and slots by slot name.
- Slot contributions support order and conditional rendering metadata.
- Duplicate IDs are rejected.
- View/slot registries remain UI-framework compatible with React components.

## Initial Parent Interpretation

- TASK-008 implements Core registration and discovery only.
- Core must not implement actual React rendering, built-in business views, slot renderers, command palette UI, plugin host lifecycle, IPC, permissions, persistence, or Tauri behavior.
- View and slot components are plugin-provided values. The registry should remain UI-framework compatible by accepting component references without importing React runtime where possible.
- Slot `when` is conditional rendering metadata/function supplied by plugins; TASK-008 should store it and expose it to renderers, not execute matching logic unless local docs require it.
- Follow the in-memory registry/store hardening patterns established by TASK-003 through TASK-007 where they fit component-bearing contributions.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network OK and a desktop-terminal `TERM=dumb` failure, treated as non-blocking for repository agent work.

## Current Status

- Status: acceptance tests red; implementation handoff pending.
- Active agents: none.

## Agent Handoffs

### Pre-test Guidance Round

- Status: completed.
- Agents:
  - Hooke (`planner`, `019e436e-7986-7ba2-b8c5-6a2d8fab1838`): propose focused View Registry and Slot Registry API, validation, ordering, duplicate handling, unregister behavior, component-reference semantics, and acceptance tests.
  - Halley (`docs_researcher`, `019e436e-7cc2-7f01-983a-c26bea4748f7`): verify current official TypeScript, React, and Vitest guidance relevant to component-compatible registry types and tests.
  - Tesla (`deprecation_auditor`, `019e436e-93cb-7ec0-b695-7e2b1ed98b87`): audit component-reference cloning, condition function exposure, slot ordering edge cases, duplicate atomicity, UI-framework coupling, and boundary risks.
- Outcomes:
  - Hooke recommended view and slot type modules, registry implementation modules, Core barrel exports, and `src/test/core-view-slot-registry.test.ts`.
  - Halley confirmed TASK-008 is TypeScript Core work only and verified React-compatible component typing guidance. Core should use type-only React imports and avoid runtime React imports, `isValidElement`, `createElement`, or renderer behavior.
  - Tesla flagged high-risk areas around cloning function-bearing contributions, inert `when` references, duplicate atomicity, slot order determinism, React runtime coupling, and business-term leakage into production Core.
- External docs cited:
  - TypeScript type-only imports and exports: https://www.typescriptlang.org/docs/handbook/modules/reference#type-only-imports-and-exports
  - TypeScript 3.8 `import type` and `export type`: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html
  - TypeScript `verbatimModuleSyntax`: https://www.typescriptlang.org/tsconfig/verbatimModuleSyntax.html
  - React TypeScript guide: https://react.dev/learn/typescript
  - React `createElement`: https://react.dev/reference/react/createElement
  - React `isValidElement`: https://react.dev/reference/react/isValidElement
  - Vitest async assertions: https://vitest.dev/api/expect#resolves and https://vitest.dev/api/expect#rejects
  - Vitest `expectTypeOf`: https://vitest.dev/api/expect-typeof
  - Vitest type testing: https://vitest.dev/guide/testing-types

## Parent Decisions

- TASK-008 implements Core registration and discovery only: no rendering, React Testing Library, JSX renderer, built-in views/slots, business plugin behavior, Plugin Host lifecycle, IPC, Tauri, persistence, or UI.
- Add `src/core/types/view.ts`, `src/core/types/slot.ts`, `src/core/registries/view-registry.ts`, `src/core/registries/slot-registry.ts`, `src/core/registries/index.ts`, Core barrel exports, and `src/test/core-view-slot-registry.test.ts`.
- Use type-only React `ComponentType` compatibility in public types. Do not import React runtime values in Core registry implementation.
- Do not validate component refs with `React.isValidElement`, do not create or clone React elements, and do not execute/render components.
- `ViewDefinition<Props = unknown>` includes `id`, `pluginId`, `type`, `title`, `component`, and required `accepts`.
- `ViewDataShape` is JSON-compatible inert metadata for TASK-008, using `MetadataJsonValue`.
- `SlotContribution<Props = unknown>` includes `id`, `pluginId`, `slot`, optional `order`, optional `when`, and `component`.
- `SlotCondition<Props = unknown>` is a synchronous `(props: Props) => boolean` function for TASK-008. Async conditions wait for a later renderer design.
- Preserve `component` and `when` references by identity. Do not structured-clone whole view or slot contributions.
- Clone only inert JSON metadata such as `accepts`; returned contribution objects and arrays should be defensive copies.
- Required string fields must be strings and nonblank after trimming, but store exact provided values.
- Duplicate IDs are global per registry, not per plugin/type/slot. Duplicate register must not mutate the original and should avoid touching later dangerous fields when practical.
- View registry `list()` returns registration order and supports exact `pluginId` and `type` filters. Same `type` under different IDs is allowed.
- Slot registry `list()` supports exact `pluginId` and `slot` filters. For a slot-filtered render list, sort by ascending finite `order`, default `0`, stable registration-order tie-break. For unfiltered management list, prefer the same deterministic order unless tests/implementation agents justify otherwise.
- `unregister()` returns the removed definition/contribution, throws typed not-found on missing IDs, and allows later re-registration.
- Slot `when` is stored and exposed for a future renderer, but registry operations never execute it.
- Do not hard-code production constants for documented business view or slot names.

## Next Action

Wait for Pasteur's TASK-008 acceptance tests.

### Pasteur (`test_writer`)

- Status: completed and closed.
- Agent id: `019e4373-8e3a-7af0-9700-9b6d89f6b631`.
- Ownership:
  - `src/test/core-view-slot-registry.test.ts` only unless unavoidable test-only support is needed.
- Commit:
  - `5dc84cc Pasteur(test)(Add View Registry and Slot Registry): add view and slot registry acceptance tests`.
- Assignment:
  - Add failing acceptance tests for public exports, view/slot type contracts, registration/listing/unregister behavior, ordering, duplicate handling, component/condition reference identity, defensive metadata copies, JSON-compatible `accepts`, inert `when`, runtime validation, and business-neutral examples.
  - Do not edit production code, docs, or exports.
- Parent confirmed expected red signal:
  - `bun run typecheck` fails on missing View/Slot Registry exports and `../core/registries`.
  - `bun run test:frontend -- src/test/core-view-slot-registry.test.ts` fails during import resolution for `../core/registries`, so no tests execute until production files are added.

## Next Action

Delegate minimum production implementation to an `implementer`.
