# TASK-032 Agent Communication - Sync Plugin Skeleton

## Task

- ID: TASK-032.
- Name: Implement Sync Plugin skeleton.
- Branch: `feat/task-032-sync-plugin-skeleton`.
- Started: 2026-05-25 16:21 CST.
- Parent role: orchestration only. Parent delegates planning, docs research, test writing, implementation, review, and docs sync to specialized agents.

## Source Docs Read By Parent

- `docs/implementation/task-index.md#task-032-implement-sync-plugin-skeleton`.
- `docs/development/01-data-roadmap-and-mvp.md#phase-11sync-plugin`.
- `docs/architecture/01-overview-and-monorepo.md#11-分层结构`.
- Related Sync, plugin settings, and native transport references in `docs/development/02-implementation-roadmap-and-constraints.md`, product docs, architecture docs, and `docs/testing/strategy.md`.

## Initial Parent Interpretation

- Implement the first built-in Sync Plugin skeleton while keeping sync behavior plugin-owned and Core free of sync business behavior.
- The smallest likely slice is TypeScript-only: manifest/registration, syncable unit descriptors/serializers for Markdown Page, Metadata, Event, Filter, and Plugin Settings, rebuildable-index assumptions, conflict-strategy documentation, and static guards that no network/native transport is enabled.
- Local plugin indexes should be treated as derived/rebuildable and not durable sync payloads in this slice.
- Full sync transport belongs to the native/Tauri layer and must not be enabled without explicit settings and security review.
- Current plugin settings are a risk to clarify: docs mention Plugin Settings as syncable, SQLite has plugin settings rows, but current plugin-facing runtime APIs do not expose a durable settings facade.
- Avoid package/native/Tauri/Rust/schema/capability, filesystem, worker, socket, or raw network changes unless agents identify an acceptance-critical blocker.

## Validation At Start

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/WebSocket/reachability OK with known non-blocking notes: unrestricted sandbox/network and `TERM=dumb` terminal failure.

## Parent Decisions

- Start from `master` commit `ad583f4`, after TASK-031 merge validation.
- Use branch `feat/task-032-sync-plugin-skeleton`.
- Delegate pre-test planning/current-doc guidance, deprecation/API audit, and security review before writing tests because TASK-032 touches sync, possible native/Tauri/network surfaces, persistence settings semantics, and conflict-model design.
- Parent thread will not write TASK-032 tests, production implementation, review findings, or formal docs sync unless a delegated agent fails or is explicitly cancelled and the fallback reason is recorded.

## Current Next Action

- Delegate pre-test guidance:
  - `planner` to define the smallest safe TASK-032 slice, canonical ids, unit descriptor/serialization DTOs, conflict strategy, settings approach, acceptance criteria, and deferred scope.
  - `docs_researcher` to verify current Tauri v2 / security / permission implications only if native or network sync appears relevant, plus current testing implications for pure TypeScript plugin tests.
  - `deprecation_auditor` to audit stale sync assumptions, absent settings/query APIs, and native transport/API assumptions.
  - `security_reviewer` to define no-network/no-secret/no-native/capability constraints, conflict/privacy risks, and static guard requirements.

## Pre-Test Guidance Handoff

- Linnaeus the 2nd (`planner`) started at 2026-05-25 16:23 CST.
- Hilbert the 2nd (`docs_researcher`) started at 2026-05-25 16:23 CST.
- Carson the 2nd (`deprecation_auditor`) started at 2026-05-25 16:23 CST.
- Laplace the 2nd (`security_reviewer`) started at 2026-05-25 16:23 CST.
- All agents are read-only and must not edit files, commit, merge, or push.
- Parent next action: wait for guidance, record parent decisions, then delegate failing acceptance tests to `test_writer`.

## Pre-Test Guidance Outcomes

- Linnaeus the 2nd (`planner`) recommended the smallest safe TASK-032 slice:
  - built-in TypeScript-only `sync` plugin registered through `BUILT_IN_PLUGINS`;
  - no runtime commands, no views, no transport, no background jobs, and no live sync execution;
  - expected files: `src/plugins/sync/index.ts`, `src/plugins/sync/plugin.ts`, `src/plugins/sync/syncable-units.ts`, `src/plugins/sync/conflict-policy.ts`, `src/bootstrap/built-in-plugins.ts`, and `src/test/sync-plugin-skeleton.test.ts`;
  - pure caller-provided serializers for Markdown Page, Metadata, Event, Filter, and Plugin Settings snapshots;
  - rebuildable plugin index policy, not a syncable index payload;
  - structured conflict policy with manual resolution for divergent mutable records and append-only event union/dedupe rules.
