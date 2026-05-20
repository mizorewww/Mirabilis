# TASK-011 Agent Communication - Plugin Host Lifecycle

## Task

- Task ID: TASK-011.
- Task name: Implement Plugin Host lifecycle.
- Branch: `feat/task-011-plugin-host-lifecycle`.
- Worktree: `/home/aac6fef/Developer/Mirabilis`.
- Parent role: orchestration only.

## Source Docs

- `docs/product/03-plugin-platform.md#8-plugin-生命周期`.
- `docs/architecture/03-plugin-api-and-host.md#6-plugin-host`.
- `docs/implementation/task-index.md#task-011-implement-plugin-host-lifecycle`.
- `docs/testing/strategy.md`.
- TASK-010 Plugin API contracts in `src/core/plugin-api`.

## Acceptance Criteria

- Plugin Host can install, activate, register, deactivate, uninstall, and get plugins.
- Dependency ordering is deterministic.
- Failed plugin registration returns a typed error without corrupting registries.
- Built-in plugin loading works from an explicit plugin list.

## Initial Parent Interpretation

- TASK-011 is a TypeScript Core/plugin-runtime task, not a native/Tauri plugin-loading task.
- The host should use explicit `AppPlugin[]` input; filesystem discovery, dynamic import resolution, Tauri plugins, persisted plugin registry, IPC, SQLite, UI rendering, and concrete business plugins are out of scope.
- The host should build plugin-facing contexts from existing Core runtime/services/registries and TASK-010 `PluginContext` contracts.
- Lifecycle ordering and dependency handling should be deterministic and observable through tests.
- Failed registration must not leave partially registered commands/views/slots in Core registries.
- Runtime manifest validation should be added only if agents determine it is the smallest useful way to meet acceptance criteria; TASK-010 kept manifest validation deferred.

## Agent/Config Checks

- `.codex/agents/*.toml` parsed successfully.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/reachability OK, a WebSocket timeout with HTTPS fallback still available, and the known desktop-terminal `TERM=dumb` failure. Parent treats these as non-blocking for repository agent work because configured agents and HTTPS reachability remain available.

## Current Status

- Status: final micro re-review in progress.
- Active agents: Bohr (`reviewer`) and Linnaeus (`security_reviewer`).
- Next parent step: wait for final micro re-review, then local gate if clear.

## Agent Handoffs

### Pre-test Guidance Round

- Status: completed and closed.
- Agents:
  - Darwin (`planner`, `019e45d7-cde9-7f53-abee-8c535aed815f`).
  - Hume (`docs_researcher`, `019e45d7-d5c3-7701-9849-7fff0f1607ca`).
  - Fermat (`deprecation_auditor`, `019e45d7-e769-7532-a276-daa9377f14c5`).
  - Ohm (`security_reviewer`, `019e45d7-eefb-73d0-b1c5-aec43f6fb750`).
- Assignment:
  - Produce focused behavior, test, docs, API, deprecation, and security-boundary guidance before TDD tests.
  - Stay read-only and do not edit files.
- Outcomes:
  - Darwin recommended adding `src/core/plugin-host/plugin-host.ts`, `src/core/plugin-host/index.ts`, and Core barrel exports. It recommended not wiring Plugin Host into `createInMemoryAppRuntime` yet because TASK-015 owns app bootstrap/runtime provider integration.
  - Hume verified current Obsidian, Tauri, Vitest, and TypeScript docs. Tauri native plugins and Obsidian plugin APIs are inspiration only; Mirabilis keeps local `install` / `activate` / `register` / `deactivate` / `uninstall` API.
  - Fermat flagged P1 decisions to pin lifecycle semantics before tests, avoid raw registry objects through `PluginContext`, and explicitly rollback failed registration because raw registries mutate immediately.
  - Ohm recommended runtime ownership injection, caller-scoped facades, duplicate/dependency validation before hooks, owner-scoped get/list, no raw native handles, and rollback of command/view/slot registrations on failure.
