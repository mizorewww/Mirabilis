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

- Delegate final docs sync validation/update to `doc_writer`.

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

## Review Wave Handoff

- Heisenberg the 2nd (`pr_explorer`) started at 2026-05-25 16:49 CST.
- Euler the 2nd (`reviewer`) started at 2026-05-25 16:49 CST.
- Dewey the 2nd (`deprecation_auditor`) started at 2026-05-25 16:50 CST.
- Fermat the 2nd (`security_reviewer`) started at 2026-05-25 16:50 CST.
- Meitner the 2nd (`docs_researcher`) started at 2026-05-25 16:50 CST.
- Hooke the 2nd (`test_quality_reviewer`) started at 2026-05-25 16:50 CST.
- All six agents are read-only and must not edit files, commit, merge, or push.
- `doc_writer` start was delayed because the agent thread limit was reached; parent will start it after a slot opens.
- Parent next action: wait for review outcomes, record P0/P1 decisions, and delegate review-fix tests or docs sync as needed.

## Review Wave Outcomes

- Heisenberg the 2nd (`pr_explorer`) found no P0/P1. It mapped the Sync changed surfaces and flagged two review hotspots for other reviewers: broad conflict resolver input validation and char-code encoding for reserved Plugin Settings keys.
- Euler the 2nd (`reviewer`) found one P1:
  - `clonePlainJsonObject` clones into `{}` and assigns keys, so a valid JSON own key named `__proto__` mutates the clone prototype and drops the field from serialized output.
  - Euler also recorded P2s for unsupported conflict resolver kinds and stale docs.
- Dewey the 2nd (`deprecation_auditor`) found one P1:
  - exported `resolveSyncUnitConflict` accepts unsupported or stale non-event sync kinds such as `sync.page` and `sync.plugin_settings`, which conflicts with the canonical-id decision.
  - It confirmed no executable sync transport, native, permission, package, lockfile, Tauri config, schema, or stale literal alias registration drift, and checked current Tauri/Vitest/Vite guidance.
- Fermat the 2nd (`security_reviewer`) found one P1:
  - generic Plugin Settings sync can still carry secrets/auth/credentials or remote endpoint settings through nested JSON or unlisted key variants.
  - It found no live network/socket/worker/native/Tauri/storage imports, whole-workspace sync commands, sibling plugin imports, or raw Core store/runtime/native bridge access.
- Meitner the 2nd (`docs_researcher`) found one P1:
  - long-lived docs must be synced before merge because production now registers `SyncPlugin`, but some docs still treat Sync as future scope and the task requires conflict strategy documentation.
  - It determined no external official docs are needed for this TypeScript-only skeleton; future network/native sync must re-check Tauri security docs.
- Hooke the 2nd (`test_quality_reviewer`) found two P1 test gaps:
  - unsafe JSON rejection does not cover Markdown Page snapshots;
  - Plugin Settings secret/remote coverage only checks top-level setting keys.
  - Hooke also listed P2s for broader manifest-contribution assertions, over-specific conflict resolver tests, and branch-topology-sensitive native guard tests.
- Huygens the 2nd (`doc_writer`) produced a docs-only patch in:
  - `docs/product/03-plugin-platform.md`
  - `docs/product/05-built-in-plugins.md`
  - `docs/architecture/01-overview-and-monorepo.md`
  - `docs/architecture/05-plugin-implementations.md`
  - `docs/architecture/06-filter-native-database.md`
  - `docs/architecture/07-runtime-flows.md`
  - `docs/development/01-data-roadmap-and-mvp.md`
  - `docs/development/02-implementation-roadmap-and-constraints.md`
  - `docs/testing/strategy.md`
  - `docs/implementation/task-index.md`
  - Huygens ran `git diff --check`; parent has not committed the docs patch yet.

## Parent Decisions After Review

- P1s require review-fix tests first:
  - Markdown Page serializer must reject unsafe nested JSON and must be covered by tests.
  - JSON cloning must preserve safe own `__proto__` keys without prototype mutation or field loss.
  - Plugin Settings serializer must reject nested secret/auth/credential/remote endpoint shapes and common key variants, not only top-level setting keys.
  - `resolveSyncUnitConflict` must reject unsupported/stale sync unit kinds and tests must cover stale aliases.
