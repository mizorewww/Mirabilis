# Implementation Task Index

This index converts the product, architecture, and development docs into focused branch-sized tasks. Each task should be small enough for one branch or worktree.

## Milestones

| Milestone | Goal | Exit Criteria |
| --- | --- | --- |
| M0: Agent and test substrate | Codex rules, agent workflow, local validation, and test tooling are ready. | Agents load, hooks work, baseline checks are documented, first failing-test workflow is possible. |
| M1: Core data kernel | Page, Metadata, Event, Filter, Command, View, Slot, and Plugin registries exist in TypeScript with in-memory behavior. | Core contracts are tested without business plugin logic. |
| M2: Native persistence boundary | Rust/Tauri exposes typed SQLite-backed persistence through a narrow native bridge. | CRUD and error contracts pass Rust and frontend wrapper tests. |
| M3: Plugin host runtime | Built-in plugins can install, register, activate, deactivate, and contribute commands/views/slots/metadata/events. | Plugin lifecycle and dependency order are tested. |
| M4: Markdown editor foundation | A Markdown-first editor supports structured documents, stable block IDs, task syntax input, tags, links, and mobile toolbar slots. | Documents can be edited, saved, reopened, and rendered. |
| M5: Task and tag MVP | `- [ ]` creates navigable task pages, supports infinite nesting, checkbox toggles, tags, and task filters. | MVP task loop from Markdown page to nested task page works. |
| M6: Metadata and timer loop | Metadata bar, timer commands, active timer, time segments, notes, recently worked, and unnoted sessions work. | A user can track time against a task and see the segment/note. |
| M7: Calendar and reporting | Calendar, habit, heatmap, stats, and chart plugins present events and metadata as views. | Time and habit data are visible in calendar/heatmap/chart views. |
| M8: ML, AI, sync, and polish | Prediction, AI commands, quick capture, search, sync, packaging, and release readiness land. | Advanced plugins stay plugin-owned and do not pollute Core. |
| M9: MUI user-visible app shell and workspace | Design the full MUI workbench first, then replace the startup card with a Markdown-first app shell, route hosts, slot hosts, navigation, command/search/capture surfaces, contextual panels, settings/sync placeholders, and responsive polish. | The first screen is a usable MUI Markdown workspace with safe route/slot/view composition through existing registries and command execution, without broadening native/Tauri/security surfaces. |

## Cross-Cutting Risks And Unknowns

- Current repo is still the default Tauri skeleton; the docs describe a future monorepo layout that does not exist yet.
- The package currently lacks Vitest, React Testing Library, ESLint, and check scripts.
- SQLite crate choice is not documented yet; verify current Tauri/Rust recommendations before implementation.
- Tiptap/ProseMirror dependency choice is documented as recommended, not installed.
- Tauri capabilities are currently minimal (`core:default`, `opener:default`); filesystem, SQLite, shortcut, notification, tray, and sync permissions must be reviewed before use.
- WebDriver E2E should wait until the app has a stable UI path.

## Task List

### TASK-001: Establish local check scripts and test dependencies

Source docs:

- `docs/testing/strategy.md`
- `docs/development/02-implementation-roadmap-and-constraints.md#19-开发顺序`

Acceptance criteria:

- Add frontend test, lint, typecheck, and local check scripts using the repo's Bun workflow.
- Add Vitest and React Testing Library dependencies for frontend tests.
- Preserve existing `bun run dev`, `bun run build`, `bun run preview`, and `bun run tauri` behavior.
- Document exact commands in `docs/testing/strategy.md`.

Test plan:

- `bun run typecheck`
- `bun run lint`
- `bun run test:frontend`
- `cargo test --manifest-path src-tauri/Cargo.toml --all-features`

Dependencies:

- None.

Docs to verify before implementation:

- Vitest current Vite integration docs.
- React Testing Library current React 19 guidance.

### TASK-002: Create TypeScript core domain types

Source docs:

- `docs/product/02-core-data-model.md`
- `docs/architecture/02-core-kernel.md#4-core-kernel-设计`

Acceptance criteria:

- Define `MarkdownPage`, `StructuredMarkdownDocument`, `MetadataRecord`, `AppEvent`, and `FilterDefinition`.
- Types match documented fields and naming conventions.
- Core types do not mention task, habit, timer, calendar, heatmap, stats, chart, ml, or ai business behavior.
- Type exports are available from the core package/module entrypoint.

Test plan:

- Type-level compilation tests or focused TypeScript tests for constructors/validators if added.
- Architecture grep check for forbidden Core business terms.

Dependencies:

- TASK-001 preferred.

Docs to verify before implementation:

- TypeScript strictness and module layout conventions for the chosen package structure.

### TASK-003: Add in-memory Page Store

Source docs:

- `docs/architecture/02-core-kernel.md#41-markdown-page-store`
- `docs/development/01-data-roadmap-and-mvp.md#271-core_pages`

Acceptance criteria:

- Create, read, update, archive, and list Markdown pages.
- Page IDs are stable and unique.
- `createdAt`, `updatedAt`, and `archivedAt` are handled consistently.
- Structured document bodies preserve stable block IDs.

Test plan:

- Core unit tests for CRUD, archive, update timestamp, and missing-page errors.

Dependencies:

- TASK-002.

### TASK-004: Add in-memory Metadata Store

Source docs:

- `docs/product/02-core-data-model.md#42-metadata`
- `docs/architecture/02-core-kernel.md#42-metadata-store`

Acceptance criteria:

- Set, get, list, and delete metadata by `pageId`, `namespace`, and `key`.
- Values are stored as unknown JSON-compatible data with a value type.
- `sourcePluginId` is required.
- Metadata Store remains plugin-agnostic.

Test plan:

- Core unit tests for set/replace/list/delete and JSON value preservation.

Dependencies:

- TASK-002, TASK-003.

### TASK-005: Add in-memory Event Store

Source docs:

- `docs/product/02-core-data-model.md#43-event`
- `docs/architecture/02-core-kernel.md#43-event-store`

Acceptance criteria:

- Append and query immutable events.
- Events include namespace, type, payload, source plugin, and created time.
- Event queries support page and namespace filters needed by early plugins.
- Existing events are not mutated by updates.

Test plan:

- Core unit tests for append, query, ordering, page filtering, and immutability.

Dependencies:

- TASK-002, TASK-003.

### TASK-006: Add Filter Store and Query AST baseline

Source docs:

- `docs/product/02-core-data-model.md#44-filter`
- `docs/architecture/06-filter-native-database.md#141-query-ast`

Acceptance criteria:

- Save, update, list, and delete filter definitions.
- Query AST supports basic `eq`, `exists`, `within`, `and`, and `or` shapes required by documented filters.
- Unsupported query operators return typed errors.
- Filter definitions include `viewType`.

Test plan:

- Core unit tests for filter CRUD and basic query validation.

Dependencies:

- TASK-002, TASK-004, TASK-005.

### TASK-007: Add Command Registry and Command Bus

Source docs:

- `docs/product/02-core-data-model.md#46-command-registry`
- `docs/architecture/02-core-kernel.md#46-command-registry`
- `docs/development/02-implementation-roadmap-and-constraints.md#203-所有用户动作走-command-registry`

Acceptance criteria:

- Plugins can register and unregister commands.
- Commands expose id, plugin id, title, context, shortcut, and handler.
- UI and plugins execute commands through the command bus.
- Duplicate command IDs are rejected with typed errors.

Test plan:

- Core unit tests for register, duplicate rejection, unregister, execute, and handler errors.

Dependencies:

- TASK-002.

### TASK-008: Add View Registry and Slot Registry

Source docs:

- `docs/product/02-core-data-model.md#45-view-registry`
- `docs/architecture/04-slots-editor-task.md#7-slot-系统`
- `docs/product/06-view-slots.md`

Acceptance criteria:

- Plugins can register views by id/type and slots by slot name.
- Slot contributions support order and conditional rendering metadata.
- Duplicate IDs are rejected.
- View/slot registries remain UI-framework compatible with React components.

Test plan:

- Core unit tests for registration, ordering, duplicate handling, and unregister.

Dependencies:

- TASK-002.

### TASK-009: Add Transaction Manager and Core Runtime composition

Source docs:

- `docs/architecture/02-core-kernel.md`
- `docs/architecture/07-runtime-flows.md#17-启动流程`

Acceptance criteria:

- Core services and registries are composed into an app runtime object.
- Transactions can group page, metadata, event, and filter changes.
- Failed transaction handlers do not partially apply in the in-memory implementation.
- Runtime exposes services through documented names.

Test plan:

- Core integration tests for transaction success, rollback, and runtime service availability.

