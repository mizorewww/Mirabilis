# Implementation Progress

This file is the durable progress ledger for the Mirabilis roadmap. Agents must update it after every task transition so work can resume after history compaction, app restart, or scheduled automation runs.

Status markers:

- `[ ]` not started.
- `[~]` in progress.
- `[x]` complete and merged to `master`.
- `[!]` blocked and needs user input or a prerequisite not represented in the task index.

## Current Mode

- Mode: autonomous task-by-task development.
- Canonical branch: `master`.
- Task source: `docs/implementation/task-index.md`.
- Workflow source: `.codex/skills/mirabilis-dev-runner/SKILL.md`.
- Selection rule: choose the first `[ ]` task whose dependencies are `[x]` or only "preferred".
- Completion rule: all acceptance criteria met, focused tests pass, local gate appropriate to the change passes, P0/P1 findings fixed, task branch merged to `master`, and task line changed to `[x]`.

## Milestone M0: Agent and test substrate

- [x] TASK-001: Establish local check scripts and test dependencies

## Milestone M1: Core data kernel

- [x] TASK-002: Create TypeScript core domain types
- [x] TASK-003: Add in-memory Page Store
- [x] TASK-004: Add in-memory Metadata Store
- [x] TASK-005: Add in-memory Event Store
- [x] TASK-006: Add Filter Store and Query AST baseline
- [x] TASK-007: Add Command Registry and Command Bus
- [~] TASK-008: Add View Registry and Slot Registry
- [ ] TASK-009: Add Transaction Manager and Core Runtime composition

## Milestone M2: Native persistence boundary

- [ ] TASK-010: Define Plugin API contracts
- [ ] TASK-011: Implement Plugin Host lifecycle
- [ ] TASK-012: Add NativeBridge TypeScript boundary
- [ ] TASK-013: Add SQLite schema and Rust repositories
- [ ] TASK-014: Expose Tauri IPC commands for core persistence
- [ ] TASK-015: Build app bootstrap and runtime provider

## Milestone M3: Editor and plugin runtime

- [ ] TASK-016: Implement Markdown Editor Plugin shell
- [ ] TASK-017: Add stable block IDs and markdown import/export

## Milestone M4: Task and tag MVP

- [ ] TASK-018: Implement Task Plugin syntax and task page creation
- [ ] TASK-019: Implement task navigation and infinite nesting
- [ ] TASK-020: Implement checkbox toggle and task events
- [ ] TASK-021: Implement Tag Plugin baseline
- [ ] TASK-022: Implement All Tasks and Today filters

## Milestone M5: Metadata and timer loop

- [ ] TASK-023: Implement Metadata UI Plugin
- [ ] TASK-024: Implement Timer Plugin start/stop/pause/resume/switch
- [ ] TASK-025: Implement Time Segment and Time Segment Note

## Milestone M6: Calendar and reporting

- [ ] TASK-026: Implement Calendar Plugin baseline
- [ ] TASK-027: Implement Habit and Heatmap plugins
- [ ] TASK-028: Implement Stats and Chart plugins

## Milestone M7: Capture, search, ML, AI, sync, release

- [ ] TASK-029: Implement Quick Capture and Search plugins
- [ ] TASK-030: Implement ML Plugin baseline predictions
- [ ] TASK-031: Implement AI Plugin provider abstraction
- [ ] TASK-032: Implement Sync Plugin skeleton
- [ ] TASK-033: Add release packaging and local full gate

## Run Log

Add newest entries at the top.

### 2026-05-20 11:28 CST - TASK-008 started