- Parent decisions:
  - Implement TASK-011 as a local TypeScript Plugin Host, not a Tauri/native plugin system.
  - Public host exports should include `PluginHost`, `PluginHostError`, `PluginHostErrorCode`, and small host record/status types from `src/core/plugin-host` and `src/core`.
  - Constructor shape should be `new PluginHost({ services, registries, app })`, using `createInMemoryAppRuntime()` in tests to provide services and registries.
  - `loadBuiltInPlugins(AppPlugin[])` validates the explicit list, performs deterministic dependency sorting, installs plugins, and runs `register` in dependency order, but it does not activate plugins.
  - `activateAll()` activates registered plugins in dependency order. `activate(pluginId)` activates a single registered plugin; it should not hide missing/failed registration.
  - `deactivate(pluginId)` calls optional `deactivate`, unregisters tracked command/view/slot contributions, preserves Core data, and returns the plugin to installed/unregistered state.
  - `uninstall(pluginId)` deactivates/unregisters if needed, calls optional `uninstall`, preserves data by default, and removes the host record.
  - Dependency sorting normalizes string/object dependency refs, treats `optionalDependencies` and `dependencies` entries with `optional: true` as optional, ignores absent optional deps, orders present optional deps before dependents, rejects missing required deps and cycles before hooks run, and preserves input order for independent plugins.
  - `PluginHostError` should follow existing Core error style with `name = "PluginHostError"`, `code`, optional `pluginId`, `dependencyId`, `phase`, and non-enumerable `cause`.
  - Runtime plugin-facing facades must inject `pluginId` / `sourcePluginId`, strip raw registry fields from descriptors, scope command/view/slot `get/list` to the current plugin, and reject caller-supplied ownership keys at runtime.
  - Failed `register` rolls back command/view/slot contributions registered during that attempt, in reverse order, while preserving pre-existing registry entries. Store writes during lifecycle hooks are not in rollback scope for TASK-011.
  - Do not implement filesystem plugin discovery, dynamic imports, Tauri/native plugin loading, persisted plugin registry, migrations, settings/storage APIs, metadata/event/algorithm runtime registries, concrete business plugins, UI rendering, IPC, SQLite, or package extraction.
- External docs verified:
  - Obsidian Manifest, Build a plugin, Events cleanup, load-time guidance, and generated API source for `Component.onload` / `Component.onunload`.
  - Tauri v2 plugin development, capabilities, capability reference, and core permissions.
  - Vitest expect, testing types, v4 `expectTypeOf`, and current type assertion guidance.
  - TypeScript type-only imports/exports, utility/module guidance, and React 19 testing/deprecation notes.

### TDD Tests

- Status: completed and committed.
- Agent:
  - Averroes (`test_writer`, `019e45e0-f1df-7b61-b1d8-19b4a6208abb`).
- Ownership:
  - `src/test/plugin-host-lifecycle.test.ts`.
- Assignment:
  - Add focused red Vitest tests for public Plugin Host exports, explicit built-in list loading, install/register/activate/deactivate/uninstall/get behavior, deterministic dependency order and errors, scoped plugin-facing facades, runtime ownership injection, spoof rejection, failed register rollback, and raw-handle absence.
  - Do not edit production code, docs, config, package files, lockfiles, Rust/Tauri, or existing tests.
- Outcome:
  - Averroes created `src/test/plugin-host-lifecycle.test.ts`.
  - Tests cover public exports, explicit built-in plugin lifecycle ordering, activation/deactivation/uninstall behavior, dependency validation and ordering, typed host errors, scoped plugin-facing facades, ownership spoof rejection, raw context handle absence, and sync/async register rollback.
  - Store-write rollback and out-of-scope native/persistence/UI/plugin-discovery work are intentionally not covered.
- Commit:
  - `12f04de Averroes(test)(Implement Plugin Host lifecycle): add lifecycle acceptance tests`.
- Red checks:
  - `bun run typecheck` failed because `PluginHost`, `PluginHostError`, `PluginHostErrorCode`, `PluginHostRecord`, `PluginHostStatus`, and `../core/plugin-host` do not exist.
  - `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts` failed because Vite cannot resolve `../core/plugin-host`.
  - `git diff --check` passed.