Dependencies:

- TASK-003, TASK-004, TASK-005, TASK-006, TASK-007, TASK-008.

### TASK-010: Define Plugin API contracts

Source docs:

- `docs/product/03-plugin-platform.md#6-plugin-manifest-设计`
- `docs/architecture/03-plugin-api-and-host.md#5-plugin-api-设计`

Acceptance criteria:

- Define `PluginManifest`, `PluginContributions`, `AppPlugin`, and `PluginContext`.
- Plugin permissions and dependencies are represented.
- Contributions include markdown syntax, metadata fields, event types, commands, filters, views, slots, indexers, algorithms, mobile toolbar items, and settings panels.
- API contracts do not depend on concrete built-in plugin implementations.

Test plan:

- Typecheck and focused type/export tests for `src/core/plugin-api` contracts.
- Add runtime manifest validation tests only if runtime validation is introduced later.

Dependencies:

- TASK-009.

### TASK-011: Implement Plugin Host lifecycle

Source docs:

- `docs/product/03-plugin-platform.md#8-plugin-生命周期`
- `docs/architecture/03-plugin-api-and-host.md#6-plugin-host`

Acceptance criteria:

- Plugin Host can install, activate, register, deactivate, uninstall, and get plugins.
- Dependency ordering is deterministic.
- Failed plugin registration returns a typed error without corrupting registries.
- Built-in plugin loading works from an explicit plugin list.

Test plan:

- Plugin runtime tests for lifecycle order, duplicate plugins, dependencies, and failure handling.

Dependencies:

- TASK-010.

Docs to verify before implementation:

- Current plugin lifecycle patterns in Tauri/Obsidian only as inspiration; Mirabilis API remains local.

### TASK-012: Add NativeBridge TypeScript boundary

Source docs:

- `docs/architecture/06-filter-native-database.md#15-tauri--rust-边界`
- `docs/architecture/01-overview-and-monorepo.md#11-分层结构`

Acceptance criteria:

- Frontend calls Rust through a typed NativeBridge wrapper instead of raw invoke calls scattered through UI.
- Request and response DTOs are typed.
- Errors are normalized into typed app errors.
- No UI component calls Tauri APIs directly for persistence.

Test plan:

- Frontend wrapper tests with Tauri invoke mocked at the boundary.

Dependencies:

- TASK-001, TASK-002.

Docs to verify before implementation:

- Current `@tauri-apps/api` v2 invoke usage.

### TASK-013: Add SQLite schema and Rust repositories

Source docs:

- `docs/development/01-data-roadmap-and-mvp.md#27-数据表设计方向`
- `docs/architecture/06-filter-native-database.md#16-sqlite-schema`

Acceptance criteria:

- SQLite schema exists for core pages, metadata, events, filters, plugins, commands, views, and plugin-owned indexes baseline.
- Rust repositories expose typed CRUD for core tables.
- JSON fields serialize and deserialize consistently.
- Migrations are repeatable and versioned.

Test plan:

- Rust repository tests using a temporary database.
- Migration idempotency test.

Dependencies:

- TASK-012.

Docs to verify before implementation:

- Current recommended Rust SQLite crate and Tauri v2 plugin options.

### TASK-014: Expose Tauri IPC commands for core persistence

Source docs:

- `docs/architecture/06-filter-native-database.md#15-tauri--rust-边界`
- `docs/architecture/07-runtime-flows.md`

Acceptance criteria:

- Tauri commands expose typed page, metadata, event, and filter persistence operations.
- Commands validate inputs and return typed errors.
- Frontend NativeBridge consumes these commands.
- Tauri capability changes are documented and reviewed.

Test plan:

- Rust command tests where practical.
- Frontend NativeBridge contract tests.
- Security review for capability changes.

Dependencies:

- TASK-012, TASK-013.

Docs to verify before implementation:

- Tauri v2 command, capability, and test documentation.

### TASK-015: Build app bootstrap and runtime provider

Source docs:

- `docs/architecture/01-overview-and-monorepo.md#2-monorepo-目录结构`
- `docs/architecture/07-runtime-flows.md#17-启动流程`

Acceptance criteria:

- App initializes storage, Core services, registries, Plugin Host, built-in plugins, and React providers in documented order.
- Runtime is available to UI through a provider/hook.
- Startup failures surface a user-visible error state.
- No plugin business logic lives in App Shell.

Test plan:

- React/provider tests for runtime availability and startup error rendering.
- Unit tests for bootstrap ordering.

Dependencies:

- TASK-011, TASK-014.

### TASK-016: Implement Markdown Editor Plugin shell

Source docs:

- `docs/product/04-editor-and-workflows.md#12-markdown-first-编辑器`
- `docs/architecture/04-slots-editor-task.md#8-markdown-editor-plugin`

Acceptance criteria:

- Markdown Editor Plugin registers page editor view, insert text command, and mobile toolbar slot.
- Editor supports heading, paragraph, list, task syntax text, tag text, and page-link text at baseline.
- Documents save and reopen through Core/NativeBridge.
- Editor collects markdown extensions from runtime.

Test plan:

- Component tests for visible editor behavior.
- Store/persistence integration tests for save and reopen.

Dependencies:

- TASK-015.

Docs to verify before implementation:

- Tiptap/ProseMirror current React integration if selected.

### TASK-017: Add stable block IDs and markdown import/export

Source docs:

- `docs/architecture/02-core-kernel.md#41-markdown-page-store`
- `docs/architecture/04-slots-editor-task.md#92-task-syntax`

Acceptance criteria:

- Every structured block has a stable `blockId`.
- Markdown import creates structured documents with block IDs.
- Markdown export preserves user-visible content.
- Editing existing blocks does not unnecessarily replace block IDs.

Test plan:

- Editor/core tests for import/export round trip and block ID stability.

Dependencies:

- TASK-016.

### TASK-018: Implement Task Plugin syntax and task page creation

Source docs:

- `docs/product/04-editor-and-workflows.md#11-用户核心操作markdown-页面中写任务`
- `docs/product/05-built-in-plugins.md#16-task-plugin`
- `docs/architecture/04-slots-editor-task.md#9-task-plugin-代码架构`

Acceptance criteria:

- `- [ ] A` is recognized as a task block.
- A corresponding Markdown Page is created if the block is not yet bound.
- Created task pages include `task.enabled`, `task.status`, `task.sourcePageId`, and `task.sourceBlockId` metadata.
- Duplicate task pages are not created for the same source block.

Test plan:

- Task Plugin integration tests for task block resolution and metadata.
- Editor behavior test for entering task syntax.

Dependencies:

- TASK-017.

### TASK-019: Implement task navigation and infinite nesting

Source docs:

- `docs/product/01-vision-and-core.md#任务可无限嵌套的-markdown-first-时间管理系统开发文档`
- `docs/product/04-editor-and-workflows.md#113-任务无限嵌套`
- `docs/architecture/07-runtime-flows.md#182-用户点击任务文字`

Acceptance criteria:

- Clicking task text opens the bound task page.
- Task pages are normal Markdown pages that can contain more tasks.
- Nested tasks create their own task pages using the same mechanism.
- Parent/source relationships remain queryable through metadata.

Test plan:

- Component/integration tests for click navigation.
- Core/plugin tests for nested task creation.

Dependencies:

- TASK-018.

### TASK-020: Implement checkbox toggle and task events

Source docs:

- `docs/product/05-built-in-plugins.md#163-点击逻辑`
- `docs/development/02-implementation-roadmap-and-constraints.md#204-所有跨插件协作走-event--metadata--query`

Acceptance criteria:

- Clicking checkbox toggles task status.
- Status changes update task metadata.
- Completion writes a `task.completed` event.
- Reopening or unchecking behavior is defined and tested.

Test plan:

- Task Plugin tests for toggle command, metadata update, and event write.
- UI behavior test for checkbox interaction.

Dependencies:

- TASK-018.

### TASK-021: Implement Tag Plugin baseline

Source docs:

- `docs/product/05-built-in-plugins.md#15-tag-plugin`
- `docs/product/04-editor-and-workflows.md#12-markdown-first-编辑器`

Acceptance criteria:

- Built-in `TagPlugin` is registered via `BUILT_IN_PLUGINS` with plugin id `tag`.
- Manifest contributes inert Markdown syntax descriptor `tag.hashtag` for `#tag` and metadata field descriptor `tag.tags` (`namespace: "tag"`, `key: "tags"`, `valueType: "json"`).
- `tag.refresh-tags({ pageId })` explicitly scans saved structured `markdown.line` blocks and replaces page-scoped `tag.tags` with normalized lowercase ASCII slug `string[]` values, or `[]` when no tags remain.
- `tag.add-tag({ pageId, tag })` and `tag.remove-tag({ pageId, tag })` update page-scoped tag metadata through commands, enforcing the same conservative tag normalization and max 32 unique tags.
- `TagMetadataSlot` is registered as `page.header.metadata` contribution `tag.page-header-metadata.tags` with order `300`, displaying inert tags plus add/remove controls.
- `tag.create-filter({ tag })` stores a Tag Plugin-owned filter definition named `#tag` with query `metadata.tag.tags includes tag` and `viewType: "page.list"`; TASK-022 keeps this compatible with the generic `page.list` execution/rendering path.
- No automatic save-time scan, background indexer, rich inline token UI, autocomplete, global metadata bar, Tauri IPC, package/Cargo, native, filesystem, or permission surface is added.

Test plan:

- Plugin tests for manifest descriptors, command registration, strict payloads, ASCII tag extraction/normalization, stale metadata replacement, dedupe/order/limit behavior, metadata add/remove, explicit empty `[]`, and filter definition creation.
- UI tests for inert `TagMetadataSlot` display, accessible add/remove controls, command-bus payloads, invalid input feedback, and page-scoped command result handling.
- Native-surface guard proving no Tauri IPC, permission/capability, package/Cargo, Rust command, filesystem, or native surface changes.

Dependencies:

- TASK-016, TASK-008.

### TASK-022: Implement All Tasks and Today filters

Source docs:

- `docs/development/01-data-roadmap-and-mvp.md#phase-3task-plugin`
- `docs/product/05-built-in-plugins.md#23-filter-plugin`

Acceptance criteria:

- Core exports generic data-only `executeFilterQuery` for current pages/metadata without store mutation or plugin execution.
- All Tasks fixed filter `task.filter.all-tasks` lists task-enabled pages with `metadata.task.enabled eq true`, includes done tasks, uses `viewType: "page.list"`, and excludes archived pages through execution/listing behavior.
- Today fixed filter `task.filter.today` uses `metadata.task.enabled eq true`, `metadata.task.status neq "done"`, and scheduled/due relative-today date metadata with `valueType: "date"` and local `YYYY-MM-DD` strings.
- Task Plugin declares current task metadata fields, owns the default filters, registers `task.page-list` with type `page.list`, and contributes generic empty-state copy on `filter.empty_state`.
- `page.list` remains canonical so TASK-021 Tag Plugin saved filters continue to execute/render.
- Core remains business-agnostic; owner-sensitive metadata filtering is driven by explicit `metadataOwnerReservations` and Plugin Host manifest-derived reservations.
- Out of scope: save-time task scanning/indexing, date picker, `@date` parser, `task.set_due` / `task.set-due`, Overdue/Done filters, JS filters, global saved-filter navigation, app-shell filter route, Event/plugin-index `within` execution, native/Tauri/package/Rust changes, persistence rewiring, and release packaging.

Test plan:

- Filter engine tests for task/tag-compatible metadata queries, relative Today, owner reservations, fail-closed malformed values/types/unsafe fields/cycles/over-depth, and deferred `within` semantics.
- UI tests for `page.list` view lookup by `viewType`, inert page title rendering, generic `filter.empty_state` slot rendering, Task manifest metadata fields, default filter idempotency, and native-surface guard.

Dependencies:

- TASK-006, TASK-018, TASK-021.

### TASK-023: Implement Metadata UI Plugin

Source docs:

- `docs/product/04-editor-and-workflows.md#14-metadata-图形化展示`
- `docs/development/02-implementation-roadmap-and-constraints.md#phase-4metadata-ui`
- `docs/product/06-view-slots.md#252-页面插槽`

Acceptance criteria:

- Built-in `metadata-ui` plugin exports reusable `MetadataBar`.
- `MetadataBar` composes `page.header.metadata` slot contributions in SlotRegistry order.
- Task, Tag, and Timer fields contribute plugin-owned UI through the metadata slot.
- Existing Tag add/remove controls keep updating metadata through Tag commands/services.
- Task fields are read-only in TASK-023; Timer reserves the Start contribution that TASK-024 later enables.
- Manifest `metadataFields` remain inert descriptors/reservation inputs, not executable renderer/editor declarations.
- Metadata UI remains plugin-driven.

Out of scope for TASK-023:

- Production app-shell/editor default mounting.
- Full metadata renderer/editor registry.
- Date picker, estimate editor, and full tag picker polish.
- Timer lifecycle runtime and `timer.start` / stop / pause / resume / switch commands remain TASK-024 scope.
- Save-time scanning/indexing, native/Tauri/Rust/package changes, and release packaging.

Test plan:

- Component tests for metadata bar rendering, slot ordering, and Tag command editing.
- Boundary tests for active Plugin Host ownership data, descriptor/valueType trust, safe namespace/key handling, prototype-safe values, scoped command execution, inert text rendering, and no native/Tauri/package surface changes.

Dependencies:

- TASK-008, TASK-018, TASK-021.

### TASK-024: Implement Timer Plugin start/stop/pause/resume/switch

Source docs:

- `docs/product/05-built-in-plugins.md#18-timer-plugin`
- `docs/architecture/05-plugin-implementations.md#11-timer-plugin-代码架构`
- `docs/architecture/07-runtime-flows.md#186-用户点击-start`

Acceptance criteria:

- Timer Plugin registers `timer.start`, `timer.stop`, `timer.pause`, `timer.resume`, and `timer.switch`.
- Canonical timer events use `namespace: "timer"` and types `started`, `paused`, `resumed`, and `stopped`.
- `timer.started` event payload uses `startAt`; active timer DTOs may expose `startedAt`.
- One global active timer is visible through `timer.global-active-bar` on `global.floating`.
- Active timer state is Timer Plugin-owned, registration-scoped, in-memory runtime state, not Core-owned/native/persistent/schema-backed state.
- The `page.header.metadata` Timer Start control is enabled and executes `timer.start` through the scoped command executor.
- Starting a timer associates it with a page/task; if another timer is active, `timer.start` stops the previous timer, appends `timer.stopped`, starts the new timer, appends `timer.started`, and returns `{ activeTimer, stoppedTimer }`.
- `timer.pause`, `timer.resume`, and `timer.stop` use exact empty payloads; exact null-prototype empty payloads are allowed, but caller-owned/non-empty/prototype/accessor/symbol/non-enumerable unsafe payloads are rejected.
- `timer.switch` stops previous then starts next, supports no-active, paused, and same-page cases, and preserves active state/events when the target page is missing.
- Command results are narrow DTOs.
- This TASK-024 acceptance captured the historical pre-segment branch behavior. TASK-025 updates current Timer finalization by adding `createdSegment` results and `time_segment_created` events for finalized active timers.

Out of scope for TASK-024:

- Time Segment creation, note pages, total tracked metadata, timeline views, Calendar/Stats integration, native persistence, schema changes, Tauri/package/Rust changes, production fake-clock/global timer monkeypatches, eval, and string timer handlers.

Test plan:

- Timer Plugin unit/integration tests for state transitions.
- UI tests for active timer bar.
- Boundary tests for payload exactness, scoped metadata Start execution, event payload shape, active timer registration scoping, no TASK-025 side effects, no native surface changes, and no production fake-clock/eval/string-handler behavior.

Dependencies:

- TASK-023.

### TASK-025: Implement Time Segment and Time Segment Note

Source docs:

- `docs/product/05-built-in-plugins.md#183-time-segment`
- `docs/product/04-editor-and-workflows.md#264-计时`
- `docs/development/01-data-roadmap-and-mvp.md#29-mvp-必须打通的闭环`

Acceptance criteria:

- Timer finalization paths (`timer.stop`, active `timer.start`, and active `timer.switch`) append `namespace: "timer"`, `type: "time_segment_created"` event records.
- `timer.stopped` remains before segment creation where a timer is finalized.
- Time Segment payloads are camelCase records with `segmentId`, `pageId`, `startAt`, `endAt`, `durationSeconds`, and `source: "timer"`; absent optional fields are omitted and paused duration is excluded.
- `timer.add-note({ segmentId, markdown })` creates or updates Markdown Page notes for stopped segments, returns `{ notePageId }`, and appends `namespace: "timer"`, `type: "time_segment_note_added"` without mutating the original segment event.
- `timer.page-timeline.segments` on `page.timeline` renders current-page Timer-owned segments and note text inertly, with accessible Add Note / Edit Note UI that saves through `timer.add-note`.
- MetadataBar command execution requires owner-aware `MetadataBarCommandRegistry` descriptor lookup and fails closed without lookup; slot UI still receives only a narrow `execute()` facade.
- PluginHost's internal scoped command executor authorizes by registered command descriptor owner, not command ID prefix.
- Metadata totals, Calendar app-shell feed/routing, Timer-to-Stats feed normalization, trusted/persistent ML feed integration, native persistence/schema/Tauri/package/Rust changes, Recently Worked / Unnoted Sessions saved filters, manual segment editing, calendar drag/drop, and app-shell broad mounting remain deferred.
- Known residual P2: hidden `Symbol.for("mirabilis.internal.pluginScopedCommandExecutor")` remains globally discoverable and duplicated between PluginHost and Timer; descriptor-owner checks protect execution, but a future API cleanup should replace it.

