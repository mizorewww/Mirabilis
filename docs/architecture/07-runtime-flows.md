# 启动流程与代码路径

描述 AppRuntime 创建流程，以及用户输入任务、打开任务页、Start/Stop 计时时的代码调用链。

## 17. 启动流程

```ts
async function createAppRuntime() {
  const nativeBridge = await createTauriNativeBridge();

  const storage = {
    persistence: "in-memory-core"
  };

  const stores = await createCoreStores();

  const registries = await createCoreRegistries();

  const services = await createCoreServices({
    stores,
    registries
  });

  const app = {
    version: appVersion,
    pluginApiVersion
  };

  const pluginHost = new PluginHost({
    services,
    registries,
    app
  });

  const runtime = {
    app,
    markdown: createMarkdownRuntimeFacade(pluginHost, {
      pages: createMarkdownPageRuntimeFacade(nativeBridge)
    }),
    stores,
    registries,
    services,
    pluginHost,
    ...services
  };

  await pluginHost.loadBuiltInPlugins(BUILT_IN_PLUGINS);

  await pluginHost.activateAll();

  return runtime;
}
```

当前实现顺序是：`createTauriNativeBridge()` -> storage facade `{ persistence: "in-memory-core" }` -> `createCoreStores()` -> `createCoreRegistries()` -> `createCoreServices()` -> `PluginHost` -> runtime object with `runtime.markdown` -> `loadBuiltInPlugins(BUILT_IN_PLUGINS)` -> `activateAll()`。

`storage.persistence = "in-memory-core"` 是诚实的能力标记，不表示 Core stores 已经接入 SQLite persistence。TASK-016/TASK-021 没有做 broad Core store-to-SQLite rewiring。

`BUILT_IN_PLUGINS` 在 TASK-027 后包含内置 `MarkdownEditorPlugin`、`MetadataUiPlugin`、`TaskPlugin`、`TagPlugin`、`TimerPlugin`、`CalendarPlugin`、`HabitPlugin` 和 `HeatmapPlugin`。Quick capture、search、stats、chart、ML、AI、sync 等其他具体业务内置插件仍属于后续插件任务。`loadBuiltInPlugins(BUILT_IN_PLUGINS)` 接收的是 App 启动时显式传入的插件对象，不表示文件系统发现、动态 import 或 native 插件加载。

`runtime.markdown.collectEditorExtensions()` 从 `pluginHost.listPlugins()` 暴露的 public plugin metadata 收集 active plugin manifest 的 inert `contributes.markdownSyntax` descriptor。`runtime.markdown.pages` 是 narrow NativeBridge page facade，只发出 allowlisted `core.pages.get` / `core.pages.update` DTO，不接受 raw SQL、SQL params、filesystem path 或 file DTO。

TASK-017 后，`runtime.markdown.pages.load()` 从 `core.pages.get` 读取 body，把结构化 `markdown.line` blocks 导出为 editor Markdown；仅对 TASK-016 旧的 exact one-node `markdown.text` body 做 load-only fallback。TASK-020 后，load result 在结构化 body 可用时也携带 `body`，让 loaded `pageId/pageFacade` 编辑器模式可以从真实 runtime page facade 渲染 task-title buttons 和 checkbox。`runtime.markdown.pages.save()` 把 editor Markdown 导入为结构化 body 并通过 `core.pages.update` 保存，导入时使用上一版结构化 document 作为上下文来保留稳定 block IDs；save result 也携带 saved structured body。新保存不写 legacy `markdown.text` body。

TASK-018 的 `task.resolve-task-block`、TASK-019 的 `task.open-task-page` 和 TASK-020 的 `task.toggle-status` 运行在当前 in-memory Core/plugin runtime 内：Command Registry 调用 Plugin Host 包装过的 Task Plugin handler，Plugin Host 为本次 command execution 创建 fresh `PluginContext`，handler 通过 plugin-facing transaction、page store、metadata store 和 event store 创建或复用任务页、写 metadata、绑定 source block、切换 source checkbox marker，并追加 task events。`task.open-task-page` 共享 source relation 行为并只返回 `{ pageId }`；`task.toggle-status` 接收 `{ sourcePageId, sourceBlockId }` 并返回 `{ pageId, status }`。这个流程不新增 NativeBridge/Tauri IPC、权限、filesystem 或 package/Rust surface。