- Branch: `feat/task-008-view-slot-registry`.
- Task: Add View Registry and Slot Registry.
- Scope: implement Core-level view and slot contribution registries with registration, discovery, ordering, duplicate handling, and unregister behavior without rendering UI or business plugin views.
- Agent orchestration: parent thread remains orchestration-only; planner/docs/test/implementation/review work is delegated to agents and summarized in `docs/implementation/agent-communication/TASK-008-view-slot-registry.md`.
- Agent/config checks: `.codex/agents/*.toml` parsed successfully. `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network OK and a desktop-terminal `TERM=dumb` failure, which does not block repository agent work.

### 2026-05-20 11:26 CST - TASK-007 completed

- Branch: `feat/task-007-command-registry-command-bus`.
- Task: Add Command Registry and Command Bus.
- Commits: `d1d0454` start orchestration, `1bb3538` pre-test guidance handoff, `8e416de` pre-test guidance, `336162a` test writer handoff, `65e8727` acceptance tests, `fde4bf1` red signal, `6062aef` implementation handoff, `883c1aa` implementation, `dfd8c02` green signal, `9867fd9` review handoff, `9422ffd` review findings, `c860fef` review-fix test handoff, `1c6c6f3` review-fix coverage, `f7132f5` review-fix red signal, `ea3bf82` review-fix implementation handoff, `6b4c3ac` raw handler cause fix, `97c6856` review-fix green signal, `aa9ee3d` targeted re-review handoff, and `79a7273` targeted re-review outcome.
- Delivered: `createInMemoryCommandRegistry`, `CommandRegistryError`, Core command types, handler-free command descriptors, register/get/list/unregister behavior, exact plugin filtering, duplicate ID rejection, command bus execution through private handlers, sync/async handler support, in-flight handler snapshots, defensive descriptor/context copies, JSON-compatible inert context validation, default shortcut metadata validation, and sanitized handler failure errors.
- Validation: `bun run check:quick` passed, `bun run build` passed, focused `bun run test:frontend -- src/test/core-command-registry.test.ts` passed with 11 tests, and `bun run typecheck`/`bun run lint` passed after review fixes.
- Review: correctness review reported no P0/P1/P2/P3 findings. Security, deprecation/API, and test-quality P2/P3 findings around raw handler causes, standard `Error.cause` semantics, context validation coverage, handler privacy assertions, and command type-barrel coverage were fixed and cleared by targeted re-review. No native/package/Tauri surfaces changed.
- External docs verified by agents: TypeScript generics, generic function guidance, `unknown`, type-only imports/exports, `satisfies`, Vitest async assertions, `expect`, `expectTypeOf`, Vitest type testing, and TC39 `InstallErrorCause`/non-enumerable error cause semantics.
- Remaining risk: before Plugin Host or UI/plugin contexts receive command services, caller-aware authorization or scoped facades must prevent plugins from unregistering or executing unrelated commands. `bun run check:full` was not run because TASK-007 does not touch Tauri IPC, permissions, filesystem, persistence, packaging, or release behavior.

### 2026-05-20 10:44 CST - TASK-007 started

- Branch: `feat/task-007-command-registry-command-bus`.
- Task: Add Command Registry and Command Bus.
- Scope: implement Core-level command registration, discovery, unregistration, and command bus execution without adding business-plugin behavior or UI.
- Agent orchestration: parent thread remains orchestration-only; planner/docs/test/implementation/review work is delegated to agents and summarized in `docs/implementation/agent-communication/TASK-007-command-registry-command-bus.md`.
- Agent/config checks: `.codex/agents/*.toml` parsed successfully. `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network OK and a desktop-terminal `TERM=dumb` failure, which does not block repository agent work.

### 2026-05-20 10:42 CST - TASK-006 completed

- Branch: `feat/task-006-filter-store-query-ast`.
- Task: Add Filter Store and Query AST baseline.
- Commits: `a097393` start orchestration, `8df7418` pre-test guidance handoff, `c03eb51` pre-test guidance, `40bcc3f` test writer handoff, `1b60a72` branch-only workflow correction, `8625477` replacement test handoff, `62ccd62` acceptance tests, `255bb76` red signal, `ba4c314` implementation handoff, `611125c` implementation, `c79b63e` green signal, `c7efc5e` review handoff, `7750de0` review findings, `ab3e4aa` review-fix test handoff, `a7d7aa0` review-fix coverage, `6552296` review-fix red signal, `26c5e09` review-fix implementation handoff, `ec5cc46` review edge fixes, `916047b` review-fix green signal, `8ac6457` targeted review handoff, `ab47a01` targeted review outcome, `bffe6a1` node-count coverage, `c1fceec` node-count coverage notes, `3fff10d` node-count re-review handoff, and `4c1bf61` review traceability cleanup.
- Delivered: `createInMemoryFilterStore`, `FilterStoreError`, Filter Store save/get/update/list/delete contracts, required `viewType`, exact `viewType` and `sourcePluginId` list filters, optional sort/group/source clearing, defensive clone boundaries, unsupported-operator typed errors, baseline Query AST validation for `eq`, `exists`, `within`, recursive `and`/`or`, and JSON-compatible query/sort/group validation with typed errors for hostile values, accessors, non-enumerable data, proxy traps, excess depth, and excess node counts.
- Validation: `bun run check:quick` passed, `bun run build` passed, focused `bun run test:frontend -- src/test/core-filter-store.test.ts` passed with 50 tests, and `bun run typecheck` passed after the final node-count coverage.
- Review: correctness, security, deprecation, docs, and test-quality agents reported no remaining P0/P1/P2/P3 findings after targeted review-fix rounds. Selected findings for raw proxy/reflection traps, hostile filter IDs, non-enumerable properties, operator drift coverage, and node-count exhaustion coverage were fixed before final gate.
- External docs verified by agents: TypeScript recursive aliases and `satisfies`, Vitest `expectTypeOf`, Vitest type testing and `test.each`/`it.each`, WHATWG structured clone, TC39 `JSON.stringify`, and Node.js `structuredClone`.
- Remaining risk: TASK-006 is storage and validation only. Later plugin-facing Filter Service, query execution, IPC, or persistence layers must add caller-bound authorization, query-cost limits, and execution semantics before exposing saved filters beyond Core. `bun run check:full` was not run because TASK-006 does not touch Tauri IPC, permissions, filesystem, persistence, packaging, or release behavior.

### 2026-05-19 23:59 CST - TASK-006 started

- Branch: `feat/task-006-filter-store-query-ast`.
- Task: Add Filter Store and Query AST baseline.
- Scope: implement an in-memory Filter Store and baseline Query AST validation for saved filters, using TASK-002 Core filter types and existing Core store patterns without adding business-plugin query execution.
- Agent orchestration: parent thread remains orchestration-only; planner/docs/test/implementation/review work is delegated to agents and summarized in `docs/implementation/agent-communication/TASK-006-filter-store-query-ast.md`.
- Agent/config checks: `.codex/agents/*.toml` parsed successfully. `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network OK and a desktop-terminal `TERM=dumb` failure, which does not block agent development.

### 2026-05-19 23:56 CST - TASK-005 completed

- Branch: `feat/task-005-in-memory-event-store`.
- Task: Add in-memory Event Store.
- Commits: `30dc584` start orchestration, `25974af` acceptance tests, `e7dda1c` implementation, `74cc716` review-fix coverage, `147ca5a` review edge fixes, `43f0c2e` raw-error coverage, `b8728e0` raw-error normalization, `0800902` list option proxy-trap coverage, `83bc586` list option proxy-trap normalization, `98a3bde` append input property-trap coverage, `bf0b28d` append input property-trap normalization, plus orchestration commits recorded in `docs/implementation/agent-communication/TASK-005-in-memory-event-store.md`.
- Delivered: `createInMemoryEventStore`, `EventStoreError`, Event Store contracts, append/list behavior, page and namespace filters, required `sourcePluginId`, created-time and ID injection, default `event_` Web Crypto IDs, defensive clone boundaries, append-only immutable event facts, JSON-compatible payload validation, and typed collision/identity/source/payload/clone failures.
- Validation: `bun run check:quick` passed, `bun run build` passed, and focused `bun run test:frontend -- src/test/core-event-store.test.ts` passed with 27 tests after review fixes.
- Review: correctness, security, and test-quality agents reported no remaining P0/P1/P2 findings after targeted review-fix rounds. Selected P2 findings for hostile values, list option proxy traps, payload reflection traps, and append input property traps were fixed before final gate.
- External docs verified by agents: no external documentation was required for the final TASK-005 review-fix rounds; the task was driven by local product, architecture, implementation, and testing docs.
- Remaining risk: plugin-facing Event Service or IPC must add caller-bound authorization and size/depth budgets before exposing event append/list behavior to plugins. `bun run check:full` was not run because TASK-005 does not touch Tauri IPC, permissions, filesystem, persistence, packaging, or release behavior.

### 2026-05-19 22:32 CST - TASK-005 started

- Branch: `feat/task-005-in-memory-event-store`.
- Task: Add in-memory Event Store.
- Scope: implement in-memory event append/query behavior using TASK-002 Core domain types while preserving immutable event facts, plugin-agnostic storage, and page/namespace filtering.
- Agent orchestration: parent thread remains orchestration-only; planner/docs/test/implementation/review work is delegated to agents and summarized in `docs/implementation/agent-communication/TASK-005-in-memory-event-store.md`.
- Agent/config checks: `.codex/agents/*.toml` parsed successfully. `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network OK and a desktop-terminal `TERM=dumb` failure, which does not block agent development.

### 2026-05-19 22:27 CST - TASK-004 completed

- Branch: `feat/task-004-in-memory-metadata-store`.
- Task: Add in-memory Metadata Store.
- Commits: `dcf6ecc` start orchestration, `66f88d6` pre-test guidance, `9c17ada` test writer handoff, `d8f7dd0` acceptance tests, `739b9e2` red signal, `b9b47ec` implementer handoff, `1c7e95b` implementation, `76e0c2c` green signal, `b804130` review handoff, `e663ffc` review findings, `d17a2d1` review-fix test handoff, `97ac84a` review-fix coverage, `1292f90` review-fix implementation handoff, `39a7739` review edge fixes, `ca2bf45` review-fix green signal, `5583d8c` targeted re-review handoff, `e5b75c7` targeted findings, `5ba2585` final test handoff, `8eca0ab` final edge coverage, `9c74bcf` final implementation handoff, `89a1df4` inherited sparse-array fix, `3bea58f` final green signal.
- Delivered: `createInMemoryMetadataStore`, `MetadataStoreError`, Metadata Store contracts, set/get/list/delete by exact `pageId`, `namespace`, and `key`, deterministic ID/time injection, default `metadata_` Web Crypto IDs, defensive clone boundaries, typed identity/source/value/collision/not-found/clone errors, JSON-compatible value validation, exact filter semantics, and public Core/stores/types exports.
- Validation: `bun run check:quick` passed, `bun run build` passed, focused `bun run test:frontend -- src/test/core-metadata-store.test.ts` passed with 22 tests after review fixes.
- Review: review and targeted re-review agents reported no remaining P0/P1 findings; selected P2 findings were fixed before final gate.
- External docs verified by agents: TypeScript type/export guidance, MDN JSON serialization and structured clone limitations, MDN/Web Crypto `randomUUID` and `getRandomValues`, ECMA-262 own-property/`HasProperty` behavior, Vitest `vi.stubGlobal`/`vi.unstubAllGlobals`, Vite 7 environment guidance, and Tauri v2 environment constraints.
- Remaining risk: plugin-facing Metadata Service or IPC must add caller-bound authorization and size/depth budgets before exposing raw metadata writes, enumeration, or deletion. `bun run check:full` was not run because TASK-004 does not touch Tauri IPC, permissions, filesystem, persistence, packaging, or release behavior.

### 2026-05-19 21:34 CST - TASK-004 started

- Branch: `feat/task-004-in-memory-metadata-store`.
- Task: Add in-memory Metadata Store.
- Scope: implement in-memory metadata set/get/list/delete behavior using TASK-002 Core domain types while preserving JSON-compatible values, required `sourcePluginId`, and plugin-agnostic storage semantics.
- Agent orchestration: parent thread remains orchestration-only; planner/docs/test/implementation/review work is delegated to agents and summarized in `docs/implementation/agent-communication/TASK-004-in-memory-metadata-store.md`.

### 2026-05-19 21:31 CST - TASK-003 completed

- Branch: `feat/task-003-in-memory-page-store`.
- Task: Add in-memory Page Store.
- Commits: `22d393e` start orchestration, `8e87100` pre-test guidance, `b8cc6e5` tests, `c967cd0` failing-test handoff, `3886432` implementation, `19885eb` implementation handoff, `972cf58` review-fix tests, `7769cd7` review-fix implementation, `6bc7314` final P2 tests, `1e71a0e` final review notes.
- Delivered: `createInMemoryPageStore`, `PageStoreError`, Page Store contracts, create/get/update/archive/list behavior, deterministic ID/time injection, defensive clone boundaries, typed missing/collision/clone-failure errors, Web Crypto default ID fallback, and focused Page Store tests.
- Validation: `bun run check:quick` passed, `bun run build` passed, targeted re-review cleared P0/P1 findings and final P2 tests were added before merge.
- External docs verified by agents: TypeScript strict/type-only module guidance, Vitest writing/type/assertion guidance, Vite browser compatibility and build targets, Tauri v2 WebView version docs, MDN `structuredClone`, MDN Web Crypto `randomUUID`/`getRandomValues`, and MDN `Math.random`.
- Remaining risk: `bun run check:full` was not run because TASK-003 does not touch Tauri IPC, permissions, filesystem, persistence, packaging, or release behavior.

### 2026-05-19 20:51 CST - TASK-003 started

- Branch: `feat/task-003-in-memory-page-store`.
- Task: Add in-memory Page Store.
- Scope: implement in-memory Markdown Page CRUD/list/archive behavior using TASK-002 Core domain types while preserving stable page IDs, timestamps, and structured document block IDs.
- Agent orchestration: parent thread remains orchestration-only; planner/docs/test/implementation/review work is delegated to agents and summarized in `docs/implementation/agent-communication/TASK-003-in-memory-page-store.md`.

### 2026-05-19 20:46 CST - TASK-002 completed

- Branch: `feat/task-002-core-domain-types`.
- Task: Create TypeScript core domain types.
- Commits: `dd4979e` tests, `5bb7ae3` implementation, `0f7b07e` orchestration docs, `7e77fe6` test review fixes, `768e93e` testing strategy docs.
- Delivered: `src/core` type-only entrypoint and type modules for `MarkdownPage`, `StructuredMarkdownDocument`, `MetadataRecord`, `AppEvent`, `FilterDefinition`, and supporting block/metadata/filter types; focused type-contract tests; production Core boundary test; agent communication status docs.
- Validation: `bun run check:quick` passed, `bun run build` passed, focused targeted re-review agents reported no remaining P0/P1/P2 findings.
- External docs verified by agents: TypeScript module/type-only/isolated module guidance, Vitest `expectTypeOf` and type testing guidance, Vite TypeScript transpile behavior, Vite 7 Node requirements, and TypeScript compiler API modifier guidance.
- Remaining risk: `bun run check:full` was not run because TASK-002 does not touch Tauri IPC, permissions, filesystem, persistence, packaging, or release behavior.

### 2026-05-19 19:54 CST - TASK-002 started

- Branch: `feat/task-002-core-domain-types`.
- Scope: define TypeScript Core domain types for Markdown pages, structured Markdown documents, metadata records, app events, and filter definitions without business-plugin behavior.
- Agent orchestration: parent thread remains orchestration-only; planner/docs/test/implementation/review work is delegated to agents.

### 2026-05-19 19:51 CST - TASK-001 completed

- Branch: `feat/task-001-local-check-scripts-v2`.
- Commits: `3a6f273` test, `dfe3494` implementation, `6057581` local-check docs, `ebee421` review fixes, `3f6e85f` Node prerequisite docs, `be08473` gate wording docs.
- Delivered: Bun package scripts for `typecheck`, `lint`, `test:frontend`, `fmt:rust`, `clippy`, `test:rust`, `check:quick`, and `check:full`; Vitest/jsdom/React Testing Library setup; ESLint flat config for TypeScript, React Hooks, React Refresh, Testing Library, and jest-dom; focused frontend test proving the stack.
- Validation: `bun run check:quick` passed, `bun run build` passed, review agents reported no P0/P1 findings, security review found no security-sensitive changes.
- External docs verified by agents: Vite 7 Node.js support, Vitest config/`mergeConfig`, Testing Library React and user-event guidance, jest-dom Vitest setup, ESLint flat config, and Tauri/Cargo local check commands.
- Remaining risk: `bun run check:full` was not run because TASK-001 does not touch packaging, IPC, permissions, filesystem, persistence, or release behavior.

### 2026-05-19 19:02 CST - TASK-001 started

- Branch: `feat/task-001-local-check-scripts-v2`.
- Scope: establish Bun scripts for typecheck, lint, frontend tests, Rust checks, quick/full gates, and document the exact commands.
- Agent orchestration: started fresh from `master` after validating project agent TOML and specialized `test_writer`/`implementer` health checks.