- Hilbert the 2nd (`docs_researcher`) confirmed TASK-032 can safely remain TypeScript-only. It verified current Tauri v2 guidance for capabilities, permissions, command scopes, HTTP plugin URL scoping, WebSocket permissions, and CSP. It recommended no package/native/Tauri/Rust/capability changes and pure Vitest/static tests.
- Carson the 2nd (`deprecation_auditor`) found no P0 for a pure skeleton and identified P1 hazards if tests assume executable workspace sync, runtime plugin settings APIs, network/native sync, executable indexer runtime, or cross-plugin enumeration through `PluginContext`. It recommended canonical unit ids under `sync.unit.*`, rebuildable marker `sync.rebuildable.plugin-indexes`, and rejection of stale aliases.
- Laplace the 2nd (`security_reviewer`) found no current P0/P1 blocker and required tests to forbid live network, credentials/secrets/auth tokens, remote endpoint settings, Tauri/native/package/capability broadening, whole-workspace export commands, inbound apply/import commands, sibling/Core private imports, and durable plugin index sync payloads.

## Parent Decisions After Guidance

- Use plugin id `sync` and export `SyncPlugin`.
- Add only a TypeScript built-in plugin skeleton. No runtime commands, no views, no settings panel, no network/native transport, no workers/background jobs, no remote endpoints, and no live sync execution.
- Canonical syncable unit kinds:
  - `sync.unit.markdown-page`
  - `sync.unit.metadata`
  - `sync.unit.event`
  - `sync.unit.filter`
  - `sync.unit.plugin-settings`
- Rebuildable index marker:
  - `sync.rebuildable.plugin-indexes`
- Stale ids and aliases such as `sync-plugin`, `sync_plugin`, `core.sync`, `sync.page`, `sync.pages`, `sync.markdown_page`, `sync.plugin_settings`, `sync.indexer`, `sync.indexes`, and any snake_case/plural/network/transport command aliases are not supported.
- Syncable unit serializers are pure functions over caller-provided records. They must not read runtime stores, enumerate workspace data, import sibling plugin internals, or use raw Core stores/registries/runtime/native bridge.
- Plugin Settings are a syncable DTO/snapshot contract only. The serializer distinguishes `{ state: "unset" }` from `{ state: "json", value: null }`; no runtime settings facade, SQLite plugin settings access, settings UI, secrets, keychain, auth, or remote endpoint settings are added.
- Local plugin indexes are derived/rebuildable local state and are excluded from durable sync payloads.
- Conflict policy is a structured exported policy: Markdown Page, Metadata, Filter, and Plugin Settings divergent edits require manual resolution; Event units are append-only with distinct-id union, duplicate identical-id dedupe, and same-id different-content conflict. Tombstones/deletes and conflict UI are deferred.
- Tests should be added first in `src/test/sync-plugin-skeleton.test.ts` and cover registration, DTO serialization, caller mutation snapshots, unsafe value rejection, plugin settings unset-vs-null, rebuildable index exclusion, structured conflict policy, stale-id absence, and static guards for no package/native/Tauri/Rust/schema/capability/network/storage/native/secret drift.

## Current Next Action

- Commit guidance decisions, then delegate failing acceptance tests to `test_writer`.

## Test Writer Handoff

- Sartre the 2nd (`test_writer`) started at 2026-05-25 16:30 CST.
- Scope: tests only, expected file `src/test/sync-plugin-skeleton.test.ts`.
- Required coverage:
  - built-in `sync` plugin registration with no commands/views/settings panels and no stale ids;
  - syncable unit descriptors and serializer DTOs for Markdown Page, Metadata, Event, Filter, and Plugin Settings snapshots;
  - snapshot safety and unsafe JSON rejection for executable/prototype/accessor/cyclic/unsupported nested values;
  - Plugin Settings unset vs JSON null distinction plus secret/remote endpoint key rejection;
  - rebuildable plugin index policy and exclusion from durable sync units;
  - structured conflict policy for mutable manual resolution and event append-only union/dedupe/conflict behavior;
  - static guards for no package/native/Tauri/Rust/schema/capability, network/storage/native/secret/Core/sibling drift.
- Constraints: do not edit production files, docs, progress, package/native/Tauri/Rust/schema/capability files, or agent-communication files; do not commit, merge, or push.
- Parent next action: wait for Sartre the 2nd, validate the expected red signal, and commit the test-only patch.