- Production fixes should remain in `src/plugins/sync/**`; tests in `src/test/sync-plugin-skeleton.test.ts`; docs patch remains separate.
- Docs sync will be committed separately after production fixes are green, with any needed updates for strengthened Plugin Settings/resolver behavior.
- Parent next action: delegate review-fix tests to `test_writer`.

## Review-Fix Tests

- Plato the 2nd (`test_writer`) added review-fix tests in `src/test/sync-plugin-skeleton.test.ts`.
- Coverage added:
  - Markdown Page body `attrs` unsafe JSON rejection, including accessors without invoking getters.
  - Valid own `__proto__` JSON key preservation without prototype mutation or field loss.
  - Nested Plugin Settings secret/auth/credential/remote endpoint key rejection under a neutral `config` settings key.
  - Stale and unsupported conflict resolver unit kind rejection while preserving canonical accepted behavior.
  - No-extra Sync manifest contribution assertions.
- Parent red validation:
  - `bun run test:frontend -- src/test/sync-plugin-skeleton.test.ts` failed as expected with 3 failed / 8 passed.
  - Failure symptoms: own `__proto__` key is dropped, nested Plugin Settings reserved keys are accepted, and stale/unsupported resolver kinds are accepted.
- Parent static validation passed:
  - `bun run typecheck`.
  - `./node_modules/.bin/eslint src/test/sync-plugin-skeleton.test.ts --max-warnings=0`.
  - `git diff --check`.
  - `.skip/.only` scan found no matches.
  - Package/native/Tauri/Rust/schema/capability guard was empty.
- Test-fix commit: `86674a5 Plato(test-fix)(Implement Sync Plugin skeleton): cover sync review regressions`.
- Push status: post-commit auto-push failed due to GitHub SSH/remote errors and remains to be retried.

## Review-Fix Implementation Handoff

- Archimedes the 2nd (`implementer`) started at 2026-05-25 17:09 CST.
- Scope: production code only in `src/plugins/sync/syncable-units.ts`, `src/plugins/sync/conflict-policy.ts`, and `src/plugins/sync/index.ts` only if needed.
- Required fixes:
  - preserve own `__proto__` JSON keys as data properties without prototype mutation;
  - reject nested Plugin Settings secret/auth/credential/remote endpoint shapes and common key variants without introducing forbidden production-source literals;
  - reject stale/unsupported conflict resolver unit kinds while preserving canonical mutable/event behavior.
- Constraints: do not edit tests, docs, progress, agent-communication, bootstrap, package/native/Tauri/Rust/schema/capability files, or unrelated source; do not commit, merge, or push.
- Parent next action: wait for Archimedes, validate, then commit if green.

## Review-Fix Implementation Outcome

- Archimedes the 2nd (`implementer`) fixed the TASK-032 production P1s in:
  - `src/plugins/sync/syncable-units.ts`
  - `src/plugins/sync/conflict-policy.ts`
- Fixes delivered:
  - own `__proto__` JSON keys are cloned as data properties without prototype mutation or field loss;
  - Plugin Settings JSON values are recursively scanned after safe cloning and reject nested secret/auth/credential/remote endpoint keys and variants;
  - `resolveSyncUnitConflict` rejects stale, future, and unsupported unit kinds while preserving canonical mutable and event behavior;
  - stable conflict sorting also writes object keys through descriptors to avoid prototype mutation.
- Parent validation:
  - `bun run test:frontend -- src/test/sync-plugin-skeleton.test.ts` passed with 1 file / 11 tests.
  - `bun run test:frontend -- src/test/sync-plugin-skeleton.test.ts src/test/plugin-api-contracts.test.ts src/test/plugin-host-lifecycle.test.ts src/test/core-architecture-boundary.test.ts src/test/ai-plugin-provider-abstraction.test.tsx` passed with 5 files / 104 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - `.skip/.only` scan found no matches.
  - Production Sync forbidden-literal, network/native, stale-id, and package/native/Tauri/Rust/schema/capability scans found no matches.
- Review-fix commit: `45bd231 Archimedes(review-fix)(Implement Sync Plugin skeleton): harden sync DTO boundaries`.
- Push status: post-commit auto-push succeeded and also pushed the prior local review-findings and test-fix commits.
- Parent next action: commit this validation record, then run narrow re-review focused on the closed P1s.

## Narrow Re-Review Outcomes