Test plan:

- Timer Plugin tests for segment event payloads.
- UI tests for stop + note flow, page timeline Add/Edit Note controls, inert note rendering, wrong-owner/malformed note-link filtering, and command ownership boundaries.

Dependencies:

- TASK-024.

### TASK-026: Implement Calendar Plugin baseline

Source docs:

- `docs/product/05-built-in-plugins.md#19-calendar-plugin`
- `docs/development/02-implementation-roadmap-and-constraints.md#phase-6calendar-plugin`
- `docs/architecture/07-runtime-flows.md#189-caller-opens-calendar-dayweek`
- `docs/testing/strategy.md#task-026-calendar-plugin-baseline-guidance`

Acceptance criteria:

- Built-in Calendar Plugin registers plugin id `calendar`, views `calendar.day` and `calendar.week`, and command `calendar.open-time-segment`.
- Calendar views accept explicit normalized `{ kind: "calendar.time-segments" }` DTO input supplied by a caller/view host; Calendar does not read Timer-owned events directly through the plugin-facing event facade in this slice.
- DTOs carry Timer segment provenance: `source: "timer"` plus provenance `{ eventPageId, namespace: "timer", sourcePluginId: "timer", type: "time_segment_created" }`.
- Day/week views render normalized Timer segments as accessible calendar blocks with UTC time ranges and interval-overlap visibility for carryover segments.
- Clicking a block executes `calendar.open-time-segment({ segmentId, pageId })` and renders read-only inert detail text.
- DTO and command validation fails closed for malformed, wrong-owner, extra-field, accessor, symbol, prototype-carried, non-enumerable, blank, non-string, invalid-date, end-before-start, and non-positive/non-finite-duration inputs where applicable.
- `calendar.open-time-segment` validation is runtime/view lifecycle scoped and does not leak across runtimes or survive unmount.
- Manual segment creation/editing, `calendar.month`, snake_case aliases, app-shell route mounting/navigation, drag/drop, broad cross-plugin event query/read facade, Timer metadata totals, Stats/ML/Habit/Task scheduled feeds, external calendar sync, native/Tauri/package/Rust/schema changes, strict UTC/duration hardening, and stale detail clearing are explicitly deferred.

Test plan:

- Calendar view tests for registration, normalized DTO rendering, inert text, UTC day/week ranges, deterministic current-date behavior, interval-overlap carryover segments, and click-to-detail behavior.
- Command/DTO hardening tests for fail-closed validation and runtime-scoped known segment validation.
- Static boundary tests for no Timer internals, raw runtime/store/registry/pluginHost, NativeBridge/Tauri, HTML injection, package/native/Tauri/Rust/schema diff, snake_case aliases, or manual segment commands.
- Timer/calendar integration-style test that normalizes public Timer `time_segment_created` events in the test harness before rendering Calendar.

Dependencies:

- TASK-025.

### TASK-027: Implement Habit and Heatmap plugins

Source docs:

- `docs/product/05-built-in-plugins.md#17-habit-plugin`
- `docs/architecture/05-plugin-implementations.md#11-habit--heatmap-插件架构`

Acceptance criteria:

- `#habit` or habit metadata marks habit pages.
- Habit completion writes habit events.
- Today Habits and Habits filters work.
- Heatmap view renders habit completion events.

Test plan:

- Habit Plugin tests for metadata and completion events.
- Heatmap view component tests.

Dependencies:

- TASK-021, TASK-026.

### TASK-028: Implement Stats and Chart plugins

Source docs:

- `docs/product/05-built-in-plugins.md#20-stats-plugin-与-chart-plugin`
- `docs/architecture/05-plugin-implementations.md#13-stats--chart--ml-插件架构`

Acceptance criteria:

- Stats Plugin can aggregate time by tag, time by page, estimate vs actual, habit completion, task switching, and unnoted sessions.
- Chart Plugin registers chart views for supported data shapes.
- Chart views are plugin-owned and not hard-coded in Core.
- Empty and loading states are handled.

Test plan:

- Aggregation tests with event/metadata fixtures.
- Chart view component tests.

Dependencies:

- TASK-025, TASK-027.

### TASK-029: Implement Quick Capture and Search plugins

Source docs:

- `docs/product/05-built-in-plugins.md#24-quick-capture-plugin`
- `docs/development/01-data-roadmap-and-mvp.md#30-最终系统形态`

Acceptance criteria:

- Quick Capture creates or appends to an Inbox page.
- Captured Markdown can include task and tag syntax that existing plugins process through explicit public-command handoff.
- Search can query page titles and body text at baseline through transient on-demand scanning.
- Desktop entry points are documented and reviewed for Tauri permission impact; native/global shortcut implementation remains deferred in this slice.

Test plan:

- Plugin tests for capture-to-inbox.
- Search query tests for bounded on-demand title/body scanning, caps, literal matching, archived-page exclusion, and result view rendering.
- Security review for desktop/native entry points.

Dependencies:

- TASK-018, TASK-021.

### TASK-030: Implement ML Plugin baseline predictions

Source docs:

- `docs/product/05-built-in-plugins.md#21-machine-learning-plugin`
- `docs/architecture/05-plugin-implementations.md#134-machine-learning-plugin`

Acceptance criteria:

- Built-in TypeScript-only `ml` plugin is registered with canonical descriptors for `ml.predict-remaining-time`, `ml.run-prediction`, `ml.remaining-time-prediction-input`, `ml.remaining-time-prediction`, `ml.prediction-panel`, `ml.page-sidebar.prediction-panel`, `ml.predictedRemainingTime`, `ml.predictionConfidence`, and `ml.prediction-generated`.
- `ml.predict-remaining-time` remains an inert manifest algorithm descriptor; `ml.run-prediction` is the Command Registry runtime entry and there is no executable AlgorithmRegistry/runtime algorithm handler in this task.
- ML feature building consumes exact bounded caller-provided page/metadata/event projections only, without importing or reading sibling plugin private stores/facades.
- Remaining-time prediction returns a deterministic baseline DTO with documented limitations/confidence and does not persist ML metadata/events from caller-provided projections.
- Prediction panel renders the validated DTO through both the registered view and sidebar slot, failing closed/inertly for malformed or wrong-kind data.
- No package/native/Tauri/Rust/schema/capability, network, filesystem, worker, model storage, training, or background refresh changes.

Test plan:

- Built-in registration and stale-id absence tests.
- Command Registry `ml.run-prediction` contract tests with fixed projection fixtures and deterministic fallback branches.
- Hostile/bounded projection validation and no durable ML write tests.
- UI tests for inert/fail-closed `ml.prediction-panel` view and `ml.page-sidebar.prediction-panel` slot rendering.
- Static guards for Core isolation, sibling/private imports, execution/rendering sinks, and package/native/Tauri/Rust/schema/capability diffs.

Dependencies:

- TASK-028.

### TASK-031: Implement AI Plugin provider abstraction

Source docs:

- `docs/product/05-built-in-plugins.md#22-ai-plugin`
- `docs/development/02-implementation-roadmap-and-constraints.md#phase-10ai-plugin`
- `docs/architecture/05-plugin-implementations.md#14-ai-plugin-架构`

Acceptance criteria:

- Built-in TypeScript-only `ai` plugin is registered through `BUILT_IN_PLUGINS` with canonical kebab-case commands `ai.cleanup-inbox`, `ai.turn-text-into-task`, `ai.suggest-tags`, `ai.suggest-due-date`, `ai.generate-subtasks`, `ai.generate-filter`, `ai.summarize-time-notes`, `ai.generate-weekly-review`, and `ai.explain-prediction`; stale underscore ids are not aliases.
- AI contributes `ai.suggestion-panel` and `ai.review-panel` views, metadata descriptors `ai.summary`, `ai.suggestedTags`, `ai.suggestedEstimate`, event descriptors `ai.suggestion-generated`, `ai.summary-generated`, and inert settings descriptor `ai.provider-settings`.
- Provider abstraction is owned under `src/plugins/ai/**`, uses provider id `openai`, defaults model guidance to `gpt-5.5`, and keeps OpenAI/provider/model/prompt behavior out of Core.
- Provider requests use Responses-style shape with `instructions`, string `input`, `store: false`, and `text.format` strict `json_schema` using the supported schema subset; runtime validators enforce bounds, safe text/JSON, exact DTOs, and generated-filter field/operator allowlists separately.
- Raw Responses normalization accepts completed payloads with `error: null` and `incomplete_details: null`, parses top-level `output_text` and message output text content, and fails closed/redacted for refusals, incomplete/error/invalid responses, invalid JSON, provider failures, and unavailable transport.
- Provider/settings execution is mocked or injected in tests. No live OpenAI calls, OpenAI SDK/package changes, raw network APIs, native/Tauri/Rust/schema/capability changes, keychain, or secret storage are introduced.
- Provider settings are represented only as AI-plugin-owned injectable runtime/test settings plus the inert `ai.provider-settings` descriptor. Persistent plugin settings, settings UI, secret storage/keychain, native HTTP transport, and live provider execution are deferred.
- Commands consume exact bounded caller-provided projections and return advisory DTOs only. They do not mutate pages, metadata, events, filters, settings, sibling plugin data, or durable AI metadata/events.
- `ai.suggestion-panel` and `ai.review-panel` render inert accessible loading/unavailable states and fail closed for unsafe data/error props.
- Secrets and provider settings are not committed, logged, included in provider request input, or exposed through production AI public exports.

Test plan:

- Built-in registration tests for canonical command/view/metadata/event/settings descriptors and stale-id absence.
- Real Command Registry tests for all nine AI commands, Responses-style provider request shaping, default `gpt-5.5`, `store: false`, strict schema subset, advisory result DTOs, and no runtime store mutations.
- Exact bounded input validation tests for malformed, extra-field, hostile, accessor/prototype-shaped, oversized, forbidden secret/provider override, and post-validation mutation cases.
- Mocked provider/transport tests for unconfigured provider, provider failures, raw Responses success paths, refusals, incomplete/error/invalid responses, invalid JSON, null outputs, redaction, and no live calls.
- Provider output validation tests for wrong-kind, oversized, unsafe HTML/URL/SQL/prompt-injection text, nested secret/provider-shaped keys, unsupported generated-filter operators, and accessor non-execution.
- UI tests for inert/fail-closed `ai.suggestion-panel` and `ai.review-panel`.
- Static guards for Core isolation, sibling/private imports, raw runtime/store/registry/PluginHost/NativeBridge/Tauri imports, HTML/Markdown/code execution sinks, storage/network/native/package sinks, real-looking secrets, and package/native/Tauri/Rust/schema/capability diffs.

Dependencies:

- TASK-030.

Docs to verify before implementation:

- Current OpenAI API docs and model guidance.

Known residual/deferred after TASK-031:

- Persistent settings/secret storage/settings UI/native HTTP/live provider execution.
- Durable AI metadata/event writes and suggestion acceptance workflows.
- Raw Responses missing-status stricter parsing.
- Exact preservation of public result wording around `persist*`.
- `ai.generate-filter` parity with the broader Core filter executor, including `neq` / `exists` semantics.

### TASK-032: Implement Sync Plugin skeleton

Source docs:

- `docs/development/01-data-roadmap-and-mvp.md#phase-11sync-plugin`
- `docs/architecture/01-overview-and-monorepo.md#11-分层结构`

Acceptance criteria:

- Sync Plugin defines syncable units for Markdown Page, Metadata, Event, Filter, and Plugin Settings.
- Local plugin indexes are treated as rebuildable.
- Conflict strategy is documented before full implementation.
- No network sync is enabled without explicit settings and security review.

Test plan:

- Unit tests for serialization and rebuildable index assumptions.
- Docs review for conflict model.

Dependencies:

- TASK-013.

Delivered/deferred scope after TASK-032:

- Built-in Sync Plugin id is `sync`; it registers no runtime commands, views, slots, settings panels, indexers, algorithms, mobile toolbar items, or transport.
- `src/plugins/sync/**` exports schema version `1` syncable unit descriptors and serializers for Markdown Page, Metadata, Event, Filter, and Plugin Settings DTO snapshots.
- Plugin Settings are DTO snapshots only. Top-level and nested secret/auth/credential/remote-endpoint-like keys are rejected; future settings sync should use explicit allowlists and keychain separation. No persistent plugin settings, settings UI, Core settings facade, secret storage/keychain, remote endpoint settings, or sync settings panel is added.
- Local plugin indexes are rebuildable derived data and are excluded from durable sync payloads; no durable `sync.plugin-index` unit exists.
- Conflict policy: mutable units require manual resolution; event units are append-only union with identical duplicate dedupe and same-id/different-content manual conflict.
- The conflict helper strictly validates event DTOs: event units and `syncKey` must be plain records with exact descriptor-safe keys, getters are not invoked, `snapshot.id` must equal `syncKey.id`, and stale, mismatched, non-plain, malformed, wrong-schema, extra-key, or malformed-array event units are rejected.
- Tombstones, deletes, conflict UI, schema-backed sync state, background jobs, network/native sync transport, package/Cargo/Rust changes, Tauri permissions/capabilities, and live sync execution remain deferred.

### TASK-033: Add release packaging and local full gate

Source docs:

- `docs/testing/strategy.md`
- `docs/development/02-implementation-roadmap-and-constraints.md#21-最终代码架构总结`

Acceptance criteria:

- `bun run check:full` runs quick checks and Tauri build.
- Packaging changes are documented.
- `release_checker` can verify local readiness without GitHub CI.
- Version/changelog expectations are clear.
- CSP scope is explicit: TASK-033 leaves the pre-existing `app.security.csp: null` unchanged, and CSP hardening remains future security-review work.

Delivered/deferred scope after TASK-033:

- Delivered local `bun run check:full` release gate runs `bun run check:quick` first, then unattended `bun run tauri build --ci --bundles deb,rpm`.
- Delivered local Linux `deb` and `rpm` artifact validation; AppImage remains explicitly deferred to controlled builder validation before support can be claimed.
- Version expectations are synchronized across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`; root `CHANGELOG.md` is the release notes/changelog surface.
- `release_checker` local-readiness review is hardened for local verification without GitHub CI, including release gate, packaging scope, version/changelog, AppImage deferral, and CSP-null checks.
- Cargo package metadata now includes a description and removes the deprecated `authors` field.
- Residual CSP scope remains explicit: TASK-033 leaves `app.security.csp: null` unchanged; public-release CSP hardening remains future security-review work.
- Deferred scope: AppImage controlled-builder validation, public-release CSP hardening, updater/signing/publishing, GitHub CI infrastructure, and native behavior, capability/permission, IPC contract, or dependency changes.

Test plan:

- `bun run check:full`
- `release_checker` review.

Dependencies:

- TASK-001.

### TASK-034: Design MUI Workspace And Audit Unfinished UI

Source docs:

- `docs/product/01-vision-and-core.md`
- `docs/product/03-plugin-platform.md`
- `docs/product/04-editor-and-workflows.md`
- `docs/product/05-built-in-plugins.md`
- `docs/product/06-view-slots.md`
- `docs/architecture/03-plugin-api-and-host.md`
- `docs/architecture/04-slots-editor-task.md`
- `docs/architecture/07-runtime-flows.md`
- `docs/development/01-data-roadmap-and-mvp.md`
- `docs/development/02-implementation-roadmap-and-constraints.md`
- `docs/testing/strategy.md`

Acceptance criteria:

- Add `docs/product/07-user-interface-design.md` as the complete UI design and audit document for the MUI workspace.
- The design doc diagnoses the current startup-card/product-workspace gap.
- The design doc inventories unfinished UI/workflow groups and separates "MUI UI framework now" from "future native/backend/security" scope.
- The design doc specifies MUI information architecture: `ThemeProvider`, `CssBaseline`, top `AppBar`, left `Drawer`, central `main` `ViewHost`, optional right context panel, `Portal` floating slots, and `Dialog` overlays.
- The design doc includes component map, theme/tokens, visual rules, interaction flows, responsive behavior, loading/empty/error states, accessibility rules, testing strategy, architecture/security constraints, and package/framework notes with official source links.
- `docs/product/README.md` links the new UI design doc.
- TASK-035 through TASK-045 are split so implementation starts with MUI substrate and first app shell frame.
- MUI implementation notes call out `@mui/material`, `@emotion/react`, `@emotion/styled`, `@mui/icons-material`, React 19 peers, local/system fonts, and MUI path imports.
- UI test guidance calls for RTL plus `@testing-library/user-event` realistic typing/clicking/keyboard flows using accessible role/name queries and visible outcomes.
- No production code, tests, package/Cargo/Tauri files, lockfiles, or git metadata are edited.

Test plan:

- `git diff --check`

Dependencies:

- TASK-033.

Docs to verify before implementation:

- MUI installation, theming, `CssBaseline`, icons, path-import, `AppBar`, `Drawer`, `Dialog`, and `Portal` docs.
- React Testing Library query guidance and `@testing-library/user-event` setup guidance.
- WAI-ARIA dialog pattern guidance.

### TASK-035: Add MUI Substrate And First Shell Frame

Source docs:

- `docs/product/07-user-interface-design.md`
- `docs/architecture/03-plugin-api-and-host.md#55-react-runtime-provider-boundary`
- `docs/architecture/07-runtime-flows.md#17-启动流程`
- `docs/testing/strategy.md#task-015-app-bootstrap-and-runtime-provider-guidance`
- `src/App.tsx`
- `src/providers/*`
- `src/bootstrap/create-app-runtime.ts`