## Test Writer Outcome

- Sartre the 2nd (`test_writer`) added `src/test/sync-plugin-skeleton.test.ts`.
- Coverage added:
  - built-in `sync` registration with no commands/views/settings panels and stale-id guards;
  - syncable unit descriptors, schema version, sync key fields, rebuildable plugin-index policy, and no durable `sync.plugin-index`;
  - exact DTO serializers for Markdown Page, Metadata, Event, Filter, and Plugin Settings;
  - snapshot immutability and unsafe JSON/runtime-data rejection;
  - Plugin Settings `unset` vs JSON `null`, plus secret/remote settings key rejection;
  - mutable-unit and event append-only conflict policy behavior;
  - static guards for package/native/schema/capability drift and Sync/Core architecture boundaries.
- Parent red validation:
  - `bun run test:frontend -- src/test/sync-plugin-skeleton.test.ts` failed as expected with 6 failed / 1 passed.
  - Failure symptoms: missing `sync` built-in registration and missing `src/plugins/sync` module/exports.
- Parent static validation passed:
  - `bun run typecheck`.
  - `./node_modules/.bin/eslint src/test/sync-plugin-skeleton.test.ts --max-warnings=0`.
  - `git diff --check`.
  - `.skip/.only` scan found no matches.
  - Changed-file/native guards showed only `src/test/sync-plugin-skeleton.test.ts`; package, lock, `src-tauri`, schemas, and capabilities unchanged.
- Test commit: `a0c7ea6 Sartre(test)(Implement Sync Plugin skeleton): add sync skeleton acceptance tests`; post-commit auto-push succeeded.

## Current Next Action

- Commit this implementation outcome record, then delegate review wave.

## Implementation Handoff

- Einstein the 2nd (`implementer`) started at 2026-05-25 16:43 CST.
- Scope: production code only in `src/bootstrap/built-in-plugins.ts` and `src/plugins/sync/**`.
- Required implementation:
  - built-in `sync` plugin registration with no commands, views, settings panels, slots, indexers, algorithms, or mobile toolbar items;
  - exported syncable unit descriptors for Markdown Page, Metadata, Event, Filter, and Plugin Settings;
  - pure JSON-safe serializer functions that snapshot caller-provided DTOs and reject unsafe values without reading accessors;
  - plugin settings unset-vs-JSON-null distinction and reserved-key rejection without enabling settings persistence, secrets, auth, or remote endpoint configuration;
  - rebuildable local plugin-index policy only, not a durable sync payload;
  - structured conflict policy and resolver for mutable manual resolution and event append-only union/dedupe/same-id conflict semantics.
- Constraints: no tests, docs, progress ledger, package/native/Tauri/Rust/schema/capability files, network/native transport, workers/background jobs, remote endpoints, runtime store reads, workspace enumeration, sibling plugin internals, or raw Core store/runtime/native bridge access; no commit, merge, or push.
- Parent next action: wait for Einstein the 2nd, validate, and commit only if checks are green.

## Implementation Outcome

- Einstein the 2nd (`implementer`) completed TASK-032 production code.
- Files changed:
  - `src/bootstrap/built-in-plugins.ts`
  - `src/plugins/sync/index.ts`
  - `src/plugins/sync/plugin.ts`
  - `src/plugins/sync/syncable-units.ts`
  - `src/plugins/sync/conflict-policy.ts`
- Parent also received an additional implementation completion notification from Galileo the 2nd reporting the same changed file set and no residual issues. Parent validated the repository working tree before committing and treated it as the single implementation patch.
- Parent validation:
  - `bun run test:frontend -- src/test/sync-plugin-skeleton.test.ts` passed with 1 file / 7 tests.
  - `bun run test:frontend -- src/test/sync-plugin-skeleton.test.ts src/test/plugin-api-contracts.test.ts src/test/plugin-host-lifecycle.test.ts src/test/core-architecture-boundary.test.ts src/test/ai-plugin-provider-abstraction.test.tsx` passed with 5 files / 100 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - `.skip/.only` scan found no matches.
  - Sync forbidden-literal, network/native, stale-id, and package/native/Tauri/Rust/schema/capability scans found no matches.
- Implementation commit: `23f1b48 Einstein(implementation)(Implement Sync Plugin skeleton): implement sync plugin skeleton`; post-commit auto-push succeeded.
- Remaining intended deferrals: live sync transport, settings UI, credentials/auth, background jobs, native storage/Tauri/Rust/package changes, tombstones/deletes, and conflict UI.
