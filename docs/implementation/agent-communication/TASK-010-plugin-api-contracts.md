# TASK-010 Agent Communication - Plugin API Contracts

## Task

- Task ID: TASK-010.
- Task name: Define Plugin API contracts.
- Branch: `feat/task-010-plugin-api-contracts`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/product/03-plugin-platform.md#6-plugin-manifest-设计`.
- `docs/product/03-plugin-platform.md#7-plugin-可以贡献的能力`.
- `docs/product/03-plugin-platform.md#8-plugin-生命周期`.
- `docs/product/03-plugin-platform.md#9-plugin-runtime`.
- `docs/architecture/03-plugin-api-and-host.md#5-plugin-api-设计`.
- `docs/architecture/02-core-kernel.md`.
- `docs/implementation/task-index.md#task-010-define-plugin-api-contracts`.
- `docs/testing/strategy.md`.

## Acceptance Criteria

- Define `PluginManifest`, `PluginContributions`, `AppPlugin`, and `PluginContext`.
- Plugin permissions and dependencies are represented.
- Contributions include markdown syntax, metadata fields, event types, commands, filters, views, slots, indexers, algorithms, mobile toolbar items, and settings panels.
- API contracts do not depend on concrete built-in plugin implementations.

## Initial Parent Interpretation

- TASK-010 is a TypeScript contract task, not a Plugin Host implementation task.
- Contracts should likely live under Core or a plugin-api subpath consistent with the current repo shape; agents should advise before tests are written.
- The task should expose type contracts from public Core entrypoints and focused subpaths without adding concrete Task/Habit/Timer/AI/etc. business implementations.
- `PluginContext` should refer to existing runtime services and registries where implemented today, while future extension registries/services should be represented as contracts only if required by the acceptance criteria.
- Runtime validation may be added only if agents recommend it as the smallest useful contract surface; otherwise type-level and export tests are enough.
- Do not touch Tauri IPC, permissions, Rust, SQLite, filesystem, UI rendering, built-in plugin packages, or Plugin Host lifecycle for this task.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network OK, noted Codex `0.132.0` is available, and reported the known desktop-terminal `TERM=dumb` failure. Parent treats this as non-blocking for repository agent work.

## Current Status

- Status: P2 review-fix green; narrow re-review next.
- Active agents: none.
- Next parent step: spawn narrow re-review agents for P2 fixes and docs cleanup.

## Agent Handoffs

### Pre-test Guidance Round

- Status: completed and closed.
- Agents:
  - Kepler (`planner`, `019e4699-91c6-73f3-877d-3badf515c89f`).
  - Sagan (`docs_researcher`, `019e4699-91c6-73f3-877d-3bc379b980a9`).
  - Franklin (`deprecation_auditor`, `019e4699-91c6-73f3-877d-3c00fd953abf`).
  - Feynman (`security_reviewer`, `019e4699-91c6-73f3-877d-3c5c1e780654`).
- Assignment:
  - Produce focused Plugin API contract, test, docs, deprecation/API, and security-boundary guidance before TDD tests.
  - Stay read-only and do not edit files.
- Outcomes:
  - Kepler recommended a pure TypeScript contract task with a transitional package-like `src/core/plugin-api/` subpath and type-only re-exports from `src/core`.
  - Recommended files: `src/core/plugin-api/index.ts`, `manifest.ts`, `contributions.ts`, `context.ts`, and `plugin.ts`.
  - Recommended tests: `src/test/plugin-api-contracts.test.ts` covering public exports from `../core/plugin-api` and `../core`, manifest shape, contribution buckets, inert contribution descriptors, lifecycle hook types, and plugin-facing context facades.
  - Sagan verified current TypeScript and Vitest docs for type-only imports/exports, `satisfies`, and `expectTypeOf`; Sagan also identified local doc ambiguities around `main`, `slots` vs `viewSlots`, product lifecycle breadth, and future `packages/plugin-api`.
  - Franklin identified P1 API risks: do not conflate manifest contributions with runtime registrations, do not model Tauri native permission grants as manifest permissions, do not expose `CoreRuntime`/raw aggregates/concrete factories from `PluginContext`, resolve `slots` vs `viewSlots`, and do not reuse the runtime `SlotContribution` name for manifest descriptors.
  - Feynman identified security boundary guidance: manifest contributions must stay data-only, plugin context must use caller-scoped facades rather than raw global mutation surfaces, transaction context should not expose raw `CoreTransaction`, and settings/storage placeholders must be plugin-scoped.