- Herschel the 2nd (`reviewer`) found one new P1:
  - `resolveSyncUnitConflict` validates top-level `input.unitKind`, but event conflict arrays still accept stale or mismatched unit DTO kinds because `readUnitArray()` casts `local`/`remote` without validating each unit's `kind`. A stale DTO such as `{ kind: "sync.page", ... }` can be returned in merged event units.
- Zeno the 2nd (`security_reviewer`) found two related P1s:
  - event conflict arrays accept stale/unsupported unit DTO kinds;
  - `readSyncUnitId()` reads `unit.syncKey.id` directly, so an accessor-backed `syncKey` getter is invoked before descriptor-safe validation.
- Gibbs the 2nd (`deprecation_auditor`) found no P0/P1 and confirmed the top-level stale-id resolver P1 is fixed.
- Boole the 2nd (`test_quality_reviewer`) found no P0/P1 and confirmed prior P1 test gaps are covered:
  - Markdown Page unsafe JSON;
  - safe own `__proto__` preservation;
  - nested Plugin Settings secret/auth/credential/remote endpoint rejection;
  - stale/unsupported top-level conflict resolver kinds.

## Parent Decisions After Narrow Re-Review

- Add second review-fix tests first for event conflict array DTO validation:
  - event `local` and `remote` arrays must reject stale DTO kinds such as `sync.page`;
  - event arrays must reject mismatched canonical non-event DTO kinds such as `sync.unit.metadata`;
  - event arrays must reject unsupported kinds, wrong schema versions, and malformed unit shapes;
  - event arrays must reject accessor-backed conflict unit fields without invoking getters, especially `syncKey`, `kind`, and `snapshot`.
- Production fix should harden `src/plugins/sync/conflict-policy.ts` only if possible, reusing descriptor-safe JSON validation patterns rather than reading untrusted accessors.
- Huygens' docs patch remains uncommitted and should be updated only if the second P1 fix changes documented behavior.
- Parent next action: delegate second review-fix tests to `test_writer`.

## Second Review-Fix Tests

- Turing the 2nd (`test_writer`) added tests in `src/test/sync-plugin-skeleton.test.ts`.
- Coverage added:
  - event conflict arrays reject stale DTO kinds, mismatched canonical non-event kinds, and unsupported kinds;
  - event conflict arrays reject malformed unit shapes and wrong `schemaVersion`;
  - event conflict arrays reject accessor-backed `syncKey`, nested `syncKey.id`, `kind`, and `snapshot` fields without invoking getters.
- Parent red validation:
  - `bun run test:frontend -- src/test/sync-plugin-skeleton.test.ts` failed as expected with 3 failed / 11 passed.
  - Failure symptoms: invalid event-array kinds did not throw, wrong schema/malformed shapes did not throw or threw raw property errors, and accessor-backed conflict unit fields were read.
- Parent static validation passed:
  - `bun run typecheck`;
  - focused ESLint;
  - `git diff --check`;
  - `.skip/.only` scan;
  - package/native/Tauri/Rust/schema/capability guard.
- Test-fix commit: `7a04d6a Turing(test-fix)(Implement Sync Plugin skeleton): cover event conflict unit validation`; post-commit auto-push succeeded.

## Second Review-Fix Implementation Handoff

- Averroes the 2nd (`implementer`) started at 2026-05-25 17:26 CST.
- Scope: production code only in `src/plugins/sync/conflict-policy.ts`, with `src/plugins/sync/syncable-units.ts` / `src/plugins/sync/index.ts` only if absolutely needed.
- Required fixes:
  - validate every event conflict `local` and `remote` unit DTO before merging;
  - reject stale, mismatched, unsupported, wrong-version, malformed, and accessor-backed event units;
  - do not invoke getters while validating conflict unit fields;
  - preserve canonical event union/dedupe/conflict behavior and top-level stale-kind rejection.
- Constraints: do not edit tests, docs, progress, agent-communication, bootstrap, package/native/Tauri/Rust/schema/capability files, or unrelated source; do not commit, merge, or push.
- Parent next action: wait for Averroes, validate, then commit if green.

## Second Review-Fix Implementation Outcome