TASK-021 的 `tag.refresh-tags`、`tag.add-tag`、`tag.remove-tag` 和 `tag.create-filter` 也运行在当前 in-memory Core/plugin runtime 内：Command Registry 调用 Plugin Host 包装过的 Tag Plugin handler，Plugin Host 为本次 command execution 创建 fresh `PluginContext`，handler 通过 plugin-facing transaction、metadata store 和 filter store 更新 `tag.tags` 或保存 filter definition。这个流程不新增 NativeBridge/Tauri IPC、权限、filesystem、package/Cargo 或 Rust surface。

TASK-024 的 `timer.start`、`timer.stop`、`timer.pause`、`timer.resume` 和 `timer.switch` 同样运行在当前 in-memory Core/plugin runtime 内。Timer Plugin 在 `register(ctx)` 中创建 registration-scoped active timer store；Command Registry 调用 Plugin Host 包装过的 Timer handler，handler 通过 plugin-facing transaction 读取 page、append timer lifecycle events，并更新 Timer Plugin-owned in-memory active state。这个流程不新增 NativeBridge/Tauri IPC、权限、filesystem、package/Cargo、Rust surface、persistence schema 或 Core-owned Timer state。

TASK-027 的 `habit.refresh-habit`、`habit.check-today`、`habit.uncheck-today` 和 `habit.set-frequency` 也运行在当前 in-memory Core/plugin runtime 内。Habit Plugin 通过 plugin-facing transaction 读取 page、写 Habit-owned metadata、append `namespace: "habit"` / `type: "checked" | "unchecked"` events，并 upsert Habits / Today Habits filters。Heatmap Plugin 在 register 阶段只注册 `heatmap.calendar` view，消费调用方传入的 `heatmap.date-series` DTO；它不读取 Habit events，不导入 Habit internals，也不新增 NativeBridge/Tauri IPC、权限、filesystem、package/Cargo、Rust surface 或 schema。

任何 bootstrap 阶段失败都会 reject startup。`loadBuiltInPlugins(BUILT_IN_PLUGINS)` 或 `activateAll()` 失败时，`createAppRuntime()` 不返回 ready runtime；React `RuntimeProvider` 显示通用启动失败 UI，不渲染原始错误、堆栈、SQL、路径或 token。

---

## 18. 用户操作到代码流程

### 18.1 用户输入任务

用户在编辑器输入：

```markdown
文本123

- [ ] 任务1

文本456

- [ ] 任务2
```

流程：