- Parent decisions:
  - Use `src/core/plugin-api/` as the TASK-010 subpath; do not create a real `packages/plugin-api` workspace package yet.
  - Export Plugin API contracts from both `src/core/plugin-api` and `src/core`.
  - Canonical contribution key is `slots`; do not add a `viewSlots` alias in TASK-010.
  - Include optional `main?: string` on `PluginManifest` for product-manifest compatibility, but do not implement loading or path resolution.
  - Keep `AppPlugin` lifecycle hooks to architecture's narrow set: `install`, `activate`, `register`, `deactivate`, and `uninstall`. Treat `migrate`, `index`, and `render` as future lifecycle concepts outside TASK-010.
  - Manifest contributions are inert data descriptors. `CommandContribution` must not include `handler`; `ViewContribution` must not include `component`; `PluginSlotContribution` must not include `component` or function `when`.
  - Use a distinct manifest slot descriptor name such as `PluginSlotContribution`, not the existing runtime `SlotContribution`.
  - Model permissions as declarative Mirabilis app-domain permission objects, not raw strings, wildcards, file paths, URLs, raw Tauri capability names, or native grants.
  - `PluginContext` must not be an alias for `CoreRuntime`, `CoreServices`, or raw aggregate groups. It should expose plugin-facing facades that omit global `unregister`, raw `stores`/`registries`/`services`, raw Tauri/native handles, raw `invoke`, raw SQLite, and filesystem access.
  - Plugin data facades should avoid requiring plugins to pass arbitrary `sourcePluginId`; source ownership is a Plugin Host concern for later tasks.
  - Runtime manifest validation is deferred unless implementation agents find a type-only impossibility.
- External docs verified:
  - TypeScript type-only imports/exports: https://www.typescriptlang.org/docs/handbook/modules/reference#type-only-imports-and-exports
  - TypeScript 3.8 type-only imports/exports: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
  - TypeScript 4.9 `satisfies`: https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html
  - Vitest type testing: https://vitest.dev/guide/testing-types.html
  - Vitest `expectTypeOf`: https://vitest.dev/api/expect-typeof.html
  - Obsidian manifest docs, inspiration only: https://docs.obsidian.md/Reference/Manifest
  - Tauri capabilities: https://v2.tauri.app/security/capabilities/
  - Tauri runtime authority: https://v2.tauri.app/security/runtime-authority/
  - React 19 upgrade guide: https://react.dev/blog/2024/04/25/react-19-upgrade-guide

### Dewey (`test_writer`)

- Status: completed and closed.
- Agent id: `019e4699-91c6-73f3-877d-3d3e0272fd65`.
- Ownership:
  - `src/test/plugin-api-contracts.test.ts`.
- Assignment:
  - Add failing tests for Plugin API exports from `../core/plugin-api` and `../core`.
  - Cover `PluginManifest`, dependencies, app-domain permissions, all required `PluginContributions` buckets, inert manifest descriptors, `AppPlugin` lifecycle types, and `PluginContext` plugin-facing facade boundaries.
  - Use `expectTypeOf`, `satisfies`, and `@ts-expect-error` negative tests.
  - Do not edit production code, docs, config, package files, lockfiles, or existing tests.
- Outcome:
  - Dewey created `src/test/plugin-api-contracts.test.ts`.
  - Harvey (`test_writer`, `019e4699-91c6-73f3-877d-3da69e61bb46`) then refined the same test file to reduce noisy diagnostics while preserving the same contract coverage.
- Commit:
  - `b083d6c Dewey(test)(Define Plugin API contracts): add plugin API contract tests`.
- Red checks:
  - `bun run typecheck` fails as expected because `../core/plugin-api` does not exist and `../core` does not export Plugin API contract types.
  - `bun run test:frontend -- src/test/plugin-api-contracts.test.ts` fails as expected because Vite cannot resolve `../core/plugin-api`.
  - `git diff --check` passed.
