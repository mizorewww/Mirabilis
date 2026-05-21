# TASK-023 Agent Communication - Metadata UI Plugin

## Task

- Task ID: TASK-023.
- Task name: Implement Metadata UI Plugin.
- Branch: `feat/task-023-metadata-ui-plugin`.
- Parent role: orchestration only.
- Started: 2026-05-21 21:32 CST.

## Source Docs Read By Parent

- `.codex/skills/mirabilis-dev-runner/SKILL.md`.
- `docs/implementation/progress.md`.
- `docs/implementation/task-index.md#task-023-implement-metadata-ui-plugin`.
- `docs/product/04-editor-and-workflows.md#14-metadata-图形化展示`.
- `docs/development/02-implementation-roadmap-and-constraints.md#phase-4metadata-ui`.
- `docs/development/01-data-roadmap-and-mvp.md#phase-4metadata-ui-plugin`.
- `docs/product/03-plugin-platform.md#94-metadata-registry`.
- Related `page.header.metadata` slot references in `docs/product/06-view-slots.md`, `docs/architecture/04-slots-editor-task.md`, `docs/architecture/05-plugin-implementations.md`, and existing TASK-021/TASK-022 docs.

## Initial Scope

- Implement the first unified Metadata UI Plugin slice after Task, Tag, and Filter foundations.
- Acceptance criteria:
  - `page.header.metadata` slot renders plugin-contributed metadata fields.
  - Task, Tag, and Timer placeholder fields can contribute display/edit components.
  - Field editors update metadata through command/service boundaries.
  - Metadata UI remains plugin-driven.
- Test plan from task index:
  - Component tests for metadata bar rendering and editing.
  - Slot ordering tests.

## Initial Out Of Scope

- Native/Tauri/package changes.
- Persistence/schema rewiring.
- Broad rich-editor migration.
- Automatic save-time scanning/indexing.
- Timer runtime behavior beyond placeholder field contribution.
- Calendar, Habit, Stats, ML, AI, Sync, or release behavior.
- Core business behavior beyond generic plugin metadata UI and slot primitives.

## Known Risks For Agents

- Current `metadataFields` are manifest descriptors; renderer/editor runtime contracts may need a narrow generic bridge without pretending all future metadata registry features are done.
- TASK-021 already has a narrow Tag Plugin `page.header.metadata` slot contribution; TASK-023 should either compose with it or define a migration path without regressing tag add/remove behavior.
- TASK-022 added metadata owner reservations from manifest fields; Metadata UI edits must preserve plugin ownership and command/service boundaries.
- Timer fields are placeholders only at this stage unless agents identify a documented acceptance dependency.
- The UI must remain plugin-driven and must not hard-code Task/Tag/Timer business behavior into Core.

## Parent Start Decision

- Select TASK-023 because it is the first unblocked `[ ]` task after TASK-022 completed and merged.
- Start from `master` at final TASK-022 progress commit `5ab2471`.
- Use branch `feat/task-023-metadata-ui-plugin`.
- Delegate planning, current-doc guidance, deprecation/API review, security review, tests, implementation, review, and docs sync to agents.

## Agent/Config Validation

- `.codex/agents/*.toml` parsed successfully with 11 files.
- `codex --strict-config doctor --summary --ascii` reported configuration/auth/MCP/network/WebSocket/reachability OK.
- Non-blocking notes: unrestricted sandbox/network, known `TERM=dumb` terminal failure, and available Codex update.

## Pre-test Guidance

### Boyle - Planner

- Status: completed read-only planning; no files edited, staged, committed, or pushed.
- Acceptance interpretation:
  - `page.header.metadata` should become the unified place where plugin-owned metadata field UI appears.
  - Metadata UI remains plugin-driven; Task, Tag, and Timer placeholder behavior is contributed by plugins, not hard-coded into Core.
  - Field editing goes through command/service boundaries and must not call raw Core stores directly.
  - Current `metadataFields` manifest entries are inert descriptors and reservation inputs, not executable renderer/editor carriers.
- Recommended architecture:
  - Use slots as the executable metadata field runtime.
  - Add a built-in `MetadataUiPlugin` or metadata UI module that supplies a generic `MetadataBar` / renderer for `page.header.metadata`.
  - Business plugins register field components to `page.header.metadata`; the generic bar renders matching contributions in slot order with narrow props such as `{ pageId, metadata, commands }`.
  - Prefer keeping manifest `metadataFields` as declarations/reservations only.
- Work slices:
  - Generic metadata bar / slot renderer.
  - Tag field composition without regressing existing `TagMetadataSlot`.
  - Task field placeholders/editors for current fields only.
  - Timer placeholder contribution without real Timer runtime behavior.
  - Boundary hardening for Core business-agnostic behavior and no native/package surface.
- Likely tests:
  - New `src/test/metadata-ui-plugin.test.tsx`.
  - Existing `src/test/tag-plugin-baseline.test.tsx`, `src/test/plugin-api-contracts.test.ts`, `src/test/plugin-host-lifecycle.test.ts`, `src/test/core-view-slot-registry.test.ts`, and boundary/native-surface guards.

### Pasteur - Docs Researcher

- Status: completed read-only current-doc/test guidance; no files edited, staged, committed, pushed, or tests run.
- Local constraints:
  - TASK-023 is the first unified Metadata UI slice; it should not imply the full future Metadata Registry is complete.
  - Preserve existing Tag behavior: `tag.page-header-metadata.tags` on `page.header.metadata`, order `300`, inert chips, add/remove commands, and wrong-page result validation.
  - Slot ordering is finite numeric `order`, default `0`, ascending, with stable registration-order ties.
  - Plugin-rendered UI should receive narrow props, not full runtime handles from `useRuntime()`.