Acceptance criteria:

- Add MUI dependencies through the Bun workflow: `@mui/material`, `@emotion/react`, `@emotion/styled`, and `@mui/icons-material`.
- Wrap the app in a MUI `ThemeProvider` and `CssBaseline` with local/system font tokens and no Google/CDN font dependency.
- Replace the centered startup/status card with a dense work-focused MUI shell frame using top `AppBar`, left `Drawer`, central `main`, and placeholder route regions.
- Ready, loading, and startup failure states remain visible and redacted; failure must not leak raw errors, paths, SQL, tokens, provider details, or plugin internals.
- `useRuntime()` remains the public `{ app }` facade; full runtime handles are not exposed through the public provider.
- Introduce or document a trusted shell-internal runtime composition channel if the shell needs full runtime handles; plugin-rendered descendants must not receive it.
- Use path imports for MUI components and icons.
- No Tauri/native/Rust/capability/permission/IPC/schema/release behavior changes are added.

Delivered/deferred note for the TASK-035 branch:

- Delivered: the MUI quartet, `ThemeProvider`, `CssBaseline`, top `AppBar`, left `Drawer`, central `main`, placeholder Home/Inbox/Today/All Tasks/Reports routes, and top-bar placeholder tools for Command, Search, Quick Capture, and Settings.
- Deferred: no full trusted runtime channel was introduced; `ViewHost`/`SlotHost`, editor mounting, dialogs, `Portal` floating slots, responsive polish, and real route data remain TASK-036+.
- Security/native scope: TASK-035 adds no IPC, Tauri/native, Rust, capability, permission, schema, release, or broader security surface change.

Test plan:

- React Testing Library shell tests using `userEvent.setup()` with awaited `user.click` / `user.keyboard` for drawer toggle and top-bar actions.
- Role/name queries for `banner`, `navigation`, `main`, buttons, and visible loading/failure states.
- Boundary tests that `useRuntime()` exposes only app info and the shell does not import Tauri/native or business-plugin internals.
- Package/native-surface guard allowing only the reviewed MUI package/lockfile dependency change for this task.

Dependencies:

- TASK-034.

Docs to verify before implementation:

- MUI installation and React peer dependency docs.
- MUI theming, `CssBaseline`, `AppBar`, `Drawer`, icons, and path-import docs.
- Current React Testing Library and `@testing-library/user-event` setup docs.

### TASK-036: Add Generic ViewHost And SlotHost

Source docs:

- `docs/product/07-user-interface-design.md`
- `docs/product/06-view-slots.md`
- `docs/architecture/03-plugin-api-and-host.md`
- `docs/architecture/04-slots-editor-task.md`
- `docs/architecture/07-runtime-flows.md`
- `docs/testing/strategy.md`

Acceptance criteria:

- Add trusted app-shell `ViewHost` for rendering View Registry entries by id/type with explicit accepted data.
- Add trusted app-shell `SlotHost` for rendering Slot Registry contributions by slot name in registry order.
- Hosts pass only narrow controlled props/data and never pass full runtime, Core stores, registries, Plugin Host, NativeBridge, raw invoke, filesystem, path, provider settings, or secrets to plugin-rendered UI.
- Hosts render safe loading, empty, missing, wrong-data, and error states.
- `ViewHost` fails closed for missing view descriptors, mismatched accepted data, thrown render errors, malformed DTOs, and plugin unavailable states.
- `SlotHost` evaluates contribution conditions only with controlled props and fails closed for invalid contributions.
- No direct business-plugin implementation imports, native/Tauri/Rust/package/capability changes, or persistence/schema work are added.

Delivered/deferred note for the TASK-036 branch:

- Delivered: generic app-shell `ViewHost`, `SlotHost`, `PluginRenderBoundary`, and host exports for registry-owned views and slots; exact-id and unambiguous-type view resolution; explicit accepted-data checks; safe loading, empty, missing, wrong-data, unavailable, thrown, and error states; slot registry ordering and per-contribution isolation; controlled props/data cloning; descriptor-backed `host.action` wrappers for user interactions; prototype-key fail-closed behavior; native/secret alias redaction; recursion budgets; proxy/trap fail-closed behavior; and static guards for no package/native/Tauri/Rust/capability/release drift.
- Delivered later by TASK-037: Home editor route mounting plus Home-scoped command and page bridge adapters.
- Deferred: route data projections outside Home, lazy/Suspense host behavior, actual metadata/timer/timeline/global slot placement, dialogs, `Portal` floating slots, responsive polish, and broader command/page facade adapters remain TASK-038+ or later.
- Security/native scope: TASK-036 adds no package, lockfile, IPC, Tauri/native, Rust, capability, permission, schema, release, persistence, or broader security surface change.

Test plan:

- RTL component tests for successful view render, missing view, wrong `kind`, thrown view, loading, empty, and error states.
- RTL slot tests for ordering, conditional rendering, controlled props, and plugin failure isolation.
- `userEvent.setup()` tests where rendered slot controls are clicked and visible outcomes are asserted, not internals.
- Static boundary tests for no full-runtime prop leakage and no native/business-plugin private imports.

Dependencies:

- TASK-035.

Docs to verify before implementation:

- Local View Registry and Slot Registry docs.
- Current React error-boundary guidance if an error boundary is introduced.
- Current React Testing Library and user-event guidance.

### TASK-037: Mount Home Workspace Editor

Source docs:

- `docs/product/07-user-interface-design.md`
- `docs/product/04-editor-and-workflows.md`
- `docs/architecture/04-slots-editor-task.md#8-markdown-editor-plugin`
- `docs/architecture/07-runtime-flows.md#181-用户输入任务`
- `docs/testing/strategy.md#task-016-markdown-editor-plugin-shell-guidance`
- `docs/testing/strategy.md#task-019-task-navigation-and-infinite-nesting-guidance`
- `docs/testing/strategy.md#task-020-checkbox-toggle-and-task-events-guidance`

Acceptance criteria:

- The ready app creates or selects a session Home Markdown Page when no page route is active.
- The central workspace renders the registered `page.editor` view through `ViewHost`, not by directly importing the Markdown editor component into App Shell.
- Typing, toolbar snippet buttons, save, task-title open, and checkbox toggle work for the selected session page.
- Page switches ignore stale async editor, save, task-open, and checkbox-toggle results.
- The first screen is the Markdown workspace, not a landing page, hero, or startup card.
- Empty page state remains editable.
- No metadata/timeline/sidebar/search/capture/calendar/report/ML/AI/settings/sync route scope is added beyond shell placeholders.
- No native/Tauri/Rust/package/capability changes are added.

Delivered/deferred note for the TASK-037 branch:

- Delivered by branch: the ready Home route creates/selects one session Home Markdown Page and renders registered `markdown.page-editor` / `page.editor` through `ViewHost`; hosted editor props stay narrow and do not expose raw runtime/native/store/registry/command/page facade handles; the provider-scoped Markdown workspace bridge exposes only current-page bounded load/save, inert editor extension collection, exact allowlist wrappers for `markdown.insert-text`, `task.open-task-page`, and `task.toggle-status`, and guarded page-open navigation; typing, toolbar snippets, save, task-title open, checkbox toggle, stale insert/open guards, foreign load/save/openPage rejection, and non-Home placeholder preservation are covered.
- Security/correctness hardening delivered by branch: no raw runtime render-prop/public provider exposure, no plugin-to-shell production import, hosted `pages.load/save` remain current-page scoped, hosted `openPage` cannot self-authorize foreign pages, and command-returned page opens are one-shot authorizations bound to the source page generation.
- Deferred: sidebar page/filter navigation, metadata/timer/timeline slot placement, command/search/capture dialogs, Calendar/Reports routes, ML/AI panels, Settings/Sync placeholders, responsive/accessibility polish, lazy/Suspense host behavior, `Portal` floating slots, durable Home identity, broader route data projections, persistence/native/filesystem changes, and release surfaces remain TASK-038+ or later.

