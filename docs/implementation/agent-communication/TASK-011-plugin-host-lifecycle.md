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

- Status: review-fix TDD in progress.
- Active agents: Carver (`test_writer`, `019e460a-1484-75f2-8f6e-f6eb5016c232`).
- Next parent step: wait for Carver, validate expected red signal, commit tests, then delegate implementation to `implementer`.

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

- Status: in progress.
- Agent:
  - Carver (`test_writer`, `019e460a-1484-75f2-8f6e-f6eb5016c232`).
- Ownership:
  - `src/test/plugin-host-lifecycle.test.ts`.
- Assignment:
  - Add red tests for stale captured contexts registering after lifecycle exit, owner-scoped metadata/event/filter facades including transaction facades, dependency cascade and dependency-validation gaps, duplicate dependency normalization, explicit staged `install(plugin)` / `register(plugin)` API, lifecycle hook failure behavior, and concrete Plugin Host return types.
  - Do not edit production code, docs, config, package files, lockfiles, Rust/Tauri, or other tests.

## Parent Decisions

- Use the existing repository checkout and branch only; do not create a sibling worktree.
- Follow TDD: delegate pre-test guidance first, then `test_writer`, then `implementer`.
- Persist agent outputs and parent decisions here instead of relying on chat history.
- Keep TASK-011 focused on Plugin Host lifecycle and explicit built-in plugin list loading. Do not implement NativeBridge, Tauri IPC, SQLite persistence, filesystem plugin discovery, UI, or concrete business plugin behavior.

## Next Action

Wait for Carver, then validate and commit the red review-fix tests.