- Parent decision:
  - Red signal is accepted. Implementation should add type-only Plugin API contracts, the `../core/plugin-api` subpath, and `../core` re-exports without adding Plugin Host runtime behavior.

### Anscombe (`implementer`)

- Status: stopped after status request; focused patch validated and adopted.
- Agent id: `019e4699-91c6-73f3-877d-3e195c73f349`.
- Ownership:
  - `src/core/plugin-api/`.
  - `src/core/index.ts`.
  - `src/core/types/index.ts` only if directly necessary for type-only re-exports.
- Assignment:
  - Add the minimum type-only Plugin API contracts needed to pass `src/test/plugin-api-contracts.test.ts`.
  - Keep contributions inert and data-only, `slots` canonical, plugin context facades scoped, and native/Tauri/Host/runtime behavior out of TASK-010.
  - Do not edit tests, docs, config, package files, lockfiles, Tauri/Rust, UI, or existing runtime code unless a type-only import/export impossibility is found.
- Outcome:
  - Anscombe produced a focused production patch but no final response after a status request and a second wait window, so the parent stopped the agent to protect the checkout.
  - Parent accepted the patch after focused validation.
  - Added type-only Plugin API contract modules under `src/core/plugin-api/`: `manifest.ts`, `contributions.ts`, `context.ts`, `plugin.ts`, and `index.ts`.
  - Re-exported Plugin API contract types from `src/core/index.ts`.
  - Kept manifest contributions as inert data descriptors and did not add Plugin Host lifecycle, runtime loading, native bridge, Tauri IPC, filesystem, SQLite, UI, or concrete built-in plugin behavior.
- Commit:
  - `603c87b Anscombe(implementation)(Define Plugin API contracts): add plugin API type contracts`.

### Raman (`test_writer`)

- Status: completed and closed.
- Agent id: `019e4699-91c6-73f3-877d-3e8c36a60002`.
- Ownership:
  - `src/test/plugin-api-contracts.test.ts`.
- Assignment:
  - Stabilize the Plugin API contract type assertions after production types exposed brittle `toMatchObjectType` checks.
  - Keep the same contract coverage and do not edit production code.
- Outcome:
  - Replaced broad object-shape `expectTypeOf(...).toMatchObjectType(...)` checks with explicit property-level `toEqualTypeOf` assertions for manifest, contribution buckets, lifecycle hooks, and plugin context facades.
  - Preserved negative sentinel checks for raw runtime handles, legacy `viewSlots`, and non-inert contribution descriptors.
- Commit:
  - `9ec1dbb Raman(test-fix)(Define Plugin API contracts): stabilize plugin API type assertions`.
- Green checks after Raman and Anscombe:
  - `bun run typecheck` passed.
  - `bun run test:frontend -- src/test/core-architecture-boundary.test.ts src/test/plugin-api-contracts.test.ts` passed with 7 tests.
  - `git diff --check` passed.

### Review Round 1

- Status: completed and closed.
- Agents:
  - Mendel (`pr_explorer`, `019e4699-91c6-73f3-877d-3ee19ddd2d49`).
  - Hubble (`reviewer`, `019e4699-91c6-73f3-877d-3f0965129602`).
  - Hypatia (`security_reviewer`, `019e4699-91c6-73f3-877d-3f41ae9c20d0`).
  - Dirac the 2nd (`deprecation_auditor`, `019e4699-91ca-73f3-877d-3f7e98ffecd4`).
  - Maxwell the 2nd (`test_quality_reviewer`, `019e4699-91ca-73f3-877d-3fc89ddaadcf`).
  - Gauss the 2nd (`docs_researcher`, `019e4699-91ca-73f3-877d-400fee5a0a1e`).
  - Lorentz the 2nd (`doc_writer`, `019e4699-91ca-73f3-877d-4110a797fc04`).
- Assignment:
  - Review the TASK-010 diff against `master` for changed surfaces, correctness, public API design, security boundaries, deprecation/API risks, docs consistency, and test quality.
  - Stay read-only and return exact file/line findings or explicitly report no blocking issues.
- Spawn note:
  - `doc_writer` could not spawn because the agent thread limit was reached. Parent will retry a documentation-specific check after a review slot frees if needed.