- Averroes the 2nd (`implementer`) fixed the remaining event conflict unit validation P1s in `src/plugins/sync/conflict-policy.ts`.
- Fixes delivered:
  - every event conflict `local` and `remote` unit DTO is validated before merge;
  - stale, mismatched, unsupported, malformed, wrong-schema, missing-field, array-snapshot, bad-`syncKey`, and non-object event units are rejected;
  - accessor-backed `kind`, `snapshot`, `syncKey`, and nested `syncKey.id` are rejected without invoking getters;
  - canonical event union, identical duplicate dedupe, same-id/different-content conflict, and top-level stale-kind rejection remain intact.
- Parent validation:
  - `bun run test:frontend -- src/test/sync-plugin-skeleton.test.ts` passed with 1 file / 14 tests.
  - `bun run test:frontend -- src/test/sync-plugin-skeleton.test.ts src/test/plugin-api-contracts.test.ts src/test/plugin-host-lifecycle.test.ts src/test/core-architecture-boundary.test.ts src/test/ai-plugin-provider-abstraction.test.tsx` passed with 5 files / 107 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - `.skip/.only` scan found no matches.
  - Production Sync forbidden-literal, network/native, stale-id, and package/native/Tauri/Rust/schema/capability scans found no matches.
- Review-fix commit: `2b70ec9 Averroes(review-fix)(Implement Sync Plugin skeleton): validate event conflict units`; post-commit auto-push succeeded.
- Parent next action: commit this validation record, then run final narrow re-review focused on event conflict unit validation.

## Final Narrow Re-Review Outcomes

- Boyle the 2nd (`test_quality_reviewer`) found no P0/P1 and confirmed the second review-fix tests meaningfully cover event conflict validation paths.
- Carver the 2nd (`security_reviewer`) found no P0/P1 and confirmed no stale/unsupported/mismatched event array units pass through from a security perspective, with no new native/network/storage/package drift.
- Ampere the 2nd (`reviewer`) found one remaining P1:
  - event conflict validation still accepts malformed distinct-id event DTOs where `snapshot.id` does not match `syncKey.id`, where extra top-level fields are present, or where extra `syncKey` fields are present. Because distinct ids are stored and returned directly, these malformed units can appear in merged output.

## Parent Decisions After Final Narrow Re-Review

- Add third review-fix tests first for exact event DTO validation:
  - reject event units where `snapshot.id !== syncKey.id`;
  - reject extra top-level unit keys beyond `kind`, `schemaVersion`, `snapshot`, and `syncKey`;
  - reject extra `syncKey` keys beyond `id`;
  - preserve canonical distinct-id event merge behavior.
- Production fix should remain focused in `src/plugins/sync/conflict-policy.ts`.
- Parent next action: delegate third review-fix tests to `test_writer`.

## Third Review-Fix Tests

- Epicurus the 2nd (`test_writer`) added exact event DTO validation tests in `src/test/sync-plugin-skeleton.test.ts`.
- Coverage added:
  - reject event units where `snapshot.id !== syncKey.id`;
  - reject event units with extra top-level DTO keys beyond `kind`, `schemaVersion`, `snapshot`, and `syncKey`;
  - reject event units with extra `syncKey` keys beyond `id`;
  - preserve valid serialized distinct-id event merge behavior.
- Parent red validation:
  - `bun run test:frontend -- src/test/sync-plugin-skeleton.test.ts` failed as expected with 1 failed / 15 passed.
  - Failure symptoms: all six malformed-side assertions expected a throw but received none.
- Parent static validation passed:
  - `bun run typecheck`;
  - focused ESLint;
  - `git diff --check`;
  - `.skip/.only` scan;
  - package/native/Tauri/Rust/schema/capability guard.
- Test-fix commit: `f97c98a Epicurus(test-fix)(Implement Sync Plugin skeleton): cover exact event DTO validation`; post-commit auto-push succeeded.

## Third Review-Fix Implementation Outcome

- Hume the 2nd (`implementer`) fixed exact event DTO validation in `src/plugins/sync/conflict-policy.ts`.
- Fixes delivered:
  - event units require exact top-level keys `kind`, `schemaVersion`, `snapshot`, and `syncKey`;
  - event `syncKey` requires exactly `id`;
  - event `snapshot.id` must equal `syncKey.id`;
  - validation remains descriptor-based and does not invoke getters.