```text
TASK-016/TASK-017 当前：
MarkdownEditorPlugin 渲染受控 textarea
用户输入的 - [ ]、#tag、[[Page]] 作为普通 Markdown 文本保留
工具栏按钮通过 markdown.insert-text command 插入 - [ ]、#、[[ ]]
保存时通过 runtime.markdown.pages narrow facade 把 editor Markdown 导入为 markdown.line blocks
runtime.markdown.pages 只调用 core.pages.get / core.pages.update
每个 markdown.line block 都带稳定 blockId，空行也保留 blockId
保存不会自动扫描 task syntax，也不会自动执行 task.resolve-task-block

TASK-018/TASK-020 当前：
TaskPlugin 是内置插件，manifest 贡献 inert - [ ] syntax descriptor
调用方执行 runtime.commands.execute("task.resolve-task-block", { sourcePageId, sourceBlockId })
Command Registry 进入 Plugin Host command wrapper
Plugin Host 创建 command-time PluginContext
TaskPlugin 校验 source block 是唯一 top-level markdown.line
task.resolve-task-block 排除空标题、非 - [ ]、checked marker、四空格或 tab 缩进代码、fenced code 内 task-looking line
TaskPlugin 从当前 source block 派生标题
TaskPlugin 按 (sourcePageId, sourceBlockId) metadata relation 查重
TaskPlugin 只复用经过 task.sourcePageId/task.sourceBlockId 验证的 attrs.boundPageId
TaskPlugin 将 malformed、伪造或不匹配的 attrs.boundPageId 当作未绑定/不可信 source binding 数据
没有已有任务页时创建空 Markdown Page
Command 写 task.enabled、task.status、task.sourcePageId、task.sourceBlockId
Command 复制更新 source page body，给 source block 写 attrs.boundPageId
点击结构化 task title 时，编辑器执行 runtime.commands.execute("task.open-task-page", { sourcePageId, sourceBlockId })
task.open-task-page 共享 source relation 行为并返回 { pageId }，也能为 unresolved checked source line 创建 done task page 且不写 completion/reopen event
编辑器只把返回的 pageId 交给 onOpenPage；不会直接导航到 attrs.boundPageId
点击结构化 checkbox 时，编辑器执行 runtime.commands.execute("task.toggle-status", { sourcePageId, sourceBlockId })
task.toggle-status 返回 { pageId, status }，将 - [ ] 写成 - [x] 或将 - [x] / - [X] 写回 - [ ]
task.toggle-status 更新 task.status，并追加 namespace: "task", type: "completed" | "reopened" event

TASK-021 当前：
TagPlugin 是内置插件，manifest 贡献 inert #tag syntax descriptor 和 tag.tags metadata field descriptor
保存仍只把 #tag 当作 Markdown 文本写入结构化 markdown.line blocks
调用方执行 runtime.commands.execute("tag.refresh-tags", { pageId })
Command Registry 进入 Plugin Host command wrapper
Plugin Host 创建 command-time PluginContext
TagPlugin 扫描 saved top-level markdown.line source blocks
TagPlugin 忽略 headings、fenced code、escaped hashes、URL-ish invalid source tokens、非 ASCII/control-ish tokens 和 HTML-like fragments
TagPlugin 使用 raw ASCII slug grammar：trim，最多剥一个 #，raw input 先匹配 ASCII slug，再 lower-case
TagPlugin 写 namespace: "tag", key: "tags", valueType: "json" metadata，value 是不带 # 的 lowercase string[]
tag.refresh-tags 精确替换该页 tag.tags，当前 source 没有 tag 时写 []
没有保存时自动扫描、background indexer、rich inline token UI、autocomplete 或全局 metadata bar

TASK-022 当前：
TaskPlugin register upserts task.filter.all-tasks and task.filter.today
TaskPlugin registers view task.page-list with type page.list
TaskPlugin registers task.filter-empty-state on filter.empty_state
executeFilterQuery can execute current page/metadata filter results when called explicitly

TASK-023 当前：
metadata-ui exports reusable MetadataBar
MetadataBar composes page.header.metadata slot contributions in SlotRegistry order
TaskPlugin contributes read-only current fields
TagPlugin keeps add/remove controls through tag commands
TimerPlugin reserved the page.header.metadata Start slot

TASK-024 当前:
TimerPlugin registers timer.start / timer.stop / timer.pause / timer.resume / timer.switch
TimerMetadataPlaceholder executes timer.start through the scoped command executor
TimerPlugin registers timer.global-active-bar on global.floating
Active timer state is Timer-owned, registration-scoped, and in-memory
Timer lifecycle events use namespace timer and types started / paused / resumed / stopped

TASK-025 当前:
TimerPlugin registers timer.add-note and timer.page-timeline.segments
timer.stop, active timer.start, and active timer.switch append namespace timer/type time_segment_created
timer.add-note creates or updates Markdown Page notes for stopped segments
timer.page-timeline.segments renders current-page Timer-owned segments and inert Note text
MetadataBar and PluginHost scoped command execution authorize by registered command descriptor owner

TASK-026 当前:
CalendarPlugin registers calendar.day / calendar.week / calendar.open-time-segment
Calendar views consume caller-provided kind calendar.time-segments DTOs

TASK-027 当前:
HabitPlugin registers habit.refresh-habit / habit.check-today / habit.uncheck-today / habit.set-frequency
HabitPlugin writes habit.enabled / habit.frequency / habit.lastCheckedAt / habit.nextDue metadata
HabitPlugin appends namespace habit/type checked or unchecked events with payload { habitPageId, date }
HabitPlugin registers Habits and Today Habits filters
HeatmapPlugin registers heatmap.calendar and consumes caller-provided kind heatmap.date-series DTOs

后续：
编辑器保存后自动扫描 task blocks
全局 saved-filter navigation / app-shell filter route
Production app-shell/editor mounting for MetadataBar
Full metadata renderer/editor registry
Task checkbox auto-bridge for Habit completion
Timer metadata totals, Calendar/Habit/Heatmap app-shell route/feed, Stats/ML integration, Recently Worked, Unnoted Sessions, manual segment editing, calendar drag/drop, and native/schema surfaces
```