- Findings:
  - Mendel mapped TASK-010 changed surfaces and confirmed focused checks passed, while flagging stale live status, broad permission/schema risks, and future caller-scoping responsibilities.
  - Hubble found one P1 around missing `PluginContext` contract surfaces for some contribution categories, plus P2 findings for non-inert `unknown` schemas and free-string `MetadataFieldContribution.valueType`.
  - Hypatia found two P1 boundary issues: `PluginViewRegistry`/`PluginSlotRegistry` return raw executable runtime definitions, and manifest contribution schema/filter fields accept executable or host values.
  - Dirac the 2nd found one P1 API hazard: `PluginCommandDefinition`, `PluginViewDefinition`, and `PluginSlotDefinition` are derived from runtime types with `Omit`, so future runtime-only fields can leak into plugin-facing API contracts. Dirac also found P2 schema and helper-export test gaps.
  - Maxwell the 2nd found one P1 test gap: tests do not prove caller-supplied registry `pluginId` is impossible. Maxwell also found P2 gaps for helper exports and executable schema-field coverage.
  - Gauss the 2nd found no P0/P1 issues and P2 documentation/traceability drift in product/architecture docs and live status.
  - Lorentz the 2nd found required docs updates for canonical `slots`, current contribution buckets, current lifecycle, `src/core/plugin-api` transitional location, richer manifest sketches, and narrowed plugin-facing `PluginContext`.
- Parent decisions:
  - Treat Hypatia's raw executable view/slot facade finding, Dirac's `Omit`-coupled registration contract finding, and Maxwell's caller-supplied `pluginId` test gap as blocking.
  - Add standalone plugin-facing registration contracts instead of deriving them from runtime `CommandDefinition`, `ViewDefinition`, or `SlotContribution`.
  - Registration contracts may accept executable handles only as caller-owned registration input; facade `get`/`list` results must be inert plugin-facing descriptors, not runtime definitions with executable components/conditions.
  - Use JSON-compatible types for manifest schema/filter values so functions, classes, proxies, and native handles do not satisfy manifest contribution descriptors.
  - Use the existing `MetadataValueType` union for `MetadataFieldContribution.valueType`.
  - Add type tests for helper exports, no caller-supplied `pluginId`, no executable manifest descriptor values, and plugin-facing registry descriptor shapes.
  - Keep `settings`, `storage`, `query`, and `eventBus` out of TASK-010 production contracts unless review-fix tests prove they are necessary; record them as future Plugin Host/API surfaces because pre-test parent decisions had deferred them.
  - Patch product and architecture docs after type fixes are green so docs identify `src/core/plugin-api` as the current transitional contract source and `packages/plugin-api` as a future split.

### Review-Fix Tests

- Status: completed and committed.
- Agents:
  - Godel the 2nd (`test_writer`, `019e4699-91ca-73f3-877d-41cd511c596a`).
  - Euclid the 2nd (`test_writer`, `019e4699-91ca-73f3-877d-424b37d0b65d`).
- Assignment:
  - Add type tests for review round 1 gaps in `src/test/plugin-api-contracts.test.ts` only.
  - Cover helper exports, no caller-supplied registry `pluginId`, inert JSON-compatible manifest schema/filter values, `MetadataValueType` metadata field values, and plugin-facing registry return descriptors.
- Outcome:
  - Godel the 2nd left a focused test patch but no final response after a status request and second wait window, so the parent stopped the agent.
  - Euclid the 2nd cleaned up the test patch so the red signal no longer contained unused `@ts-expect-error` placement issues, but also produced no final response after a status request and second wait window. Parent stopped Euclid the 2nd and validated the patch.
- Commit:
  - `03836a4 Euclid the 2nd(test)(Define Plugin API contracts): cover plugin API review gaps`.
- Red checks:
  - `bun run typecheck` fails because production still has broad `MetadataFieldContribution.valueType`, `unknown` schema/filter values, and plugin registry return/list surfaces that leak executable/raw ownership surfaces.
  - `bun run test:frontend -- src/test/plugin-api-contracts.test.ts` passed with 9 tests.
  - `git diff --check` passed.

### Review-Fix Implementation

- Status: completed and committed.
- Agent:
  - Popper the 2nd (`implementer`, `019e4699-91ca-73f3-877d-42c411aad74d`).