- Parent validation:
  - `bun run test:frontend -- src/test/sync-plugin-skeleton.test.ts` passed with 1 file / 16 tests.
  - `bun run test:frontend -- src/test/sync-plugin-skeleton.test.ts src/test/plugin-api-contracts.test.ts src/test/plugin-host-lifecycle.test.ts src/test/core-architecture-boundary.test.ts src/test/ai-plugin-provider-abstraction.test.tsx` passed with 5 files / 109 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - `.skip/.only` scan found no matches.
  - Production Sync forbidden-literal, network/native, stale-id, and package/native/Tauri/Rust/schema/capability scans found no matches.
- Review-fix commit: `1c8cfc8 Hume(review-fix)(Implement Sync Plugin skeleton): require exact event DTOs`; post-commit auto-push succeeded.
- Parent next action: commit this validation record, then run final confirmation review.

## Final Confirmation Review Outcomes

- Kierkegaard the 2nd (`test_quality_reviewer`) found no P0/P1 and confirmed coverage for all previously found P1 areas.
- Arendt the 2nd (`security_reviewer`) found no remaining P0/P1 security findings.
- Mencius the 2nd (`reviewer`) found one remaining P1:
  - event conflict validation accepts non-plain top-level event unit objects and non-plain `syncKey` objects that have exact own DTO keys, then returns the original object in merged output. This allows class instances with inherited runtime behavior such as `toJSON()` through the event conflict path.

## Parent Decisions After Final Confirmation

- Add tests first for runtime-shaped event conflict DTOs:
  - reject class-instance / non-plain top-level event unit objects even when they have exact own DTO keys;
  - reject non-plain `syncKey` objects even when they have exactly an own `id` key;
  - include inherited runtime-shaped behavior such as `toJSON()` in the fixture if useful;
  - preserve plain serialized event unit merge behavior.
- Production fix should remain focused in `src/plugins/sync/conflict-policy.ts` and should either require plain/null prototypes for event unit and `syncKey`, or return only a validated safe clone without accepting runtime-shaped originals.
- Parent next action: delegate final plain-object review-fix tests to `test_writer`.

## Final Plain-Object Review-Fix Tests

- Popper the 2nd (`test_writer`) added tests in `src/test/sync-plugin-skeleton.test.ts`.
- Coverage added:
  - reject class-instance / custom-prototype event conflict DTO wrappers that have exact own DTO keys;
  - reject class-instance / custom-prototype `syncKey` objects that have exactly an own `id`;
  - include inherited runtime behavior such as `toJSON()` / prototype methods;
  - preserve canonical serialized event merge behavior.
- Parent red validation:
  - `bun run test:frontend -- src/test/sync-plugin-skeleton.test.ts` failed as expected with 1 failed / 16 passed.
  - Failure symptoms: class-instance/custom-prototype event units and sync keys were accepted for both `local` and `remote`.
- Parent static validation passed:
  - `bun run typecheck`;
  - focused ESLint;
  - `git diff --check`;
  - `.skip/.only` scan;
  - package/native/Tauri/Rust/schema/capability guard.
- Test-fix commit: `31eba41 Popper(test-fix)(Implement Sync Plugin skeleton): cover runtime-shaped event DTOs`; post-commit auto-push succeeded.

## Final Plain-Object Production Fix Outcome

- Volta the 2nd (`implementer`) fixed runtime-shaped event DTO rejection in `src/plugins/sync/conflict-policy.ts`.
- Fixes delivered:
  - event conflict DTO wrappers and `syncKey` objects must be plain `Object.prototype` records;
  - class instances and custom-prototype objects are rejected before merge;
  - descriptor-safe validation remains intact and getters are not invoked;
  - event union, dedupe, and same-id conflict behavior is preserved.
- Parent validation:
  - `bun run test:frontend -- src/test/sync-plugin-skeleton.test.ts` passed with 1 file / 17 tests.
  - `bun run test:frontend -- src/test/sync-plugin-skeleton.test.ts src/test/plugin-api-contracts.test.ts src/test/plugin-host-lifecycle.test.ts src/test/core-architecture-boundary.test.ts src/test/ai-plugin-provider-abstraction.test.tsx` passed with 5 files / 110 tests.
  - `bun run typecheck` passed.
  - `bun run lint` passed.
  - `git diff --check` passed.
  - `.skip/.only` scan found no matches.
  - Production Sync forbidden-literal, network/native, stale-id, and package/native/Tauri/Rust/schema/capability scans found no matches.