### 18.2 用户点击任务文字

```text
TaskBlock title clicked
→ MarkdownPageEditor has a structured-body task-title button only if task syntax extensions are active
→ MarkdownPageEditor snapshots current page id and content generation
→ CommandRegistry.execute("task.open-task-page", { sourcePageId, sourceBlockId })
→ TaskPlugin resolves or creates the task page through the TASK-018 source relation path
→ TaskPlugin returns exactly { pageId }
→ MarkdownPageEditor ignores the result if page/content changed while the command was pending
→ MarkdownPageEditor calls onOpenPage(pageId)
→ AppShell/editor route opens only the returned pageId
→ MarkdownEditorPlugin 渲染该页面
→ 后续 app-shell/editor mounting can render MetadataBar for page.header.metadata
```

The click path never trusts `attrs.boundPageId` as a navigation target. That attr is recovered/verifiable source binding data for the resolver path. Missing, forged, mismatched, or malformed values are treated as absent/untrusted.

`task.open-task-page` also accepts completed source task lines. If an unresolved checked line is opened, Task Plugin creates and binds a `done` task page without writing `completed` or `reopened` events.

### 18.3 用户点击任务 checkbox

```text
TaskBlock checkbox clicked
→ MarkdownPageEditor has a structured-body checkbox only if task syntax extensions are active
→ MarkdownPageEditor snapshots current page id and content generation
→ CommandRegistry.execute("task.toggle-status", { sourcePageId, sourceBlockId })
→ TaskPlugin creates or reuses the task page through the source relation path
→ TaskPlugin updates source marker and task.status in the same transaction
→ TaskPlugin appends namespace: "task", type: "completed" | "reopened" event
→ TaskPlugin returns exactly { pageId, status }
→ MarkdownPageEditor ignores the result if page/content changed while the command was pending
→ MarkdownPageEditor applies returned status to the structured body and visible Markdown
```

### 18.4 用户编辑或刷新 tags

```text
TagMetadataSlot rendered in page.header.metadata
→ User sees inert #tag text chips
→ Add submits CommandRegistry.execute("tag.add-tag", { pageId, tag })
→ Remove submits CommandRegistry.execute("tag.remove-tag", { pageId, tag })
→ TagPlugin normalizes the tag with the same ASCII slug grammar
→ TagPlugin writes page-scoped metadata.tag.tags through plugin-owned metadata facade
→ Removing on a touched page writes an explicit []
```

Markdown source refresh is explicit:

```text
CommandRegistry.execute("tag.refresh-tags", { pageId })
→ TagPlugin reads saved structured markdown.line blocks
→ TagPlugin extracts up to 32 first-seen unique normalized tags
→ TagPlugin replaces metadata.tag.tags exactly with the current source tags
```

Creating a tag filter stores a definition only:

```text
CommandRegistry.execute("tag.create-filter", { tag })
→ TagPlugin saves name "#tag"
→ query.where = [{ field: "metadata.tag.tags", op: "includes", value: tag }]
→ viewType = "page.list"
```