- Ownership:
  - `src/core/plugin-api/contributions.ts`.
  - `src/core/plugin-api/context.ts`.
  - `src/core/plugin-api/index.ts`.
  - `src/core/index.ts`.
- Assignment:
  - Make review-fix type tests green without editing tests or docs.
  - Replace `Omit`-derived registration contracts with standalone plugin-facing types.
  - Return inert descriptors from plugin view/slot registries instead of raw executable runtime definitions.
  - Use JSON-compatible manifest schema/filter values and `MetadataValueType` metadata field values.
  - Export any new helper aliases from the Plugin API barrels.
- Outcome:
  - Popper the 2nd left a focused production patch but no final response after a status request and second wait window, so the parent stopped the agent.
  - Parent validated and adopted the patch.
  - Added standalone plugin command/view/slot definitions, inert descriptors, caller-scoped list options, `PluginFilterCondition`, and `PluginFilterQuery`.
  - Updated manifest contribution fields to use `MetadataJsonValue` and `MetadataValueType`.
- Commit:
  - `4a7d33b Popper the 2nd(review-fix)(Define Plugin API contracts): harden plugin API boundaries`.

### Docs Review-Fix

- Status: completed and committed.
- Agent:
  - Dewey the 2nd (`doc_writer`, `019e4699-91ca-73f3-877d-4345918d073d`).
- Ownership:
  - `docs/product/03-plugin-platform.md`.
  - `docs/architecture/03-plugin-api-and-host.md`.
  - `docs/implementation/task-index.md`.
- Assignment:
  - Patch required TASK-010 documentation drift after production fixes are green.
  - Use canonical `slots`, current contribution buckets, current lifecycle, current `src/core/plugin-api` transitional location, and narrowed plugin-facing `PluginContext` wording.
- Outcome:
  - Product manifest sample now uses `slots`, `mobileToolbarItems`, and `settingsPanels`.
  - Product lifecycle/contribution text now separates current TASK-010 API contract from future Plugin Platform work.
  - Architecture docs now identify `src/core/plugin-api` as the current contract source and `packages/plugin-api` as a future split.
  - Task index test plan now says typecheck plus focused type/export tests, with runtime manifest validation deferred until runtime validation exists.
- Commit:
  - `cf38684 Dewey the 2nd(docs)(Define Plugin API contracts): sync plugin API contract docs`.
- Green checks after review fixes:
  - `bun run typecheck` passed.
  - `bun run test:frontend -- src/test/core-architecture-boundary.test.ts src/test/plugin-api-contracts.test.ts` passed with 10 tests.
  - `bun run lint` passed.
  - `git diff --check` passed.

### Targeted Re-Review Round 1

- Status: completed and closed.
- Agents:
  - Newton the 2nd (`reviewer`, `019e4699-91ca-73f3-877d-43b88d7ad728`).
  - Confucius the 2nd (`security_reviewer`, `019e4699-91ca-73f3-877d-43d54efcece2`).
  - Poincare the 2nd (`deprecation_auditor`, `019e4699-91ca-73f3-877d-43f1428ef216`).
  - Kierkegaard the 2nd (`test_quality_reviewer`, `019e4699-91ca-73f3-877d-44192ca70b19`).
  - Turing the 2nd (`docs_researcher`, `019e4699-91ca-73f3-877d-443c455bf839`).
- Findings:
  - Confucius the 2nd found no P0/P1/P2 security issues and confirmed prior boundary P1s are fixed.
  - Newton the 2nd found P2 structural ownership-key leaks: variables containing `pluginId` or `sourcePluginId` remain assignable because the plugin-facing types omit ownership keys instead of reserving them as `never`.
  - Poincare the 2nd found a P1 version of the same issue for `PluginViewListOptions` and `PluginSlotListOptions`, plus P2 helper-export coverage gaps for new descriptor/list/filter aliases.
  - Kierkegaard the 2nd found the same P2 helper-export coverage gap and confirmed the other review-fix gaps are covered.
  - Turing the 2nd found no P0/P1/P2 docs issues and one P3 stale Obsidian link in `docs/architecture/03-plugin-api-and-host.md`.