Test plan:

- RTL tests with `userEvent.setup()` for typing Markdown into the editor, clicking toolbar snippet buttons, saving, clicking task-title buttons, and clicking task checkboxes.
- Accessible role/name queries for editor textbox, toolbar buttons, task-title buttons, checkboxes, save state, and main workspace.
- Visible outcome assertions for changed editor text, saved status, opened page route, and checked/unchecked status.
- Existing Markdown editor integration tests for loaded `pageId` / `pageFacade` path.
- App-shell boundary tests for no direct editor/business-plugin implementation import in shell.

Dependencies:

- TASK-036.
- TASK-016.
- TASK-017.
- TASK-019.
- TASK-020.

Docs to verify before implementation:

- Local TASK-016 through TASK-020 testing guidance.
- Current RTL async rendering and user-event typing/clicking guidance.

### TASK-038: Add Sidebar Page And Saved-Filter Navigation

Source docs:

- `docs/product/07-user-interface-design.md`
- `docs/product/02-core-data-model.md`
- `docs/product/05-built-in-plugins.md`
- `docs/product/06-view-slots.md`
- `docs/architecture/07-runtime-flows.md#185-用户打开-all-tasks--today-filter-result`
- `docs/development/01-data-roadmap-and-mvp.md`

Acceptance criteria:

- Left MUI Drawer provides Home, Inbox, All Tasks, Today, recent pages, and plugin route groups where backing page/filter/view data exists in the current runtime.
- Selecting a page route changes the active workspace page and renders the editor through `ViewHost`.
- Selecting a saved filter executes the existing filter/query path and renders the registered `viewType` through `ViewHost`, including `task.page-list` for All Tasks and Today.
- Inbox navigation uses public Quick Capture page/filter semantics and does not hard-code Quick Capture internals beyond public filter/page data.
- Recent pages come from current page store state and remain scoped to the current session.
- Missing, empty, loading, and unavailable route states are visible, accessible, and non-leaky.
- No direct Task/Tag/Quick Capture private imports, native/Tauri/Rust/package/capability changes, or persistent navigation storage are added.

Test plan:

- RTL sidebar tests using `userEvent.setup()` and awaited `user.click` / `user.keyboard` for drawer open/close, page route selection, saved-filter selection, and keyboard navigation.
- Accessible role/name assertions for navigation, active route, Home, Inbox, All Tasks, Today, recent pages, empty states, and result lists.
- Filter executor and `page.list` view integration tests.
- Static boundary tests for no direct business-plugin/native imports.

Dependencies:

- TASK-037.
- TASK-022.
- TASK-029.

Docs to verify before implementation:

- Local filter/query and saved-filter docs.
- MUI Drawer/List docs.
- Current React Testing Library navigation and user-event keyboard guidance.

### TASK-039: Mount Metadata, Timer, And Timeline Slots

Source docs:

- `docs/product/07-user-interface-design.md`
- `docs/product/05-built-in-plugins.md#14-metadata-ui-plugin`
- `docs/product/06-view-slots.md`
- `docs/architecture/04-slots-editor-task.md#73-metadatabar--slot-rendering`
- `docs/architecture/07-runtime-flows.md#186-用户点击-start`
- `docs/testing/strategy.md#task-023-metadata-ui-plugin-guidance`
- `docs/testing/strategy.md#task-025-time-segment-and-note-guidance`

Acceptance criteria:

- Current page header mounts `page.header.metadata` through the existing Metadata UI path or `SlotHost` so Task, Tag, and Timer contributions are visible for the selected page.
- Current page content mounts `page.timeline` for Timer segment/note UI.
- App shell mounts `global.floating` through `Portal` so the active timer bar appears while a timer is active.
- Slot props are page-scoped and controlled; plugin controls execute mutations only through Command Registry or documented owner-scoped command facades.
- Empty, unavailable, pending, and plugin-failure states do not leak raw errors, paths, SQL, tokens, provider details, or full runtime handles.
- No direct Timer/Task/Tag business implementation imports, native/Tauri/Rust/package/capability changes, or new persistence/schema work are added.
- Timer totals, Recently Worked, Unnoted Sessions saved filters, manual segment editing, and Calendar/Stats feed integration remain deferred.

Test plan:

- RTL tests using `userEvent.setup()` for tag add/remove typing/clicking, Timer Start/Pause/Resume/Stop clicks, active floating bar controls, and timeline Add/Edit Note typing/saving.
- Accessible role/name queries for metadata region, tag controls, timer buttons, floating timer status, timeline region, note textbox, and Save Note button.
- Existing MetadataBar and Timer plugin tests.
- Static app-shell boundary tests for no direct business-plugin/native imports.

Dependencies:

- TASK-036.
- TASK-037.
- TASK-023.
- TASK-025.

Docs to verify before implementation:

- Local TASK-023 through TASK-025 guidance.
- MUI Portal docs.
- Current RTL accessible control and async update guidance.

### TASK-040: Add Command Palette And Quick Capture Dialog

Source docs:

- `docs/product/07-user-interface-design.md`
- `docs/product/03-plugin-platform.md`
- `docs/product/05-built-in-plugins.md#24-quick-capture-plugin`
- `docs/product/06-view-slots.md`
- `docs/architecture/03-plugin-api-and-host.md`
- `docs/architecture/07-runtime-flows.md#18-用户操作到代码流程`

Acceptance criteria:

- Top app-shell controls include command and capture entry points without replacing the Markdown workspace as the first screen.
- Command palette uses MUI `Dialog`, lists executable Command Registry descriptors with title/shortcut/context metadata, filters from typed input, and executes commands only through Command Registry.
- Quick Capture entry executes `quick-capture.open`, mounts the registered `quick-capture.modal` view or a shell-owned MUI dialog wrapper around it, and saves through `quick-capture.save` / `quick-capture.save-and-open`.
- Dialogs have accessible names, initial focus, Escape/cancel handling, focus return, save disabled states, pending states, and non-leaky errors.
- `save-and-open` navigates to the returned Inbox page through normal app-shell route state.
- Native/global shortcut, mobile toolbar mounting, background capture, automatic Task/Tag/AI cleanup, and persistence beyond current runtime remain deferred.
- No native/Tauri/Rust/package/capability changes are added.

Test plan:

- RTL command palette tests using `userEvent.setup()` for opening, typing filter text, keyboard selection with `user.keyboard`, clicking a command, execution through Command Registry, closing, and focus return.
- RTL Quick Capture tests using `user.type` and `user.click` for open, save, save-and-open, cancel, error, disabled, and Inbox navigation paths.
- Existing Quick Capture plugin tests and app-shell boundary tests.

Dependencies:

- TASK-038.
- TASK-029.

Docs to verify before implementation:

- MUI Dialog docs.
- WAI-ARIA modal dialog pattern.
- Current RTL and `@testing-library/user-event` keyboard/focus guidance.

### TASK-041: Add Search Overlay And Results Route

Source docs:

- `docs/product/07-user-interface-design.md`
- `docs/product/05-built-in-plugins.md#25-search-plugin`
- `docs/product/06-view-slots.md`
- `docs/architecture/05-plugin-implementations.md#search-plugin`
- `docs/architecture/07-runtime-flows.md`
- `docs/testing/strategy.md`

Acceptance criteria:

- Search entry opens an accessible MUI Dialog or overlay that executes `search.query` through Command Registry with bounded query input.
- Results render through the registered `search.results` view or a bounded route DTO and show loading, empty, result, and error states.
- Selecting a search result navigates to that page through normal app-shell page route state.
- Search route state stores only bounded result DTO data needed to render the route; it does not create a persistent index or log full page bodies.
- Command palette and search keyboard flows do not conflict.
- Persistent search indexing, search worker, SQLite FTS, native/global search shortcuts, and ranking beyond existing plugin behavior remain deferred.
- No native/Tauri/Rust/package/capability changes are added.

Test plan:

- RTL tests using `userEvent.setup()` for opening search, typing queries, keyboard submit, Escape/close, loading/empty/results/error states, clicking result rows, and result navigation.
- Accessible role/name queries for search textbox, dialog/overlay name, status, list/list items, and route content.
- Existing Search plugin command/view tests.
- Static no-native/no-indexer/package drift checks.

Dependencies:

