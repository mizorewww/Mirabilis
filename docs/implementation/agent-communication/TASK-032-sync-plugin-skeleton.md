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