- Parent decisions:
  - Add failing type tests that cover structural variable assignment, not only fresh object literals.
  - Cover registry inputs/options with `pluginId` and store inputs/options with `sourcePluginId`.
  - Add direct re-export assertions for `PluginFilterCondition`, `PluginFilterQuery`, `PluginCommandDescriptor`, `PluginCommandListOptions`, `PluginViewDescriptor`, `PluginViewListOptions`, `PluginSlotDescriptor`, and `PluginSlotListOptions`.
  - Then update plugin-facing types to reserve ownership keys with `?: never`.
  - Fix the P3 Obsidian link before final gate.

### Targeted Ownership-Key Tests

- Status: completed and committed.
- Agent:
  - Euler the 2nd (`test_writer`, `019e4699-91ca-73f3-877d-45d77364b703`).
- Ownership:
  - `src/test/plugin-api-contracts.test.ts`.
- Assignment:
  - Add tests for structural variable assignment of registry `pluginId` and store `sourcePluginId`.
  - Add direct helper export coverage for new descriptor/list/filter aliases from both public barrels.
- Outcome:
  - Euler the 2nd left a focused test patch but no final response after a status request and second wait window, so the parent stopped the agent.
  - Parent validated and adopted the patch.
- Commit:
  - `06ed813 Euler the 2nd(test)(Define Plugin API contracts): cover ownership key leaks`.
- Red checks:
  - `bun run typecheck` failed only on structural variable assignment leaks for registry `pluginId` and store `sourcePluginId`.
  - `bun run test:frontend -- src/test/plugin-api-contracts.test.ts` passed with 11 tests.
  - `git diff --check` passed.

### Targeted Ownership-Key Implementation

- Status: completed and committed.
- Agent:
  - Harvey the 2nd (`implementer`, `019e4699-91ca-73f3-877d-465a9a190c45`).
- Ownership:
  - `src/core/plugin-api/context.ts`.
- Assignment:
  - Reserve plugin ownership keys in plugin-facing registry/store input types so variables containing `pluginId` or `sourcePluginId` are not structurally assignable.
  - Do not expose those exact ownership keys through the existing `keyof` leak tests.
- Outcome:
  - Added template ownership-key reserved helper types for `plugin${string}` and `sourcePlugin${string}` keys.
  - Applied the reserved helpers to plugin-facing registry definitions/list options and store inputs/options.
- Commit:
  - `e00763b Harvey the 2nd(review-fix)(Define Plugin API contracts): reserve plugin ownership keys`.
- Green checks:
  - `bun run typecheck` passed.
  - `bun run test:frontend -- src/test/plugin-api-contracts.test.ts` passed with 11 tests.
  - `git diff --check` passed.

### Targeted Docs Link Fix

- Status: completed and committed.
- Agent:
  - Codex (`docs`).
- Outcome:
  - Replaced the stale Obsidian Anatomy link with the current official Build a plugin link in `docs/architecture/03-plugin-api-and-host.md`.
- Commit:
  - `cdec5f5 Codex(docs)(Define Plugin API contracts): fix Obsidian plugin docs link`.

### Ownership-Key Public Surface Follow-Up

- Status: completed and committed.
- Agents:
  - Dalton the 2nd (`test_writer`).
  - Galileo the 2nd (`implementer`).
  - Ampere the 2nd (`docs`).
- Outcome:
  - Dalton the 2nd added public-surface type coverage for ownership-key reservations.
  - Galileo the 2nd narrowed the ownership-key reservation helper types in `src/core/plugin-api/context.ts`.
  - Ampere the 2nd fixed the stale Obsidian docs link in `docs/architecture/01-overview-and-monorepo.md`.
- Commits:
  - `0aba310 Dalton the 2nd(test)(Define Plugin API contracts): cover ownership key public surface`.
  - `05c7b82 Galileo the 2nd(review-fix)(Define Plugin API contracts): narrow ownership key reservations`.
  - `f587d31 Ampere the 2nd(docs)(Define Plugin API contracts): fix overview Obsidian docs link`.

### Undefined Ownership-Key Tests

- Status: completed and committed.
- Agent:
  - Mendel (`test_writer`, `019e45a3-4cbd-72e0-ad16-3b48b68a05a8`).
- Ownership:
  - `src/test/plugin-api-contracts.test.ts`.