TASK-022 makes this saved filter shape executable/renderable through the generic `page.list` path when a caller supplies pages, metadata, query, and required metadata owner reservations.

### 18.5 用户打开 All Tasks / Today filter result

```text
TaskPlugin registered default filter exists
→ App/filter caller reads saved FilterDefinition
→ Caller supplies current pages and metadata records
→ Caller supplies Plugin Host-derived metadataOwnerReservations when enforcing built-in metadata trust
→ executeFilterQuery({ pages, metadata, query, currentDate?, metadataOwnerReservations })
→ Core excludes archived pages and evaluates metadata-only query subset
→ Caller resolves ViewRegistry by filter.viewType
→ viewType "page.list" resolves to task.page-list
→ TaskPageListView renders page titles as inert React text
→ If result is empty, caller resolves filter.empty_state slot
→ task.filter-empty-state renders generic empty-state copy from filterName
```

There is no production app-shell filter route yet. Automatic save-time scanning/indexing, Event/plugin-index `within` execution, JS filters, date picker, `@date` parser, and global saved-filter navigation remain deferred.

### 18.6 用户点击 Start

TASK-025 当前流程：

```text
Timer start affordance clicked
→ CommandRegistry.execute("timer.start", { pageId })
→ TimerPlugin validates exact payload and page existence
→ If another active timer exists, TimerPlugin appends namespace: "timer", type: "stopped" for it
→ If another active timer exists, TimerPlugin appends namespace: "timer", type: "time_segment_created" for it
→ TimerPlugin appends namespace: "timer", type: "started" with payload.startAt
→ TimerPlugin stores a running activeTimer DTO internally with startedAt
→ timer.global-active-bar refreshes from registration-scoped in-memory state
```

If `timer.start({ pageId })` is called while another timer is active, the returned result is `{ activeTimer, stoppedTimer, createdSegment }`. The created segment payload uses camelCase `segmentId`, `pageId`, `startAt`, `endAt`, `durationSeconds`, and `source: "timer"`.

### 18.7 用户 Pause / Resume / Stop / Switch

```text
CommandRegistry.execute("timer.pause", {})
→ TimerPlugin requires a running active timer
→ TimerPlugin appends namespace: "timer", type: "paused"
→ active timer elapsed time freezes

CommandRegistry.execute("timer.resume", {})
→ TimerPlugin requires a paused active timer
→ TimerPlugin appends namespace: "timer", type: "resumed"
→ active timer elapsed time resumes

CommandRegistry.execute("timer.stop", {})
→ TimerPlugin requires a running or paused active timer
→ TimerPlugin appends namespace: "timer", type: "stopped"
→ TimerPlugin appends namespace: "timer", type: "time_segment_created"
→ TimerPlugin clears active state
→ Result is { activeTimer: null, stoppedTimer, createdSegment }

CommandRegistry.execute("timer.switch", { pageId })
→ TimerPlugin validates exact payload and page existence
→ TimerPlugin stops any previous active timer and appends its time_segment_created event
→ TimerPlugin starts the next page timer
→ No-active, paused, and same-page switches are valid
→ Missing page preserves active state and events
```

`timer.pause` / `timer.resume` / `timer.stop` accept `undefined`, `{}`, and exact null-prototype empty payloads. Non-empty/caller-owned/prototype/accessor/symbol/non-enumerable unsafe payloads are rejected. Command results remain narrow DTOs. Paused duration is excluded from `durationSeconds`. TASK-025 still does not update total tracked metadata or touch native/schema surfaces.

### 18.8 用户 Stop 并写 Note

TASK-025 current flow:

```text
timer.page-timeline.segments rendered on page.timeline
→ Timeline filters current-page Timer-owned time_segment_created events
→ User clicks Add Note or Edit Note
→ User edits the accessible Note textbox and clicks Save Note
→ Timer-owned slot UI executes timer.add-note({ segmentId, markdown }) through the internal scoped executor
→ PluginHost scoped executor resolves the registered command descriptor and requires descriptor.pluginId === "timer"
→ TimerPlugin creates or updates a Markdown Page titled "Time Segment Note"
→ TimerPlugin appends namespace: "timer", type: "time_segment_note_added"
→ Original time_segment_created event remains immutable
→ Timeline refreshes and renders note text inertly
```

`timer.add-note` rejects active-only, unknown, malformed, wrong-owner, or unsafe payloads without mutating pages/events/state. The internal scoped executor is still a hidden `Symbol.for("mirabilis.internal.pluginScopedCommandExecutor")` channel duplicated between Plugin Host and Timer; it is protected by descriptor-owner checks, but remains a future API cleanup target. Calendar app-shell route/feed, Stats/ML integration, metadata totals, Recently Worked, Unnoted Sessions, manual segment editing, calendar drag/drop, and native persistence/schema/Tauri/package/Rust changes remain deferred.

### 18.9 Caller opens Calendar day/week

TASK-026 current flow:

```text
Caller/view host prepares CalendarTimeSegmentsData
→ data.kind is "calendar.time-segments"
→ each segment is a normalized Timer projection with source "timer"
→ provenance requires namespace "timer", sourcePluginId "timer", type "time_segment_created"
→ Caller resolves ViewRegistry id "calendar.day" or "calendar.week"
→ Calendar view validates DTOs fail-closed
→ Calendar view filters by UTC interval overlap against date/weekStart
→ Calendar view renders native buttons inside Calendar day/week regions
→ User clicks a segment block
→ Calendar view executes calendar.open-time-segment({ segmentId, pageId })
→ Command validates exact payload against the current runtime-scoped known segment set
→ Calendar view renders read-only Segment detail text
```

Calendar does not call `ctx.events.list(...)` to read Timer-owned events in this slice. Plugin-facing event reads remain scoped to the calling plugin, so a reviewed cross-plugin query/read facade is required before Calendar can directly query Timer events. The current Timer integration test normalizes a public `time_segment_created` event in the test harness, which models caller/view-host behavior rather than Calendar-owned event reads.

Calendar date inputs are UTC date-only strings. If `date` or `weekStart` is absent, the implementation derives the selected range from the current UTC date; deterministic tests pass explicit date/weekStart values or set the system clock. TASK-026 still accepts any `Date.parse`-parseable instant for segment `startAt`/`endAt`; strict `Z`-only UTC and duration-match validation remain future hardening.

Deferred after TASK-026:

```text
calendar.month
manual segment creation/editing
snake_case command aliases
app-shell Calendar route/navigation
drag/drop editing
broad cross-plugin event read/query facade
Timer metadata totals
Stats/ML/Habit/Task scheduled feeds
external calendar sync
native/Tauri/package/Rust/schema changes
strict UTC Z-only and duration-match hardening
stale detail clearing after data/date/week changes
```

### 18.10 Caller opens Heatmap calendar

TASK-027 current flow:

```text
Caller/view host prepares HeatmapDateSeriesData
→ data.kind is "heatmap.date-series"
→ each row is a normalized date-only projection with count, label, sourcePluginId, and source provenance
→ Caller resolves ViewRegistry id "heatmap.calendar"
→ Heatmap view validates DTOs fail-closed
→ Heatmap view sorts rows deterministically by date, label, and sourcePluginId
→ Heatmap view renders native buttons inside the Heatmap calendar region
```

Heatmap does not call `ctx.events.list(...)` to read Habit-owned events in this slice. The current integration test normalizes public Habit `checked` / `unchecked` events in the test harness, which models caller/view-host behavior rather than Heatmap-owned event reads.

Deferred after TASK-027:

```text
Task checkbox auto-bridge
Habit Review
Habit card/list polish
habit.target / habit.streak
skipped / weekly / monthly recurrence
Calendar/Stats/ML Habit feeds
app-shell Heatmap route/navigation
native/Tauri/package/Rust/schema changes
```

---