- TASK-038.
- TASK-040.
- TASK-029.

Docs to verify before implementation:

- MUI Dialog/TextField/List docs.
- WAI-ARIA dialog or combobox guidance appropriate to the chosen pattern.
- Current RTL and user-event keyboard guidance.

### TASK-042: Add Calendar And Reporting Routes With Explicit Data Projections

Source docs:

- `docs/product/07-user-interface-design.md`
- `docs/product/05-built-in-plugins.md`
- `docs/product/06-view-slots.md`
- `docs/architecture/05-plugin-implementations.md`
- `docs/architecture/07-runtime-flows.md`
- `docs/development/01-data-roadmap-and-mvp.md`
- `docs/testing/strategy.md`

Acceptance criteria:

- Sidebar/plugin routes expose Calendar and Reports surfaces only through registered plugin views/commands.
- Calendar routes build explicit bounded `calendar.time-segments` projections from public current-runtime pages/events/metadata and mount `calendar.day` / `calendar.week` through `ViewHost`.
- Reporting routes build explicit bounded Stats input projections, execute `stats.run-aggregation` through Command Registry, and render Chart views through `ViewHost` when chart DTOs are available.
- Empty, partial-data, loading, and unavailable states are visible and non-leaky.
- Projection builders are app-shell owned integration code and do not import plugin private stores, sibling plugin internals, raw Core stores from plugin-rendered UI, or native/SQLite APIs.
- Broad cross-plugin query/feed facade, persistent indexes, Calendar drag/drop/manual segment editing, Stats dashboards beyond registered DTO views, charting dependency expansion, and native/schema changes remain deferred.

Test plan:

- Projection-builder unit tests for time segments, habit/task/tag/stat inputs, bounds, archived-page handling, malformed data, and wrong-owner data.
- RTL route tests using `userEvent.setup()` for Calendar day/week route selection, segment click-to-detail, Reports aggregation, chart rendering, empty/error states, and keyboard navigation.
- Existing Calendar, Habit/Heatmap, Stats, and Chart plugin tests.
- Static boundary tests for no sibling-private/native imports.

Dependencies:

- TASK-038.
- TASK-026.
- TASK-028.

Docs to verify before implementation:

- Local Calendar/Stats/Chart guidance in product, architecture, and testing docs.
- Current RTL route-like state and async UI testing guidance.

### TASK-043: Add ML And AI Context Panels

Source docs:

- `docs/product/07-user-interface-design.md`
- `docs/product/05-built-in-plugins.md`
- `docs/product/06-view-slots.md`
- `docs/architecture/03-plugin-api-and-host.md`
- `docs/architecture/05-plugin-implementations.md`
- `docs/architecture/07-runtime-flows.md`
- `docs/testing/strategy.md#task-030-ml-plugin-baseline-prediction-guidance`
- `docs/testing/strategy.md#task-031-ai-plugin-provider-abstraction-guidance`

Acceptance criteria:

- Optional right context panel can show current-page plugin panels without covering the Markdown workspace.
- ML panel builds exact bounded current-page projections, executes `ml.run-prediction` through Command Registry, and renders `ml.page-sidebar.prediction-panel` / `ml.prediction-panel` through `SlotHost` or `ViewHost`.
- AI panel renders `ai.suggestion-panel` and `ai.review-panel` with explicit caller-provided DTOs and can execute advisory AI commands with exact bounded projections.
- AI output remains advisory; no AI command mutates pages, metadata, events, filters, sibling plugin data, settings, or secrets from shell integration.
- Live provider execution, provider settings UI, secret/keychain storage, durable AI suggestion acceptance, and network/native execution remain deferred unless a later task explicitly adds them with security review.
- ML/AI panels fail closed for malformed, unavailable, or rejected data and do not expose full workspace data, full runtime handles, provider settings, raw errors, or secrets.
- No native/Tauri/Rust/package/capability changes are added.

Test plan:

- RTL context-panel tests using `userEvent.setup()` for open/close, tab/panel switching, ML prediction click/execution/rendering, AI advisory panel rendering, command error states, page-switch refresh, and keyboard focus behavior.
- Projection validation tests for ML/AI input builders.
- Existing ML and AI plugin tests plus static no-network/no-secret/no-native/no-private-import guards.

Dependencies:

- TASK-042.
- TASK-030.
- TASK-031.

Docs to verify before implementation:

- Local TASK-030 and TASK-031 guidance.
- Current OpenAI docs only if the task changes live provider/request behavior; otherwise keep provider execution mocked/injected.
- MUI Drawer/Tabs docs if used for the context panel.

### TASK-044: Add Settings And Sync Placeholders

Source docs:

- `docs/product/07-user-interface-design.md`
- `docs/product/03-plugin-platform.md`
- `docs/product/05-built-in-plugins.md`
- `docs/architecture/05-plugin-implementations.md#sync-plugin`
- `docs/architecture/07-runtime-flows.md#17-启动流程`
- `docs/testing/strategy.md#task-032-sync-plugin-skeleton-guidance`

Acceptance criteria:

- Settings route lists app/runtime information and plugin settings descriptors that currently exist, including inert `ai.provider-settings` and Sync skeleton status.
- Sync route or panel clearly shows Sync as a placeholder/skeleton: no runtime sync commands, transport, remote endpoint, conflict UI, background jobs, or settings persistence are enabled.
- Settings placeholders do not accept, store, render, or log API keys, tokens, credentials, remote endpoints, filesystem paths, or provider secrets.
- Disabled controls and explanatory states are accessible and visible without claiming unsupported behavior.
- Any settings action that exists must go through registered commands; no direct plugin private mutation is added.
- No Tauri/native/Rust/package/capability/permission/IPC/schema/keychain/network/release changes are added.

Test plan:

- RTL tests using `userEvent.setup()` for opening Settings/Sync routes, clicking disabled or placeholder controls, and verifying no secret input is present.
- Accessible role/name queries for settings route, sync status, disabled controls, alerts/status text, and navigation.
- Static no-secret/no-network/no-native/no-settings-persistence guards.
- Existing Sync skeleton tests where relevant.

Dependencies:

- TASK-038.
- TASK-043.
- TASK-032.

Docs to verify before implementation:

- Local Sync skeleton guidance.
- Local AI provider/settings deferred-scope docs.
- Current security guidance only if implementation proposes secrets, keychain, network, native, or persistent settings; otherwise keep the route inert.

### TASK-045: Responsive State And Accessibility Polish

Source docs:

- `docs/product/07-user-interface-design.md`
- `docs/product/04-editor-and-workflows.md`
- `docs/product/06-view-slots.md`
- `docs/architecture/07-runtime-flows.md`
- `docs/testing/strategy.md`

Acceptance criteria:

- Desktop and narrow layouts keep the Markdown workspace usable with sidebar, top controls, contextual panel, floating surfaces, dialogs, and route content adapting without incoherent overlap.
- Sidebar collapse/drawer behavior, command palette, search overlay, Quick Capture dialog, editor, metadata/timer/timeline slots, Calendar/Reports routes, ML/AI panels, and Settings/Sync placeholders are keyboard reachable with predictable focus return.
- Loading, empty, unavailable, and error states are consistent across workbench, routes, `ViewHost`, `SlotHost`, overlays, and contextual panels.
- State text does not leak raw errors, paths, SQL, tokens, provider details, secrets, or full runtime handles.
- App-shell landmarks, headings, labels, status regions, dialog semantics, focus management, and route navigation are accessible from the user's perspective.
- Visual polish remains dense and work-focused; no marketing landing-page UI, hero, decorative app sections, or decorative card-heavy surfaces are introduced in place of the workspace.
- No native/Tauri/Rust/package/capability changes are added.

Test plan:

- RTL accessibility tests using `userEvent.setup()` for landmarks, labels, keyboard flows, focus return, status/error states, dialog behavior, drawer collapse, and narrow-layout controls.
- Integration tests across page, filter, metadata/timer/timeline, command palette, Quick Capture, search, Calendar/Reports, ML/AI, Settings/Sync, `ViewHost`, `SlotHost`, and floating timer surfaces.
- Prefer role/name queries and visible outcome assertions; do not assert implementation internals.
- `bun run check:quick` as the expected local gate for this UI-only polish task.

Dependencies:

- TASK-035.
- TASK-036.
- TASK-037.
- TASK-038.
- TASK-039.
- TASK-040.
- TASK-041.
- TASK-042.
- TASK-043.
- TASK-044.

Docs to verify before implementation:

- Current WAI-ARIA Authoring Practices for dialog and navigation patterns.
- Current MUI responsive Drawer/Dialog guidance.
- Current React Testing Library and user-event guidance.
