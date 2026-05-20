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

- Status: P1/P2 production type fix pending replacement.
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

### Linnaeus (`implementer`)

- Status: completed and closed.
- Agent id: `019e437a-2a2f-7c50-974c-e1eed53502f4`.
- Ownership:
  - `src/core/types/view.ts`.
  - `src/core/types/slot.ts`.
  - `src/core/types/index.ts`.
  - `src/core/registries/view-registry.ts`.
  - `src/core/registries/slot-registry.ts`.
  - `src/core/registries/index.ts`.
  - `src/core/index.ts`.
- Commit:
  - `1e03f31 Linnaeus(implementation)(Add View Registry and Slot Registry): implement view and slot registries`.
- Assignment:
  - Implement the minimum production View Registry and Slot Registry to pass Pasteur's acceptance tests.
  - Preserve `component` and `when` references, clone only inert metadata, avoid React runtime imports, and keep TASK-008 out of rendering/business/plugin-host/native behavior.
- Checks run by Linnaeus and repeated by parent:
  - `bun run typecheck`.
  - `bun run test:frontend -- src/test/core-view-slot-registry.test.ts` with 12 tests passing.
  - `bun run lint`.
- Parent note:
  - Linnaeus initially committed with `Codex(implementation)` in the message. Parent amended the HEAD commit message to use the actual agent nickname and force-with-lease pushed the task branch.

### Review Round 1

- Status: completed and closed.
- Agents:
  - Gauss (`pr_explorer`, `019e4384-24f7-7142-96b0-dc8c4fb9383f`): map changed code paths and reviewer focus areas.
  - Erdos (`reviewer`, `019e4384-29c3-7b81-954b-f2a92b8c8b4d`): review correctness and acceptance criteria.
  - Averroes (`security_reviewer`, `019e4384-2f2c-70d2-8cf8-1f02086e4b37`): review component/condition exposure, cloning, hostile metadata, and boundary risks.
  - Volta (`deprecation_auditor`, `019e4384-33de-7341-a26f-25a1fcc1d059`): audit TypeScript/React/Vitest/API risks.
  - Carson (`test_quality_reviewer`, `019e4384-4aab-7841-ac86-f4aad76333da`): review test coverage quality.
  - Ramanujan (`docs_researcher`, `019e4384-60a0-7413-8fa0-ba40b49ba15a`): review local-doc and official-doc traceability.
- Outcomes:
  - Gauss confirmed the TASK-008 diff is limited to Core registry/type/test/docs paths and highlighted likely review areas: React component-reference shape, slot ordering, `accepts` validation, and default prop typing.
  - Erdos found one P2 correctness issue: `ViewDefinition` and `SlotContribution` default to `Props = never`, which erases unparameterized `component` and `when` to `unknown`; this conflicts with the parent decision to default public registry types to `Props = unknown`.
  - Averroes found one P2 deferred boundary risk and one P3 hardening issue: raw registries should remain internal until Plugin Host/UI adds caller-scoped facades, and descriptor property reads should avoid `Reflect.get` so hostile Proxy `get` traps cannot escape.
  - Volta found one P2 React compatibility issue: the public type is React-compatible, but runtime validation currently rejects non-function React object/exotic component references such as memo/lazy-style references.
  - Carson found one P2 and one P3 test gap: tests should prove registry operations never execute component refs, and exact significant whitespace should be covered for view/slot filters.
  - Ramanujan found P3 traceability drift between this task file and the live status file.
- Parent decisions:
  - Accept the default-generic type fix and add type assertions for unparameterized view/slot definitions.
  - Accept broadening runtime component references to functions or non-null objects without importing React runtime values.
  - Accept tests that use throwing or spying component refs to prove registration, get, list, and unregister treat components as inert references.
  - Accept exact whitespace filter tests for view `pluginId`/`type` and slot `pluginId`/`slot`.
  - Accept descriptor-read hardening and tests that prove registry validation does not trigger Proxy `get` traps for data descriptor properties.
  - Defer caller-bound plugin facades to the later Plugin Host/UI task; TASK-008 raw registries stay Core-internal and are not a plugin-facing security boundary.

### Socrates (`test_writer`)

- Status: completed and closed.
- Agent id: `019e438d-94d0-7d80-a996-c8fd5ad56986`.
- Ownership:
  - `src/test/core-view-slot-registry.test.ts` only.