### Implementation

- Status: completed and committed.
- Agent:
  - Hegel (`implementer`, `019e45ee-2e97-71d3-ada0-cb0263d8866d`).
- Ownership:
  - `src/core/plugin-host/plugin-host.ts`.
  - `src/core/plugin-host/index.ts`.
  - `src/core/index.ts` for exports.
- Assignment:
  - Implement minimum production Plugin Host code needed to pass `src/test/plugin-host-lifecycle.test.ts`.
  - Preserve TASK-011 boundaries: no filesystem discovery, dynamic imports, native/Tauri loading, persistence, migrations, UI, IPC, SQLite, concrete business plugins, or package extraction.
- Outcome:
  - Added `PluginHost`, `PluginHostError`, `PluginHostErrorCode`, `PluginHostRecord`, `PluginHostStatus`, `PluginHostOptions`, and Core exports.
  - Implemented explicit built-in plugin loading, deterministic dependency sorting, install/register/activate/deactivate/uninstall/get lifecycle behavior, plugin-facing scoped facades, ownership injection and spoof rejection, raw handle hiding, and command/view/slot register rollback.
- Commit:
  - `766ba86 Hegel(implementation)(Implement Plugin Host lifecycle): add plugin host runtime`.
- Green checks:
  - `bun run typecheck` passed.
  - `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts` passed with 13 tests.
  - `git diff --check` passed.
  - `bun run lint` passed.
  - `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts` passed with 27 tests.

### Review Round 1

- Status: completed.
- Agents:
  - Jason (`pr_explorer`, `019e4601-240b-7aa3-a6d4-7e5d4d39500a`).
  - Herschel (`reviewer`, `019e4601-5951-7b31-8fb9-e0dc85baef02`).
  - Singer (`security_reviewer`, `019e4601-91cc-7b72-b634-0d22b8e76e7b`).
  - Godel (`deprecation_auditor`, `019e4601-cceb-7171-93d3-ff348d5eb477`).
  - Pasteur (`test_quality_reviewer`, `019e4602-07f7-7053-a45c-2f44e5761296`).
  - Peirce (`docs_researcher`, `019e4602-209c-7bd2-8252-0a77c23b0f39`).
- Assignment:
  - Read-only review of TASK-011 diff against `master`, with focus on Plugin Host lifecycle correctness, security boundaries, API/deprecation risk, test quality, and docs drift.
- Outcomes:
  - Jason mapped the diff and highlighted risks around batch-load rollback, lifecycle contributions outside `register`, deactivate/re-activate semantics, dependency cascades, and missing tests.
  - Herschel found one P1 correctness issue: captured plugin contexts can register commands/views/slots after deactivate or uninstall because late registrations are not tracked in `record.contributions`.
  - Herschel also found P2 issues for dependency deactivate/uninstall cascades, installed-but-unregistered dependencies satisfying later dependents, and duplicate dependency declarations downgrading required dependencies to optional.
  - Singer found two P1 security/boundary issues: captured contexts can register untracked capabilities after lifecycle exit, and metadata/event/filter facades are not owner-scoped, allowing cross-plugin read/delete/update and filter ownership hijacking.
  - Godel found one P2 public API issue: lifecycle methods expose `Promise<unknown>` even though they return `PluginHostRecord` shapes.
  - Pasteur found P2 test gaps for explicit staged `install(plugin)` / `register(plugin)` methods, transaction-scoped plugin facades, and typed failure behavior for activate/deactivate/uninstall hooks.
  - Peirce found one P2 docs drift in `docs/architecture/03-plugin-api-and-host.md` for the stale Plugin Host constructor/method sketch and one P3 live-status wording issue about dependent ordering.
- Parent decision:
  - Fix all P1/P2 findings before final gate.
  - Delegate red tests first for stale captured contexts, owner-scoped store facades including transaction facades, dependency cascade/validation gaps, duplicate dependency normalization, explicit staged install/register API, lifecycle hook failure behavior, and typed host return surfaces.
  - Delegate production fixes to `implementer` after the red signal.
  - Delegate docs cleanup after production behavior is settled.