- Test guidance:
  - Use React Testing Library role/name/label queries and `userEvent.setup()`.
  - Cover rendering order, plugin-driven behavior, command payloads, async command results, accessible labels for repeated editors, wrong-page result handling, and inert unsafe rendering.
- External docs verified:
  - React 19 upgrade guide, React `act`, React `useId`, Testing Library queries / ByRole / async APIs, React Testing Library API, user-event v14 setup, Vitest jsdom / mocking / expect docs.

### Curie - API/Deprecation Auditor

- Status: completed read-only API/deprecation guidance; no files edited, staged, committed, pushed, or tests run.
- P0 guidance:
  - Do not add executable renderers/editors to `manifest.contributes.metadataFields`.
  - Do not invent `ctx.metadataFields` or similar unless TASK-023 intentionally implements and tests a real runtime facade.
  - Metadata editors must not write other plugins' namespaces through raw Core stores; use owner plugin commands or plugin-time ownership-injected facades.
  - Keep business terms out of production Core.
- P1 guidance:
  - Preserve existing Tag contract: plugin id `tag`, field `tag.tags`, slot `tag.page-header-metadata.tags`, order `300`, commands `tag.add-tag` / `tag.remove-tag`, and returned `pageId` validation.
  - Task current fields are only `enabled`, `status`, `sourcePageId`, `sourceBlockId`, `scheduled`, and `due`; estimate and due/estimate setter commands need Task-owned descriptors/commands/docs if implemented.
  - Collect active plugin metadata fields by mirroring the Markdown runtime pattern: active manifests only with trusted `pluginId` injected.
  - If reading raw metadata for display, apply host-derived owner reservations so forged `task` / `tag` records are not rendered as trusted plugin fields.
- Recommended ids:
  - Metadata UI plugin id: `metadata-ui`.
  - Slot id: `page.header.metadata`.
  - Suggested contribution ids include `metadata-ui.page-header-metadata.bar`, `task.page-header-metadata.status`, `task.page-header-metadata.due`, existing `tag.page-header-metadata.tags`, and `timer.page-header-metadata.tracked` as placeholder only.

### Sartre - Security Reviewer

- Status: completed read-only security guidance; no files edited, staged, committed, pushed, or tests run.
- P0/P1 boundaries:
  - Do not add native/Tauri/package surface, network, eval, dynamic renderer/editor code, raw SQL, NativeBridge, filesystem/path/file DTOs, or raw invoke exposure.
  - Do not expose raw runtime, stores, registries, services, pluginHost, NativeBridge, db, filesystem, path, shell, notifications, or shortcuts to plugin-rendered UI.
  - Do not implement Core business behavior for task/tag/timer metadata.
  - Do not allow universal metadata writes; field edits should delegate to owner commands or owner-scoped services.
  - Render metadata values as inert React text; no `dangerouslySetInnerHTML`, raw HTML parsing, dynamic unsafe hrefs, or Markdown-to-HTML execution.
  - Validate editor inputs and command results, including wrong page IDs, wrong field IDs, malformed results, extra keys, and spoofed ownership fields.
- Concrete security tests requested:
  - Render `page.header.metadata` through the real slot registry and verify deterministic ordering.
  - Assert unsafe metadata values do not create links, images, scripts, executable attributes, or HTML.
  - Assert plugin field props exclude raw runtime/stores/registries/services/native/db handles and unrelated plugin metadata.
  - Assert exact command-bus payloads and reject/ignore spoofed keys such as `pluginId`, `sourcePluginId`, `namespace`, `key`, `valueType`, SQL/path/file fields.
  - Seed forged metadata and prove Metadata UI does not treat it as trusted owner data.
  - Add a native-surface guard.

## Parent Decisions After Pre-test Guidance

- Implement TASK-023 as a narrow plugin-driven metadata UI slice:
  - A generic Metadata UI Plugin/bar may compose `page.header.metadata` slot contributions.
  - Existing and new field UIs stay plugin-owned and execute through owner command/service boundaries.
  - Manifest `metadataFields` remain inert descriptors/reservation inputs, not executable renderer/editor declarations.
  - Preserve Tag Plugin behavior while proving it can appear in the unified metadata bar.
  - Task fields should be limited to current Task metadata; Timer should be placeholder-only unless tests and docs define a command-owned surface.
- Defer full Metadata Registry renderer/editor facade, real Timer runtime, date picker polish, estimate editor semantics, save-time scanning/indexing, rich editor migration, native/Tauri/package/Rust changes, Calendar/Habit/Stats/ML/AI behavior, and release packaging.

## Acceptance Test Handoff

- Delegate failing acceptance tests to `test_writer` first. Parent thread will not write tests.
- Required test scope:
  - `page.header.metadata` metadata bar renders registered plugin field contributions in deterministic slot order, including default order, Tag order `300`, and stable ties.
  - Existing Tag field behavior remains compatible: inert tag display, add/remove commands with exact payloads, local feedback/error behavior, and wrong-page command results rejected/ignored.
  - Task field UI is plugin-owned for current fields only; any edit path uses Task-owned command/service boundaries or remains read-only if no command exists.
  - Timer placeholder is plugin-owned and inert/disabled unless a real command is implemented and tested.
  - Metadata values render inertly and unsafe strings do not create executable DOM.
  - Plugin field props are narrow and do not expose raw runtime/stores/registries/services/native/db handles or unrelated plugin metadata.
  - Forged metadata owner records are not rendered or edited as trusted owner metadata.
  - No native/Tauri/package/Rust surface changes.

## Current Next Action

- Lovelace (`test_writer`) is adding failing TASK-023 acceptance tests.