- Commit:
  - `319471b Socrates(test)(Add View Registry and Slot Registry): add review-fix coverage`.
- Assignment:
  - Add review-fix coverage for unparameterized public type defaults, React-compatible object/exotic component references, component inertness, exact significant whitespace filters, and descriptor/proxy property-read hardening.
  - Do not edit production code, docs, config, or lockfiles.
  - Do not commit; parent will commit after confirming the expected red signal.
- Parent confirmed expected red signal:
  - `bun run typecheck` fails with `TS2344` for object component compatibility and default `component`/`when` types resolving as `unknown`.
  - `bun run test:frontend -- src/test/core-view-slot-registry.test.ts` runs 20 tests with 16 passing and 4 failing.
  - The 4 focused runtime failures are rejected object view component refs (`VIEW_COMPONENT_REQUIRED`), rejected proxy view descriptors (`VIEW_IDENTITY_REQUIRED`), rejected object slot component refs (`SLOT_COMPONENT_REQUIRED`), and rejected proxy slot descriptors (`SLOT_IDENTITY_REQUIRED`).

### Locke (`implementer`)

- Status: completed and closed.
- Agent id: `019e4392-b734-7f53-b304-5063a8a09c92`.
- Ownership:
  - `src/core/types/view.ts`.
  - `src/core/types/slot.ts`.
  - `src/core/registries/view-registry.ts`.
  - `src/core/registries/slot-registry.ts`.
- Assignment:
  - Fix public default generic types so unparameterized view/slot definitions expose `RegistryComponent<unknown>` and `SlotCondition<unknown> | undefined`.
  - Allow React-compatible object/exotic component references without importing React runtime values.
  - Accept function and non-null object component refs at runtime while rejecting nullish/primitives.
  - Read own data descriptor values without invoking Proxy `get` traps.
  - Preserve existing duplicate, ordering, defensive-copy, exact-filter, and inert `when` behavior.
  - Do not edit tests, docs, config, or lockfiles, and do not commit.
- Commit:
  - `ffe8561 Locke(review-fix)(Add View Registry and Slot Registry): accept object component refs`.
- Parent validation:
  - `bun run typecheck` passed.
  - `bun run test:frontend -- src/test/core-view-slot-registry.test.ts` passed with 20 tests.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - `rg -n "hasSelectivelyThrowingGetTrap|Reflect\\.get" src/core/registries/view-registry.ts src/core/registries/slot-registry.ts` returned no matches.
- Parent note:
  - Locke first produced a green patch that still probed Proxy `get` traps; Avicenna added the missing test guard and Locke removed the probing in the final committed patch.

### Avicenna (`test_writer`)

- Status: completed and closed.
- Agent id: `019e4399-a145-7760-a4fb-edd9e5a59152`.
- Ownership:
  - `src/test/core-view-slot-registry.test.ts` only.
- Commit:
  - `c4dbc4a Avicenna(test)(Add View Registry and Slot Registry): forbid proxy get trap reads`.
- Assignment:
  - Strengthen descriptor/proxy tests so a valid own data descriptor behind a Proxy registers without the registry invoking the Proxy `get` trap.
  - Resolve older contradictory invalid cases that treated a data-property `get` trap as invalid; keep raw descriptor failure coverage only where the descriptor lookup itself fails or an accessor is present.
  - Do not edit production code, docs, config, or lockfiles, and do not commit.
- Parent confirmed expected red signal:
  - `bun run typecheck` passed.
  - `bun run test:frontend -- src/test/core-view-slot-registry.test.ts` runs 20 tests with 18 passing and 2 failing.
  - The two failures are the expected `getTrap.mock.calls.length` assertions: view registration reports 8 calls and slot registration reports 6 calls against Locke's current uncommitted production patch.

### Targeted Re-review

- Status: completed and closed.
- Agents:
  - Singer (`reviewer`, `019e43a0-49cf-7031-9f20-58d78a9a4487`): correctness and acceptance criteria.
  - Archimedes (`security_reviewer`, `019e43a0-4d00-75c3-9763-6e0eb3d5492b`): descriptor-read, component-ref, and plugin-boundary security.
  - Aquinas (`deprecation_auditor`, `019e43a0-50cb-7700-aabb-1e8c19a9be84`): current TypeScript/React/Vitest API compatibility.
  - Meitner (`test_quality_reviewer`, `019e43a0-5578-7631-a2cc-28ceb376abbb`): test-quality review for Socrates and Avicenna coverage.
  - Kierkegaard (`docs_researcher`, `019e43a0-5f47-7353-87d3-699ce313aa9f`): communication docs and progress traceability.