### Review-Fix TDD

- Status: completed and committed.
- Agent:
  - Carver (`test_writer`, `019e460a-1484-75f2-8f6e-f6eb5016c232`).
- Ownership:
  - `src/test/plugin-host-lifecycle.test.ts`.
- Assignment:
  - Add red tests for stale captured contexts registering after lifecycle exit, owner-scoped metadata/event/filter facades including transaction facades, dependency cascade and dependency-validation gaps, duplicate dependency normalization, explicit staged `install(plugin)` / `register(plugin)` API, lifecycle hook failure behavior, and concrete Plugin Host return types.
  - Do not edit production code, docs, config, package files, lockfiles, Rust/Tauri, or other tests.
- Outcome:
  - Carver added tests in `src/test/plugin-host-lifecycle.test.ts` only.
  - New coverage exercises stale captured `PluginContext` late registrations, plugin-owned metadata/event/filter facades including transaction facades, dependency deactivate/uninstall safety, installed-only and failed lifecycle dependency validation, required-vs-optional dependency normalization, explicit staged install/register methods, activate/deactivate/uninstall failure state preservation, and concrete public return types.
- Commit:
  - `a24bd27 Carver(test)(Implement Plugin Host lifecycle): cover lifecycle review gaps`.
- Red checks:
  - `bun run typecheck` failed on missing `install` / `register` and concrete return type assertions.
  - `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts` ran 26 tests with 15 passing and 11 failing in the new P1/P2 review areas.
  - `git diff --check` passed.

### Review-Fix Implementation

- Status: completed and committed.
- Agent:
  - Curie (`implementer`, `019e4610-ba79-7df0-a030-a4f9f5659037`).
- Ownership:
  - `src/core/plugin-host/plugin-host.ts`.
  - `src/core/plugin-host/index.ts`.
  - `src/core/index.ts`.
- Assignment:
  - Implement minimum production fixes for Carver's red tests: staged install/register API, concrete lifecycle return types, stale context registration prevention, owner-scoped store facades including transactions, dependency lifecycle/dependency-validation safety, required dependency normalization, and typed lifecycle failure state preservation.
  - Do not edit tests, docs, config, package files, lockfiles, Rust/Tauri, or unrelated Core modules.
- Outcome:
  - Curie changed `src/core/plugin-host/plugin-host.ts` only.
  - Added explicit staged `install(plugin)` and `register(plugin)` methods.
  - Tightened public lifecycle return types to `PluginHostRecord` and `readonly PluginHostRecord[]`.
  - Blocked stale captured contexts from registering runtime command/view/slot contributions after lifecycle exit.
  - Scoped plugin-facing metadata/event/filter facades, including transaction facades, to the owning plugin.
  - Rejected dependency deactivate/uninstall when registered dependents would be left incoherent.
  - Made only registered/active records satisfy dependencies and preserved required dependencies duplicated in `optionalDependencies`.
  - Preserved safe state and contributions on activate/deactivate/uninstall hook failures.
- Commit:
  - `6845f4c Curie(review-fix)(Implement Plugin Host lifecycle): harden lifecycle boundaries`.
- Green checks:
  - `bun run typecheck` passed.
  - `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts` passed with 26 tests.
  - `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts` passed with 40 tests.
  - `bun run lint` passed.
  - `git diff --check` passed.

### Docs Cleanup

- Status: completed and partially extended.
- Agent:
  - Plato (`doc_writer`, `019e4617-b412-7c40-be36-41e84254e291`).
- Ownership:
  - `docs/architecture/03-plugin-api-and-host.md`.
- Assignment:
  - Fix Peirce's P2 docs drift by aligning the Plugin Host architecture sketch with the implemented `PluginHost({ services, registries, app })` constructor, explicit built-in loading, staged install/register API, concrete lifecycle methods, owner-scoped facades, dependency safety, and no native/filesystem/dynamic-loading behavior in TASK-011.
