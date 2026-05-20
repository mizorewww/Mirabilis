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

- Status: review round 1 active.
- Active agents:
  - Mendel (`pr_explorer`, `019e4699-91c6-73f3-877d-3ee19ddd2d49`): map TASK-010 diff, changed surfaces, and review focus.
  - Hubble (`reviewer`, `019e4699-91c6-73f3-877d-3f0965129602`): correctness and public API review.
  - Hypatia (`security_reviewer`, `019e4699-91c6-73f3-877d-3f41ae9c20d0`): plugin boundary and permission review.
  - Dirac the 2nd (`deprecation_auditor`, `019e4699-91ca-73f3-877d-3f7e98ffecd4`): TypeScript/Vitest/API/deprecation review.
  - Maxwell the 2nd (`test_quality_reviewer`, `019e4699-91ca-73f3-877d-3fc89ddaadcf`): acceptance-test quality review.
  - Gauss the 2nd (`docs_researcher`, `019e4699-91ca-73f3-877d-400fee5a0a1e`): local-doc and current official-doc review.
- Next agent step: wait for review outputs, then fix any P0/P1 findings before final gate.

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

- Status: active.
- Agents:
  - Mendel (`pr_explorer`, `019e4699-91c6-73f3-877d-3ee19ddd2d49`).
  - Hubble (`reviewer`, `019e4699-91c6-73f3-877d-3f0965129602`).
  - Hypatia (`security_reviewer`, `019e4699-91c6-73f3-877d-3f41ae9c20d0`).
  - Dirac the 2nd (`deprecation_auditor`, `019e4699-91ca-73f3-877d-3f7e98ffecd4`).
  - Maxwell the 2nd (`test_quality_reviewer`, `019e4699-91ca-73f3-877d-3fc89ddaadcf`).
  - Gauss the 2nd (`docs_researcher`, `019e4699-91ca-73f3-877d-400fee5a0a1e`).
- Assignment:
  - Review the TASK-010 diff against `master` for changed surfaces, correctness, public API design, security boundaries, deprecation/API risks, docs consistency, and test quality.
  - Stay read-only and return exact file/line findings or explicitly report no blocking issues.
- Spawn note:
  - `doc_writer` could not spawn because the agent thread limit was reached. Parent will retry a documentation-specific check after a review slot frees if needed.

## Parent Decisions

- Use the existing repository checkout and branch only; do not create a sibling worktree.
- Follow TDD: gather docs/API guidance, delegate failing tests to `test_writer`, confirm the red signal, then delegate production implementation to `implementer`.
- Persist agent outputs and parent decisions here instead of relying on chat history.
- Keep TASK-010 focused on contracts. Do not implement Plugin Host lifecycle, native bridge, persisted plugin registry, built-in plugin behavior, app UI, Tauri IPC, SQLite, filesystem, permissions, or concrete business plugin logic.

## Next Action

Spawn TASK-010 review agents, then fix any P0/P1 findings before final gate and merge.