- Findings:
  - Singer found one P2 correctness issue: `RegistryComponent<Props>` includes an unparameterized callable fallback, and `SlotCondition` uses a bivariant method extraction, weakening public prop generic safety for future renderers.
  - Aquinas found one P1 API compatibility issue: `RegistryCallableComponent` lets any function or constructor satisfy any `RegistryComponent<Props>`, allowing wrong-prop components in `ViewDefinition<Props>` and `SlotContribution<Props>`.
  - Aquinas found one P2 deprecation issue: deprecated Vitest/expect-type `.toMatchTypeOf()` assertions should be replaced with current `.toExtend()` assertions.
  - Aquinas found one P3 React type hygiene issue: public/test types expose `_payload`/`_init` lazy internals; current installed React types expose lazy/exotic object refs through public `ExoticComponent`/`LazyExoticComponent` shapes instead.
  - Archimedes found no remaining P0/P1/P2/P3 security issues and confirmed no Tauri, IPC, native permission, filesystem, persistence, or React runtime execution surface was added.
  - Meitner found no remaining test-quality issues; focused tests and typecheck passed.
  - Kierkegaard found three P3 docs issues: stale communication next-action text, stale live-status review-fix TDD wording, and architecture examples that omit required TASK-008 `title` or slot `id` fields.
- Parent decisions:
  - P1/P2 public type soundness is blocking and must be fixed before final gate.
  - Add test-only coverage first for wrong-prop component assignability and slot-condition assignability, and replace deprecated `.toMatchTypeOf()` assertions.
  - Remove public/test dependence on `_payload`/`_init` lazy internals while preserving React-compatible object/exotic component support.
  - After P1/P2 is green, clean up docs P3 examples and stale status text before final gate.

### Euler (`test_writer`)

- Status: completed and closed.
- Agent id: `019e43a6-9023-7b11-abf7-3841ed3c7602`.
- Ownership:
  - `src/test/core-view-slot-registry.test.ts` only.
- Commit:
  - `9a3c1c2 Euler(test)(Add View Registry and Slot Registry): cover public type soundness`.
- Assignment:
  - Add public type-soundness coverage for wrong-prop component assignability in `RegistryComponent`, `ViewDefinition`, and `SlotContribution`.
  - Add public type-soundness coverage for slot condition assignability.
  - Replace deprecated `.toMatchTypeOf()` assertions with current `.toExtend()` assertions.
  - Remove test dependence on React lazy private `_payload`/`_init` shapes while preserving object/exotic component compatibility coverage.
  - Do not edit production code, docs, config, or lockfiles, and do not commit.
- Parent confirmed expected red signal:
  - `bun run typecheck` fails with six `TS2554` diagnostics from negative `.not.toExtend()` assertions for wrong-prop components and narrower slot conditions.
  - `bun run test:frontend -- src/test/core-view-slot-registry.test.ts` still passes with 20 tests.
  - `git diff --check` passed.

### Carver (`implementer`)

- Status: stopped and replaced.
- Agent id: `019e43aa-60f1-7be0-aa5b-119c99d19d64`.
- Ownership:
  - `src/core/types/view.ts`.
  - `src/core/types/slot.ts`.
- Assignment:
  - Preserve public React component/exotic compatibility while removing the unbounded callable fallback that erases prop safety.
  - Avoid public/test dependence on React lazy private `_payload`/`_init` internals.
  - Make `SlotCondition<Props>` a normal `(props: Props) => boolean` function type.
  - Keep `Props = unknown` defaults.
  - Do not edit tests, docs, registries, config, or lockfiles, and do not commit.
- Stop reason:
  - Parent sent a status request and waited two windows. Carver produced no final response and its uncommitted production type patches did not pass `bun run typecheck`.
  - Parent rejected and reverted Carver's uncommitted patches. Euler's committed type-soundness tests remain the active red signal.

## Next Action

Commit this replacement note, spawn a replacement `implementer` for TASK-008 public type soundness fixes, and repeat focused checks until green.