- Outcome:
  - Plato updated `docs/architecture/03-plugin-api-and-host.md` only.
  - Parent validated the diff and committed it.
  - Plato also noted `docs/architecture/07-runtime-flows.md` still showed the older constructor; parent confirmed with a targeted `rg` scan and delegated that file separately.
- Commit:
  - `3311da9 Plato(docs)(Implement Plugin Host lifecycle): align plugin host architecture`.

### Runtime-Flow Docs Cleanup

- Status: completed and committed.
- Agent:
  - Dalton (`doc_writer`, `019e4619-cbce-74a1-9851-d81b2a9e8a12`).
- Ownership:
  - `docs/architecture/07-runtime-flows.md`.
- Assignment:
  - Replace the stale `new PluginHost(registries, services)` runtime-flow sketch with the current `new PluginHost({ services, registries, app })` constructor and keep built-in plugin loading explicit and illustrative.
- Outcome:
  - Dalton updated `docs/architecture/07-runtime-flows.md` only.
  - Parent confirmed no stale `new PluginHost(registries, services)` references remained in targeted architecture/product/development/task-index scan.
- Commit:
  - `25c1859 Dalton(docs)(Implement Plugin Host lifecycle): align runtime flow sketch`.

### Narrow Re-Review

- Status: completed.
- Agents:
  - Popper (`pr_explorer`, `019e461c-22ee-7aa1-8902-272b7e3700c1`).
  - Kepler (`reviewer`, `019e461c-28cd-7ca2-91a4-0f581c1a232b`).
  - Harvey (`security_reviewer`, `019e461c-2d98-7653-baab-f1e0ad215d75`).
  - Ptolemy (`deprecation_auditor`, `019e461c-330f-7ab1-af36-87a48c31c4f4`).
  - Mill (`test_quality_reviewer`, `019e461c-379a-77e1-a041-4835184d6b09`).
  - Arendt (`docs_researcher`, `019e461c-4f1f-7b03-97de-d83e9f39f14d`).
- Assignment:
  - Read-only narrow re-review of the final TASK-011 diff and P1/P2 review-fix surfaces.
- Outcomes:
  - Popper found no scope creep and highlighted failed install state, active uninstall failure coverage, stale context liveness, dependency behavior, and ownership spoof checks as review hotspots.
  - Kepler found one P1 correctness issue: failed install hooks leave `installed` records, and later `register(plugin)` can skip the failed install and register a plugin whose install never completed.
  - Harvey found one P1 boundary issue: captured plugin contexts still retain page/store/transaction write capability after deactivate or uninstall because lifecycle revocation only guards command/view/slot registration. Harvey also found failed-install residual records as P2.
  - Ptolemy found no P0/P1/P2 API/deprecation findings and verified current Vitest type-testing, `expectTypeOf`, TypeScript, and `Error.cause` guidance.
  - Mill found two P2 test-quality issues: dependency removal tests should assert typed dependency rejection, and stale captured-context tests should assert late registration throws typed errors rather than only not surviving in registries.
  - Arendt found no remaining architecture docs drift and confirmed the Plugin Host docs now align with implementation. Arendt found a P2 stale TASK-010 block in live `status.md`; parent updated that block.
- Parent decision:
  - Fix the remaining P1/P2 findings through a second TDD loop.
  - Red tests should cover stale captured contexts mutating pages/metadata/events/filters/transactions after deactivate/uninstall; failed install rollback/retry safety for both explicit `install(plugin)` / `register(plugin)` and `loadBuiltInPlugins`; strict typed errors for late command/view/slot registration; and typed dependency rejection for deactivate/uninstall with registered dependents.

### Second Review-Fix TDD

- Status: completed and committed.
- Agent:
  - Lovelace (`test_writer`, `019e4626-71a6-7013-9545-b6bbeff551a8`).
- Ownership:
  - `src/test/plugin-host-lifecycle.test.ts`.
- Assignment:
  - Add red tests for stale captured contexts mutating pages/metadata/events/filters/transactions after lifecycle exit, failed-install rollback/retry safety, typed late register errors, and typed dependency rejection for deactivate/uninstall with registered dependents.
  - Do not edit production code, docs, config, package files, lockfiles, Rust/Tauri, or other tests.