- Assignment:
  - Validate and finish the existing test-only patch for explicit `pluginId: undefined` and `sourcePluginId: undefined` ownership-key leaks.
  - Preserve type-level Plugin API contract coverage and do not edit production code.
- Outcome:
  - Mendel left the existing patch unchanged after confirming it is focused red coverage.
- Commit:
  - `3c91789 Mendel(test)(Define Plugin API contracts): cover undefined ownership keys`.
- Red checks:
  - `bun run typecheck` failed only in `src/test/plugin-api-contracts.test.ts` on explicit undefined ownership-key assignability and unused `@ts-expect-error` directives.
  - `bun run test:frontend -- src/test/plugin-api-contracts.test.ts` passed with 13 tests.
  - `git diff --check` passed.

### Undefined Ownership-Key Implementation

- Status: completed and committed.
- Agent:
  - Hilbert (`implementer`, `019e45a6-37f2-75c2-b809-d07c7057de7`).
- Ownership:
  - Primary: `src/core/plugin-api/context.ts`.
  - Other `src/core/plugin-api/*.ts` or `src/core/index.ts` only if strictly necessary for exported type compatibility.
- Assignment:
  - Make the undefined ownership-key type tests green without editing tests, docs, config, package files, lockfiles, Rust/Tauri, UI, or agent communication docs.
  - Preserve valid Plugin API usage without requiring plugins to pass ownership keys.
  - Report a blocker if TypeScript cannot express the constraint under the current config without widening scope.
- Outcome:
  - Replaced the optional ownership-key reservation helpers with template-literal index-signature reservations in `src/core/plugin-api/context.ts`.
  - Explicit `pluginId: undefined` and `sourcePluginId: undefined` now fail for fresh object literals and structural variables.
- Commit:
  - `aa20ab6 Hilbert(review-fix)(Define Plugin API contracts): reject undefined ownership keys`.
- Green checks:
  - `bun run typecheck` passed.
  - `bun run test:frontend -- src/test/plugin-api-contracts.test.ts` passed with 13 tests.
  - `git diff --check` passed.

### Targeted Re-Review Round 2

- Status: completed and closed.
- Agents:
  - Laplace (`pr_explorer`, `019e45ab-b5dc-7c01-a6be-f39dfd792333`).
  - Meitner (`reviewer`, `019e45ab-b910-7332-a86c-30a07c877ead`).
  - Zeno (`security_reviewer`, `019e45ab-bc9d-7af2-8058-4807b9c34f3e`).
  - Helmholtz (`deprecation_auditor`, `019e45ab-c215-73d0-9604-6781ca121a52`).
  - Erdos (`test_quality_reviewer`, `019e45ab-c56b-7dd2-a8f1-1065126e3ccc`).
  - Tesla (`docs_researcher`, `019e45ab-c897-7130-8033-19bd1e15f4b3`).
- Assignment:
  - Read-only re-review of TASK-010 against `master`, with focus on Plugin API contracts, ownership-key reservation behavior, public exports, docs/status drift, security boundaries, deprecated/API risks, and test quality.
  - `doc_writer` will run after a review slot frees because project agent threads are capped.
- Outcomes:
  - Laplace mapped the diff and found no scope creep, while highlighting helper-export coverage, a future package-extraction barrel-cycle risk, and the need for future Plugin Host runtime identity enforcement.
  - Meitner found one P2 correctness/API issue: `PluginMetadataStore.list` and `PluginEventStore.list` still expose raw `ListMetadataOptions` / `ListEventsOptions` without `sourcePluginId` reservation.
  - Zeno found no P0/P1/P2 security findings.
  - Helmholtz found three P2 API findings: `Omit` coupling remains in plugin-facing store input contracts, store helper aliases are not directly re-exported from public barrels, and template ownership-key reservations leak synthetic keys into `keyof` surfaces.
  - Erdos found no P0/P1/P2 test-quality findings.
  - Tesla found no P0/P1/P2 docs/current-guidance findings, and two P3s for broader product `register` wording and live status cleanup.
  - Banach (`doc_writer`, `019e45ae-ad5e-7db2-bad0-9d9ebaa8f644`) was spawned after Zeno freed a slot and found two P2 documentation drift issues: docs still describe unavailable `PluginContext` facades as current registration APIs, and examples still pass `pluginId` / `sourcePluginId` through plugin-facing APIs that TASK-010 now rejects.