- Review-fix commit: `74bc1d8 Volta(review-fix)(Implement Sync Plugin skeleton): reject runtime-shaped event DTOs`; post-commit auto-push succeeded.
- Parent next action: commit this validation record, then run final confirmation review.

## Final Confirmation Review Outcomes

- Wegener (`reviewer`) found no remaining P0/P1 correctness issues.
  - Confirmed event DTO wrappers must be plain records, `syncKey` is exact and plain, `snapshot.id` equals `syncKey.id`, descriptor-based validation does not invoke getters, canonical event behavior remains intact, prior P1s remain closed, and no runtime sync surface was introduced.
- Planck (`security_reviewer`) found no remaining P0/P1 security issues.
  - Confirmed event DTO/accessor/prototype hardening, prototype-safe JSON cloning, nested Plugin Settings reserved-key rejection, no package/native/Tauri/capability/storage/worker/network drift, and no forbidden production Sync literals beyond expected safe terms.
  - Ran focused native boundary checks for IPC and SQLite tests.
- Ptolemy (`test_quality_reviewer`) found no remaining P0/P1 test-quality gaps.
  - Confirmed tests cover `__proto__`, Markdown unsafe JSON, nested Plugin Settings reserved data, stale resolver kinds, event-array validation/accessors, exact event DTO keys/id, and non-plain event DTO wrappers / `syncKey`.

## Parent Decisions After Final Confirmation

- TASK-032 code and tests are through the P0/P1 review gate.
- Huygens' docs patch remains uncommitted and must be reviewed/updated against final behavior before docs commit.
- Final docs sync should mention strict event DTO validation and keep future sync transport/settings/security caveats explicit.
- Parent next action: delegate final docs sync validation/update to `doc_writer`.

## Final Docs Sync Outcome

- Curie (`doc_writer`) reviewed and updated the existing TASK-032 docs patch against final code behavior.
- Files changed:
  - `docs/architecture/01-overview-and-monorepo.md`
  - `docs/architecture/05-plugin-implementations.md`
  - `docs/architecture/06-filter-native-database.md`
  - `docs/architecture/07-runtime-flows.md`
  - `docs/development/01-data-roadmap-and-mvp.md`
  - `docs/development/02-implementation-roadmap-and-constraints.md`
  - `docs/implementation/task-index.md`
  - `docs/product/03-plugin-platform.md`
  - `docs/product/05-built-in-plugins.md`
  - `docs/testing/strategy.md`
- Documentation now records:
  - built-in `sync` plugin registration as a TypeScript-only skeleton with no commands, views, settings panel, transport, background jobs, or live sync execution;
  - canonical syncable units and DTO/key boundaries for Markdown Page, Metadata, Event, Filter, and Plugin Settings;
  - rebuildable plugin indexes as local derived state that is not durably synced;
  - Plugin Settings unset-vs-JSON-null semantics and top-level plus nested reserved key rejection for secrets/auth/credentials/remote endpoints, while persistent settings/keychain integration remains deferred;
  - conflict policy for mutable manual resolution and event append-only union/dedupe/same-id conflict behavior;
  - strict event conflict DTO validation, including exact keys, plain-record wrappers, plain `syncKey`, descriptor-safe reads, and `snapshot.id === syncKey.id`;
  - deferred tombstones/deletes, conflict UI, native/network transport, settings UI, credentials/keychain, package/native/Tauri/Rust/schema/capability changes.
- Parent validation before commit:
  - `git diff --check` passed.
  - Changed files were docs only.
- Docs commit: `1201a34 Curie(docs)(Implement Sync Plugin skeleton): sync sync plugin docs`; post-commit auto-push succeeded.
- Parent next action: commit this communication update, then run final branch `bun run check:quick`.

## Final Branch Gate

- `bun run check:quick` passed after all TASK-032 code, tests, docs, and communication updates.
- Gate coverage:
  - TypeScript typecheck.
  - ESLint with zero warnings.
  - Vitest frontend suite: 37 files / 578 tests passed.
  - Rust fmt check.
  - Rust clippy with `-D warnings`.
  - Rust tests, including IPC and SQLite boundary suites.
- `docs/implementation/progress.md` was updated to mark TASK-032 complete and record the branch, delivered behavior, key commits, final gate, docs sync, review status, and remaining accepted future risks.
- Parent next action: commit progress/completion update, merge the branch into `master`, run merge-result `bun run check:quick`, then continue to TASK-033.