- Outcome:
  - Lovelace changed `src/test/plugin-host-lifecycle.test.ts` only.
  - Tests now require stale captured contexts to reject page, metadata, event, filter, and transaction writes after deactivate/uninstall.
  - Tests require failed explicit install and failed batch built-in loading to remove records and preserve retry safety.
  - Tests require late command/view/slot registration and dependency removal failures to throw typed `PluginHostError`.
- Commit:
  - `fa3a44c Lovelace(test)(Implement Plugin Host lifecycle): cover final lifecycle gaps`.
- Red checks:
  - `bun run typecheck` passed.
  - `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts` ran 30 tests with 26 passing and 4 failing in the expected stale-context and failed-install cleanup areas.
  - `git diff --check` passed.

### Final Review-Fix Implementation

- Status: completed and committed.
- Agent:
  - Maxwell (`implementer`, `019e462b-7dc1-7e40-903e-b2a95615e058`).
- Ownership:
  - `src/core/plugin-host/plugin-host.ts`.
- Assignment:
  - Implement minimum production fixes for stale context write revocation after lifecycle exit and failed-install record cleanup/retry safety.
  - Do not edit tests, docs, config, package files, lockfiles, Rust/Tauri, or unrelated Core modules.
- Outcome:
  - Maxwell changed `src/core/plugin-host/plugin-host.ts` only.
  - Failed explicit `install(plugin)` now removes the host record; later `register(plugin)` retries install before registering.
  - `loadBuiltInPlugins()` no longer leaves records for failed install hooks or later plugins whose install hooks did not run.
  - Captured stale lifecycle contexts now reject page, metadata, event, filter, and transaction writes with typed `PLUGIN_LIFECYCLE_FAILED` before mutating Core data.
- Commit:
  - `85a3f71 Maxwell(review-fix)(Implement Plugin Host lifecycle): revoke stale plugin contexts`.
- Green checks:
  - `bun run typecheck` passed.
  - `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts` passed with 30 tests.
  - `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts` passed with 44 tests.
  - `bun run lint` passed.
  - `git diff --check` passed.

### Final Narrow Re-Review

- Status: completed.
- Agents:
  - Aristotle (`reviewer`, `019e4630-8930-7802-bce8-404b37d826fe`).
  - Anscombe (`security_reviewer`, `019e4630-9fc1-7911-8302-a63591273ef7`).
  - Huygens (`test_quality_reviewer`, `019e4630-a601-7d30-ad72-bb8b5a18e7ad`).
  - Hooke (`docs_researcher`, `019e4630-abcc-7860-9ee2-38ace68b0396`).
- Assignment:
  - Read-only final narrow re-review of stale context revocation, failed-install cleanup, test strength, and docs/status alignment.
- Outcomes:
  - Aristotle found one remaining P1 correctness issue: `loadBuiltInPlugins()` deletes only the currently failing install record, leaving earlier installed records from the same failed batch and making retry fail as a duplicate.
  - Anscombe found no P0/P1/P2 security findings and confirmed stale context revocation, ownership spoof rejection, install-failure record cleanup for explicit/current failing paths, and no native/Tauri/fs/dynamic import/IPC/SQLite scope creep.
  - Huygens found one P2 test-strength issue: dependency rejection tests should assert blocked dependency deactivate/uninstall hooks were not called.
  - Hooke found P2 docs/status drift: final Next Actions and current status text needed updating, and architecture docs should mention failed-install cleanup/retry plus stale context page/store/transaction revocation.
- Parent follow-through:
  - Lorentz added the final red tests for batch rollback/retry and dependency hook non-call assertions.
  - Sartre completed the production rollback fix and parent checks are green.
  - Volta completed the docs/status cleanup for final validation.

### Ultra-Narrow Review-Fix TDD

- Status: completed and committed.
- Agent:
  - Lorentz (`test_writer`, `019e4634-f4ad-7fb3-88ea-c41bd17010a3`).
- Ownership:
  - `src/test/plugin-host-lifecycle.test.ts`.