- Parent decision:
  - Fix Meitner's list ownership gap, Helmholtz's public store helper/export and `Omit` coupling findings where feasible, and Banach's P2 docs drift before final gate.
  - If the `keyof` synthetic-key issue cannot be fixed while preserving explicit-undefined rejection under the current TypeScript config, delegate the attempt and record the tradeoff with agent evidence.

### P2 Review-Fix Handoffs

- Status: completed and committed; narrow re-review pending.
- Agents:
  - Planck (`test_writer`, `019e45b5-00fd-7dc2-9071-3243fe73513b`).
  - Heisenberg (`doc_writer`, `019e45b5-0507-7e12-b7e1-a26f1cd569a5`).
  - Epicurus (`implementer`, `019e45bc-f64f-7063-abcd-73d279f8bf26`).
- Assignments:
  - Planck owns only `src/test/plugin-api-contracts.test.ts` and is adding red coverage for metadata/event list ownership, public store helper exports, store input public shape locking, and feasible `keyof` surface coverage.
  - Heisenberg owns only product/architecture/development/task-index docs and is removing current-contract drift around unavailable facades and caller-supplied ownership keys.
  - Epicurus owns production Plugin API type fixes in `src/core/plugin-api/context.ts`, `src/core/plugin-api/index.ts`, and `src/core/index.ts`.
- Outcomes:
  - Planck added tests for `PluginMetadataStore.list` / `PluginEventStore.list` source ownership, direct store helper alias exports from both public barrels, and public store input shape locks. Planck did not encode a stricter raw `keyof` assertion because rejecting explicit `undefined` under the current TypeScript config requires the synthetic reservation pattern.
  - Heisenberg clarified current manifest-descriptor vs runtime-facade docs, removed stale caller-supplied `pluginId` / `sourcePluginId` examples, replaced unavailable `PluginContext` facade examples, added `uninstall` to the Plugin Host sketch, and marked future-only sketches as outside TASK-010.
- Commits:
  - `689f7cc Planck(test)(Define Plugin API contracts): cover plugin store facade gaps`.
  - `c3a5ac7 Heisenberg(docs)(Define Plugin API contracts): align plugin facade examples`.
- Red/validation checks:
  - `bun run typecheck` fails on Planck's intended Plugin API contract gaps.
  - `bun run test:frontend -- src/test/plugin-api-contracts.test.ts` passes with 14 tests.
  - `git diff --check` passes.
  - After Epicurus, `bun run typecheck` passed, `bun run test:frontend -- src/test/plugin-api-contracts.test.ts` passed with 14 tests, and `git diff --check` passed.
- Implementation outcome:
  - Epicurus added explicit plugin-facing store input/list option shapes for metadata, events, and filters.
  - Metadata/event list options now reserve `sourcePluginId`.
  - Store helper aliases are exported from both `../core/plugin-api` and `../core`.
  - `Omit`-derived plugin-facing store aliases were replaced with direct public shapes.
- Review-fix implementation commit:
  - `47f4cc6 Epicurus(review-fix)(Define Plugin API contracts): harden plugin store facades`.
- Remaining tradeoff:
  - The template-literal ownership reservation pattern remains because it preserves explicit `undefined` ownership-key rejection under the current TypeScript config.
  - Docs `rg` scans found no stale `ctx.metadataFields`, `ctx.algorithms`, `ctx.commands.execute`, plugin-facing `sourcePluginId`, or plugin-facing ownership-key examples outside Core internals and agent communication.

## Parent Decisions

- Use the existing repository checkout and branch only; do not create a sibling worktree.
- Follow TDD: gather docs/API guidance, delegate failing tests to `test_writer`, confirm the red signal, then delegate production implementation to `implementer`.
- Persist agent outputs and parent decisions here instead of relying on chat history.
- Keep TASK-010 focused on contracts. Do not implement Plugin Host lifecycle, native bridge, persisted plugin registry, built-in plugin behavior, app UI, Tauri IPC, SQLite, filesystem, permissions, or concrete business plugin logic.

## Next Action

Spawn narrow re-review agents for the P2 fixes and docs cleanup.