- Assignment:
  - Add a red test for batch `loadBuiltInPlugins()` rollback when a later install hook fails after earlier records were installed, including successful retry behavior.
  - Strengthen dependency rejection tests to assert blocked dependency lifecycle hooks are not called.
  - Do not edit production code, docs, config, package files, lockfiles, Rust/Tauri, or other tests.
- Outcome:
  - Lorentz changed `src/test/plugin-host-lifecycle.test.ts` only.
  - Added a red test proving a later failed built-in install rolls back the whole batch and allows the same list to retry.
  - Added exact events assertions proving dependency-blocked deactivate/uninstall do not call blocked lifecycle hooks.
- Commit:
  - `d1482b3 Lorentz(test)(Implement Plugin Host lifecycle): cover batch install rollback`.
- Red checks:
  - `bun run typecheck` passed.
  - `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts` ran 31 tests with 30 passing and one failing in the new batch rollback case.
  - `git diff --check` passed.

### Ultra-Narrow Implementation

- Status: completed and committed.
- Agent:
  - Sartre (`implementer`, `019e4637-b8e8-7e33-98c7-07a1f93df89a`).
- Ownership:
  - `src/core/plugin-host/plugin-host.ts`.
- Assignment:
  - Fix `loadBuiltInPlugins()` so any install-hook failure rolls back all records installed during that batch and allows retry of the same explicit plugin list.
  - Do not edit tests, docs, config, package files, lockfiles, Rust/Tauri, or unrelated Core modules.
- Outcome:
  - Sartre changed `src/core/plugin-host/plugin-host.ts` only.
  - Failed `loadBuiltInPlugins()` install batches now roll back every record created during that batch, including earlier successful installs and the currently failing record, and restore ordering state so retrying the same explicit list installs/registers deterministically.
- Commit:
  - `b955cb3 Sartre(review-fix)(Implement Plugin Host lifecycle): rollback failed built-in batches`.
- Green checks:
  - `bun run typecheck` passed.
  - `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts` passed with 31 tests.
  - `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts` passed with 45 tests.
  - `bun run lint` passed.
  - `git diff --check` passed.

### Final Docs/Status Cleanup

- Status: completed and committed.
- Agent:
  - Volta (`doc_writer`, `019e463a-6ecd-7c43-929c-eaf7cc1e997c`).
- Ownership:
  - `docs/architecture/03-plugin-api-and-host.md`.
  - `docs/implementation/agent-communication/status.md`.
  - `docs/implementation/agent-communication/TASK-011-plugin-host-lifecycle.md`.
- Assignment:
  - Update architecture docs for failed install cleanup/retry and stale captured context page/store/transaction write revocation.
  - Update live status and task communication so current phase and next actions reflect the final green implementation.
- Outcome:
  - Architecture docs now cover failed explicit install cleanup/retry, failed `loadBuiltInPlugins()` batch rollback/retry, stale captured context write revocation for page/store/transaction operations, and dependency rejection before blocked lifecycle hooks.
  - Live status and this task log now reflect Lorentz's final red tests, Sartre's green production fix, and final validation as the next phase instead of another test/implementation handoff.
- Commit:
  - `b68a2af Volta(docs)(Implement Plugin Host lifecycle): document final lifecycle semantics`.
- Validation:
  - `git diff --check` passed for the docs/status cleanup.

### Final Re-Review

- Status: completed.
- Agents:
  - James (`reviewer`, `019e4640-8d3d-7fa3-aaa0-a25eeeedebbc`).
  - Mencius (`security_reviewer`, `019e4640-9044-7f62-9180-4461db34d992`).
  - Einstein (`test_quality_reviewer`, `019e4640-941e-7583-b04b-305119d3d6e6`).
  - Bernoulli (`docs_researcher`, `019e4640-9850-7dc2-be6d-cbcda623a5c7`).
- Assignment:
  - Read-only final re-review of TASK-011 implementation, tests, security boundaries, and docs/status before local gate.
- Outcomes:
  - James found one P1 correctness issue: unawaited plugin transactions that begin while a lifecycle context is active can still commit after the context is revoked or the plugin is uninstalled because transaction liveness is checked only before delegating to the Core transaction manager.
  - Mencius found no P0/P1/P2 security findings and confirmed boundary behavior plus no native/Tauri/fs/dynamic import/IPC/SQLite/package scope creep.
  - Einstein found no P0/P1/P2 test-quality findings and confirmed focused tests/typecheck/lint/diff-check passed.
  - Bernoulli found one P2 status drift in the bottom Next Actions block; parent will update status after the pending transaction fix.
- Parent decision:
  - Add a focused red test for pending/unawaited `ctx.transaction.run` committing after context revocation/uninstall.
  - Delegate the minimal production fix after the expected red signal.

### Pending Transaction TDD

- Status: completed and committed.
- Agent:
  - Bacon (`test_writer`, `019e4648-adf3-73b2-879c-2e1ccf0a6ba1`).
- Ownership:
  - `src/test/plugin-host-lifecycle.test.ts`.
- Assignment:
  - Add a deterministic red test proving unawaited plugin transactions started during register cannot commit page/store writes after lifecycle context revocation or plugin uninstall.
  - Do not edit production code, docs, config, package files, lockfiles, Rust/Tauri, or other tests.
- Outcome:
  - Bacon changed `src/test/plugin-host-lifecycle.test.ts` only.
  - Added a deterministic red test where `register(ctx)` starts an unawaited transaction, uninstall revokes the plugin context before the transaction handler resolves, and the transaction must reject without committing page/metadata/event/filter writes.
- Commit:
  - `f78822e Bacon(test)(Implement Plugin Host lifecycle): cover pending transaction revocation`.
- Red checks:
  - `bun run typecheck` passed.
  - `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts` ran 32 tests with 31 passing and one failing in the new pending transaction case.
  - `git diff --check` passed.

### Pending Transaction Implementation

- Status: completed and committed.
- Agent:
  - Cicero (`implementer`, `019e464c-612f-74a2-bbe7-1d958fb1b394`).
- Ownership:
  - `src/core/plugin-host/plugin-host.ts`.
- Assignment:
  - Ensure plugin transaction liveness is checked after the async transaction handler resolves and before Core commits staged page/metadata/event/filter writes.
  - Do not edit tests, docs, config, package files, lockfiles, Rust/Tauri, or unrelated Core modules.
- Outcome:
  - Cicero changed `src/core/plugin-host/plugin-host.ts` only.
  - `ctx.transaction.run(handler)` now checks plugin context liveness after the handler resolves and before the Core transaction manager commits staged writes. If the context is stale, the transaction rejects with typed `PLUGIN_LIFECYCLE_FAILED` and staged page/metadata/event/filter changes roll back.
- Commit:
  - `0bd3af3 Cicero(review-fix)(Implement Plugin Host lifecycle): reject stale transaction commits`.
- Green checks:
  - `bun run typecheck` passed.
  - `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts` passed with 32 tests.
  - `bun run test:frontend -- src/test/plugin-host-lifecycle.test.ts src/test/plugin-api-contracts.test.ts` passed with 46 tests.
  - `bun run lint` passed.
  - `git diff --check` passed.

### Final Micro Re-Review

- Status: in progress.
- Agents:
  - Bohr (`reviewer`, `019e4650-6f87-7592-be02-2d314a284d89`).
  - Linnaeus (`security_reviewer`, `019e4650-7e37-7b21-a147-8088f8a4d34a`).
- Assignment:
  - Read-only micro re-review of the pending/unawaited transaction fix before final local gate.

## Parent Decisions

- Use the existing repository checkout and branch only; do not create a sibling worktree.
- Follow TDD: delegate pre-test guidance first, then `test_writer`, then `implementer`.
- Persist agent outputs and parent decisions here instead of relying on chat history.
- Keep TASK-011 focused on Plugin Host lifecycle and explicit built-in plugin list loading. Do not implement NativeBridge, Tauri IPC, SQLite persistence, filesystem plugin discovery, UI, or concrete business plugin behavior.

## Next Action

Wait for final micro re-review, then run local gate if clear.
