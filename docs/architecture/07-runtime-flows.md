# 启动流程与代码路径

描述 AppRuntime 创建流程，以及用户输入任务、打开任务页、Start/Stop 计时时的代码调用链。

## 17. 启动流程

```ts
async function createAppRuntime() {
  const nativeBridge = await createTauriNativeBridge();

  const storage = {
    persistence: "sqlite-core"
  };

  const stores = createCoreStores();

  await hydrateCoreStoresFromNativeBridge(stores, nativeBridge);

  const registries = await createCoreRegistries();

  const pageWriteThrough = createNativePageWriteThrough(
    stores.pages,
    nativeBridge
  );

  const transactionPersistence = createNativeTransactionPersistence(
    nativeBridge,
    {
      beforeCommit: pageWriteThrough.flush
    }
  );

  const rawServices = await createCoreServices({
    stores,
    registries,
    transactionPersistence
  });

  const services = await createCoreServices({
    stores: {
      ...stores,
      pages: pageWriteThrough.pages
    },
    registries,
    transaction: rawServices.transaction,
    directTransactionRunner: rawServices.transaction
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

当前默认实现顺序是：`createTauriNativeBridge()` -> storage facade `{ persistence: "sqlite-core" }` -> `createCoreStores()` -> `hydrateCoreStoresFromNativeBridge()` -> `createCoreRegistries()` -> persistence-aware `createCoreServices()` -> `PluginHost` -> runtime object with `runtime.markdown` -> `loadBuiltInPlugins(BUILT_IN_PLUGINS)` -> `activateAll()`。

TASK-046 makes the default runtime SQLite-backed for Core pages, metadata, events, and filters. Startup hydrates pages with `includeArchived: true`, then page-scoped metadata, events, and filters through the existing NativeBridge DB allowlist before any built-in plugin is activated. A malformed, `null`, or rejected hydration response fails startup; `RuntimeProvider` still shows the generic redacted startup failure UI.

The runtime still uses synchronous in-memory Core store implementations for read paths after hydration. Durable Core writes are added at the service layer:

- `services.transaction.run(...)` stages in-memory changes and commits the corresponding `DbQuery[]` with `NativeBridge.db.transaction(...)` before replacing live state.
- Direct runtime page writes exposed through `services.pages.create/update/archive` are write-through: they update the in-memory page store, queue a native transaction, and roll back that page snapshot if the pending native write fails.
- Pending direct page writes are flushed before a later persisted Core transaction commits, so transaction-managed metadata/event/filter/page writes do not race a missing SQLite page row.
- Plugin lifecycle and command contexts run plugin-facing direct `ctx.pages`, `ctx.metadata`, `ctx.events`, and `ctx.filters` mutations inside the Core transaction path via `directTransactionRunner`; nested `ctx.transaction.run(...)` reuses the current transaction context.

This TASK-046 slice is durable only for Core pages, metadata, events, and filters through the reviewed NativeBridge DB operations. Plugin-private runtime state such as Timer active state, injected AI/provider test state, settings panels, sync transport state, search indexes, and future plugin-owned indexes remain in memory or deferred unless represented as Core pages/metadata/events/filters by existing plugin code or delivered by later tasks.

TASK-047 is the app-shell route-state exception on top of that Core metadata boundary. The shell stores a JSON metadata record on the durable Home page with namespace `app-shell.navigation`, key `route-state`, and source owner `app-shell`; the record contains only a version, `homePageId`, active page/filter route ids and roles, an optional filter route token, and capped recent page ids. It does not add Tauri Store, browser storage, new IPC, permissions, schema, package/Cargo, Rust, or native routing surface.

`BUILT_IN_PLUGINS` 在 TASK-032 后包含内置 `MarkdownEditorPlugin`、`MetadataUiPlugin`、`TaskPlugin`、`TagPlugin`、`TimerPlugin`、`CalendarPlugin`、`HabitPlugin`、`HeatmapPlugin`、`StatsPlugin`、`ChartPlugin`、`QuickCapturePlugin`、`SearchPlugin`、`MlPlugin`、`AiPlugin` 和 `SyncPlugin`。`loadBuiltInPlugins(BUILT_IN_PLUGINS)` 接收的是 App 启动时显式传入的插件对象，不表示文件系统发现、动态 import 或 native 插件加载。

`runtime.markdown.collectEditorExtensions()` 从 `pluginHost.listPlugins()` 暴露的 public plugin metadata 收集 active plugin manifest 的 inert `contributes.markdownSyntax` descriptor。`runtime.markdown.pages` 是 narrow NativeBridge page facade，只发出 allowlisted `core.pages.get` / `core.pages.update` DTO，不接受 raw SQL、SQL params、filesystem path 或 file DTO。

TASK-017 后，`runtime.markdown.pages.load()` 从 `core.pages.get` 读取 body，把结构化 `markdown.line` blocks 导出为 editor Markdown；仅对 TASK-016 旧的 exact one-node `markdown.text` body 做 load-only fallback。TASK-020 后，load result 在结构化 body 可用时也携带 `body`，让 loaded `pageId/pageFacade` 编辑器模式可以从真实 runtime page facade 渲染 task-title buttons 和 checkbox。`runtime.markdown.pages.save()` 把 editor Markdown 导入为结构化 body 并通过 `core.pages.update` 保存，导入时使用上一版结构化 document 作为上下文来保留稳定 block IDs；save result 也携带 saved structured body。新保存不写 legacy `markdown.text` body。

TASK-018 的 `task.resolve-task-block`、TASK-019 的 `task.open-task-page` 和 TASK-020 的 `task.toggle-status` 运行在当前 Core/plugin runtime 内：Command Registry 调用 Plugin Host 包装过的 Task Plugin handler，Plugin Host 为本次 command execution 创建 fresh `PluginContext`，handler 通过 plugin-facing transaction、page store、metadata store 和 event store 创建或复用任务页、写 metadata、绑定 source block、切换 source checkbox marker，并追加 task events。TASK-046 后，这些 Core page/metadata/event writes 通过现有 `db_transaction` NativeBridge path 持久化；原 TASK-018/TASK-020 slice 没有新增 DB operation、权限、filesystem、package/Cargo 或 Rust surface。`task.open-task-page` 共享 source relation 行为并只返回 `{ pageId }`；`task.toggle-status` 接收 `{ sourcePageId, sourceBlockId }` 并返回 `{ pageId, status }`。

TASK-021 的 `tag.refresh-tags`、`tag.add-tag`、`tag.remove-tag` 和 `tag.create-filter` 也运行在当前 Core/plugin runtime 内：Command Registry 调用 Plugin Host 包装过的 Tag Plugin handler，Plugin Host 为本次 command execution 创建 fresh `PluginContext`，handler 通过 plugin-facing transaction、metadata store 和 filter store 更新 `tag.tags` 或保存 filter definition。TASK-046 后，这些 metadata/filter writes 通过 existing allowlisted NativeBridge DB operations 持久化；TASK-021 本身没有新增 DB operation、权限、filesystem、package/Cargo 或 Rust surface。

TASK-024 的 `timer.start`、`timer.stop`、`timer.pause`、`timer.resume` 和 `timer.switch` 同样运行在当前 Core/plugin runtime 内。Timer Plugin 在 `register(ctx)` 中创建 registration-scoped active timer store；Command Registry 调用 Plugin Host 包装过的 Timer handler，handler 通过 plugin-facing transaction 读取 page、append timer lifecycle events，并更新 Timer Plugin-owned in-memory active state。TASK-046 后，Timer lifecycle events written to Core Event Store are durable through `db_transaction`; Timer active state remains Timer-owned in-memory state and is not a Core-owned persisted timer store.

TASK-027 的 `habit.refresh-habit`、`habit.check-today`、`habit.uncheck-today` 和 `habit.set-frequency` 也运行在当前 Core/plugin runtime 内。Habit Plugin 通过 plugin-facing transaction 读取 page、写 Habit-owned metadata、append `namespace: "habit"` / `type: "checked" | "unchecked"` events，并 upsert Habits / Today Habits filters。TASK-046 后，这些 Core metadata/event/filter writes are durable through the same transaction-backed persistence path. Heatmap Plugin 在 register 阶段只注册 `heatmap.calendar` view，消费调用方传入的 `heatmap.date-series` DTO；它不读取 Habit events，不导入 Habit internals，也不新增 NativeBridge/Tauri IPC operation、权限、filesystem、package/Cargo、Rust surface 或 schema。

TASK-028 的 `stats.run-aggregation`、`chart.bar`、`chart.line` 和 `chart.pie` 同样只运行在 TypeScript plugin/view runtime 内。Stats 消费调用方传入的 normalized DTO，Chart 渲染调用方传入的 chart DTO；二者不读取 sibling plugin internals，也不新增 NativeBridge/Tauri IPC、权限、filesystem、package/Cargo、Rust surface 或 schema。

TASK-029 的 `quick-capture.open`、`quick-capture.save`、`quick-capture.save-and-open` 和 `search.query` 也运行在当前 Core/plugin runtime 内。Quick Capture 通过 plugin-facing transaction 创建或追加 trusted plugin-marked Inbox Page，并写 `quick-capture.unprocessed` metadata / `quick-capture.filter.inbox` filter；TASK-046 后这些 Core writes use the durable `db_transaction` path. Search 每次命令执行时 transient scan 当前 hydrated in-memory pages 的 title 和 structured body text；它仍没有 persistent indexer、Search worker、SQLite FTS、native/global shortcut 或 ranking persistence。

TASK-030 的 `ml.run-prediction` 同样只运行在 TypeScript plugin/runtime 内。`ml.predict-remaining-time` 是 inert algorithm descriptor；Command Registry 是当前 runtime execution entry。ML 消费 caller-provided exact bounded page/metadata/event projections，返回 deterministic `ml.remaining-time-prediction` DTO，不读取 sibling plugin private stores/facades，不持久化 caller-provided projection evidence 为 ML metadata/events，也不新增 NativeBridge/Tauri IPC、network、filesystem、worker、model storage/training、package/Cargo、Rust surface、schema 或 Tauri capability。

TASK-031 的 `ai.cleanup-inbox`、`ai.turn-text-into-task`、`ai.suggest-tags`、`ai.suggest-due-date`、`ai.generate-subtasks`、`ai.generate-filter`、`ai.summarize-time-notes`、`ai.generate-weekly-review` 和 `ai.explain-prediction` 也只运行在 TypeScript plugin/runtime 内。AI Plugin 消费 exact bounded caller-provided projections，通过 `src/plugins/ai/**` owned `openai` provider boundary 形成 Responses-style request DTOs（`instructions`、string `input`、`store: false`、strict `text.format` / `json_schema`），并返回 advisory DTOs。当前 provider/settings are injectable/mocked and default to unconfigured; no live OpenAI call, OpenAI SDK, raw network API, NativeBridge/Tauri IPC, filesystem, worker, package/Cargo/Rust surface, persistence schema, keychain, or Tauri capability is added.

TASK-043 的 app-shell `Page context` panel 只在 trusted page routes 上运行。它从 public runtime pages/metadata/events 快照派生 current-page ML / AI projection DTOs，执行 active owner-checked `ml.run-prediction` 和 advisory AI command allowlist，且只通过 exact `ViewHost` ids 渲染 `ml.prediction-panel`、`ai.suggestion-panel` 和 `ai.review-panel`。该 panel 不增加新插件注册、NativeBridge/Tauri IPC、filesystem、network/live provider、package/Cargo/Rust surface、persistence schema、keychain、permission 或 capability。

TASK-044 的 app-shell Settings workspace route 只展示 public runtime/app facts、public plugin manifest settings descriptors，以及内嵌的 Sync skeleton status。它不执行 settings/sync command，不渲染 executable settings panel，不接受 provider/remote/secret input，不持久化 plugin settings，不配置 Sync transport/conflicts，也不增加 NativeBridge/Tauri IPC、filesystem、network/live provider、package/Cargo/Rust surface、persistence schema、keychain、permission 或 capability。

TASK-045 的 app-shell responsive/accessibility polish 只调整现有 TypeScript/React/MUI shell state 和 accessibility semantics。Desktop 保持 workspace navigation 可见，并保持 `Page context` 为 named `complementary` panel。Narrow layout 初始关闭 temporary navigation，route selection 后关闭 navigation 并把 focus 返回 launcher；narrow `Page context` 使用 named modal MUI `Dialog`，支持 Escape close、focus containment、editor preservation 和 launcher focus return。Command Palette、Search 和 Quick Capture 继续使用 named MUI Dialog with initial focus/focus trap/focus return。这个流程不新增 NativeBridge/Tauri IPC、filesystem、network/live provider、package/Cargo/Rust surface、persistence schema、keychain、permission、capability 或 release surface。

TASK-047 的 app-shell durable navigation state 在 TASK-046 已有 Core metadata persistence 上运行。App Shell 将 active page route、active saved-filter route、durable Home identity 和 capped recent page ids 保存为 `app-shell.navigation` / `route-state` JSON metadata，`sourcePluginId` 为 `app-shell`，记录挂在 durable Home page 上。恢复时只读取 version、`homePageId`、active page/filter id/role、optional filter route token 和 capped recent page ids；page route 必须仍然存在且未 archived，filter route 必须重新通过 filter source plugin、target view、plugin ownership data 和 metadata-owner reservations 校验。Malformed/stale/missing/archived/wrong-owner records fail closed to safe Home or generic unavailable state. 这个流程不新增 Tauri Store、browser storage、NativeBridge/Tauri IPC、filesystem、network、package/Cargo/Rust surface、schema、permission、capability、generated permission TOML 或 native/backend routing surface。

TASK-032 的 SyncPlugin 也只作为 TypeScript built-in plugin skeleton 加载。它的 manifest id 是 `sync`，`register()` 不注册 runtime commands、views、slots、settings panels、indexers 或 algorithms；当前 runtime 没有 `sync.start` / `sync.push` / `sync.pull` / transport command，也没有 executable sync settings UI。`src/plugins/sync/**` 只导出 syncable unit descriptors/serializers for Markdown Page, Metadata, Event, Filter, and Plugin Settings DTO snapshots, plus a rebuildable local plugin-index policy and conflict-policy helper. Plugin Settings snapshots reject top-level/nested secret/auth/credential/remote-endpoint-like keys, and the event conflict helper rejects stale, mismatched, non-plain, malformed, or getter-backed event DTOs before union/dedupe/conflict classification. No NativeBridge/Tauri IPC, filesystem, storage adapter, package/Cargo/Rust surface, schema, keychain, remote endpoint, network transport, or Tauri capability is added for Sync in TASK-032.

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

TASK-039 当前:
Production app shell mounts public metadata-ui MetadataBar on page routes below route title and above editor
Production app shell mounts page.timeline below editor through SlotHost with only { page: { id, title } }
Production app shell mounts global.floating through MUI Portal as React-owned portal children
Floating timer controls receive only Timer-owned pause/resume/stop facade with exact {} payloads
Saved-filter and placeholder routes do not receive page metadata or page timeline slots

TASK-026 当前:
CalendarPlugin registers calendar.day / calendar.week / calendar.open-time-segment
Calendar views consume caller-provided kind calendar.time-segments DTOs

TASK-027 当前:
HabitPlugin registers habit.refresh-habit / habit.check-today / habit.uncheck-today / habit.set-frequency
HabitPlugin writes habit.enabled / habit.frequency / habit.lastCheckedAt / habit.nextDue metadata
HabitPlugin appends namespace habit/type checked or unchecked events with payload { habitPageId, date }
HabitPlugin registers Habits and Today Habits filters
HeatmapPlugin registers heatmap.calendar and consumes caller-provided kind heatmap.date-series DTOs

TASK-028 当前:
StatsPlugin registers stats.run-aggregation and inert algorithm descriptors for stats.sum-time-by-tag, stats.sum-time-by-page, stats.estimate-vs-actual, stats.habit-completion-rate, stats.task-switch-count, and stats.unnoted-sessions-count
StatsPlugin consumes caller-provided normalized DTO inputs from public plugin outputs/events/metadata projections
ChartPlugin registers chart.bar, chart.line, and chart.pie over chart.category-series, chart.time-series, and chart.comparison-series DTOs

TASK-029 当前:
QuickCapturePlugin registers quick-capture.open / quick-capture.save / quick-capture.save-and-open
QuickCapturePlugin registers quick-capture.modal and quick-capture.mobile-input as labelled region/textarea baselines
QuickCapturePlugin writes quick-capture.unprocessed metadata and quick-capture.filter.inbox
QuickCapturePlugin creates or appends to a trusted plugin-marked Inbox and preserves captured Markdown as inert structured text
QuickCapturePlugin does not auto-create Task/Tag metadata, events, or pages; Task/Tag handoff remains explicit command execution
SearchPlugin registers search.query and search.results
SearchPlugin performs transient bounded literal title/body scans over unarchived pages; no persistent indexer/native/search worker is present

TASK-041 当前:
App Shell opens top-bar Search as a MUI Dialog over the Markdown workspace
App Shell executes only active search-owned search.query with exact { query }
App Shell copies valid search.results data into a shell-owned bounded results route DTO
Search results route renders inert rows and validates selected pages before normal page-route navigation
Closing pending Search invalidates stale later resolve/reject results

TASK-042 当前:
App Shell opens Calendar and Reports as real Drawer routes with mounted route content
Calendar route snapshots public current-runtime pages/events/metadata, excludes missing or archived pages, and builds bounded kind calendar.time-segments data
Calendar route mounts calendar.day / calendar.week through ViewHost and refreshes the route snapshot after user-triggered view changes
Calendar route commandBridge delegates only calendar.open-time-segment({ segmentId, pageId }) for current projected segment pairs
Reports route builds bounded Stats inputs from public runtime data, defaults to stats.sum-time-by-page, and executes active stats-owned stats.run-aggregation
Reports route renders returned Chart DTOs through chart.bar / ViewHost, rejects stale async resolves/rejects after route or aggregation changes, and refreshes route snapshots after aggregation changes
Calendar/Reports route-level states own empty, unavailable, partial, loading, and error UI

TASK-030 当前:
MlPlugin registers ml.run-prediction, ml.prediction-panel, and ml.page-sidebar.prediction-panel
MlPlugin contributes inert algorithm descriptor ml.predict-remaining-time, metadata descriptors ml.predictedRemainingTime / ml.predictionConfidence, and event descriptor ml.prediction-generated
ml.run-prediction accepts kind ml.remaining-time-prediction-input with exact bounded caller-provided pages/metadata/events projections
MlPlugin returns kind ml.remaining-time-prediction deterministic baseline DTO only and does not persist ML metadata/events from caller-provided projections
PredictionPanel validates DTOs and fails closed/inertly for malformed or wrong-kind data

TASK-047 当前:
App Shell stores durable route state as JSON Core metadata on the durable Home page
metadata namespace is app-shell.navigation, key is route-state, source owner is app-shell
Persisted fields are limited to version, homePageId, active page/filter ids and roles, optional filter route token, and capped recent page ids
Startup reuses the durable Home page id when the page is available and non-archived
Page restoration revalidates non-archived pages before opening the editor route
Filter restoration revalidates filter source ownership, target view ownership, plugin ownership data, and metadata-owner reservations before mounting ViewHost or SlotHost state
Malformed, stale, missing, archived, or wrong-owner route-state records fail closed to safe Home or generic unavailable state
There is no Tauri Store, browser storage, new IPC, permission, schema, package/Cargo, Rust, native, backend routing, Search FTS, or global route database surface

后续：
编辑器保存后自动扫描 task blocks
TASK-038 已交付 current app-shell Drawer saved-filter routes for public filters; TASK-047 persists the active public saved-filter route identity through app-shell Core metadata, while broader global route databases and arbitrary plugin route DTOs remain future scope
Full metadata renderer/editor registry
Task checkbox auto-bridge for Habit completion
Timer metadata totals, Heatmap app-shell route/feed, persistent Calendar/Reports dashboards or saved filters beyond TASK-042, Stats persistent-index routes, trusted/persistent ML feed integration, Recently Worked saved filters, Unnoted Sessions saved filters, manual segment editing, calendar drag/drop, page.header.actions/sidebar/body-after slot placement, and native/schema surfaces
Quick Capture desktop global shortcuts/native entry point, Quick Capture mobile toolbar mounting, persistent Search indexing, Search indexer worker, SQLite/FTS search, native/global Search shortcuts, and Search ranking beyond existing plugin behavior
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
→ TASK-039 app-shell page routes render MetadataBar for page.header.metadata between title and editor
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

### 18.5 用户打开 Drawer saved-filter route

```text
User clicks Inbox, Today, All Tasks, or a public saved filter in the MUI Drawer
→ App Shell resolves a public FilterDefinition from the current runtime
→ App Shell verifies filter source plugin ownership, target view ownership, and plugin ownership data
→ Missing/inactive/unowned filter source, missing/unowned view, or unavailable plugin ownership data fails closed
→ App Shell collects active metadata owner reservations for namespaces queried by the filter
→ Missing/inactive/unowned metadata owner namespace fails closed
→ executeFilterQuery({ pages, metadata, query, currentDate?, metadataOwnerReservations })
→ Core excludes archived pages and evaluates the metadata-only query subset
→ App Shell projects matched pages to ViewHost props as pages: { routeToken, title }[]
→ ViewHost renders the registered filter viewType, such as page.list / task.page-list
→ TaskPageListView renders page titles as inert React text keyed by routeToken
→ If the trusted result is empty, App Shell resolves filter.empty_state through SlotHost
→ task.filter-empty-state renders generic empty-state copy from filterName
```

The route-unavailable state is shown before empty/result rendering whenever the filter, plugin ownership data, metadata owner reservations, or registered view cannot be trusted. Filter routes do not pass raw page IDs, page bodies, metadata records, event records, filter query JSON, runtime handles, NativeBridge, Tauri/native handles, filesystem/path handles, or plugin-private objects to plugin-rendered views. TASK-047 persists only the active public filter route identity for restart restoration. Automatic save-time scanning/indexing, Event/plugin-index `within` execution, JS filters, date picker, `@date` parser, broad global route databases, and arbitrary plugin view routes without explicit DTO designs remain deferred.

### 18.5.1 Durable navigation route restoration

TASK-047 当前流程:

```text
App Shell route changes after runtime hydration
→ Shell normalizes the active route to a durable page/filter route identity
→ Shell normalizes recent page ids, dedupes them, removes Home, and caps the list
→ runtime.transaction.run writes Core metadata:
   pageId: durable Home page id
   namespace: app-shell.navigation
   key: route-state
   sourcePluginId: app-shell
   valueType: json
   value: { version, homePageId, activeRoute?, recentPageIds }
```

The persisted `activeRoute` is an exact data record only:

```text
page route  → { kind: "page", pageId, role: "home" | "recent" | "command-open" }
filter route → { kind: "filter", filterId, role: "inbox" | "today" | "all-tasks" | "saved", routeToken? }
```

Restore reads the newest app-shell-owned JSON metadata record with namespace `app-shell.navigation` and key `route-state`. The parser accepts only plain data records with exact allowed keys, no accessors, no symbols, no prototype pollution, and no raw route DTO bodies. The shell then revalidates:

- `homePageId` points at an available, non-archived page, otherwise the shell reuses or creates safe Home.
- page routes point at available, non-archived pages and do not spoof Home role for a non-Home page.
- filter routes still have trusted filter source plugin ownership, registered target view ownership, active plugin ownership data, and required metadata-owner reservations.
- recent page ids point at available, non-archived pages after dedupe/cap/drop normalization.

Malformed, stale, missing, archived, wrong-owner, or unsafe route-state records fail closed before rendering route content. The user sees safe Home or a generic unavailable state; no raw page body, metadata/event/filter object, filter query JSON, SQL, path, token, secret, raw error, runtime handle, NativeBridge, Tauri/native handle, store, registry, Plugin Host, or plugin-private object is rendered or persisted.

TASK-047 uses existing Core metadata persistence only. It does not introduce Tauri Store, browser `localStorage`/`sessionStorage`, new NativeBridge operations, new Tauri IPC commands, generated permissions, capabilities, SQLite schema, package/Cargo changes, Rust/native code, backend/native routing, Search FTS, or a global route database.

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

`timer.add-note` rejects active-only, unknown, malformed, wrong-owner, or unsafe payloads without mutating pages/events/state. The internal scoped executor is still a hidden `Symbol.for("mirabilis.internal.pluginScopedCommandExecutor")` channel duplicated between Plugin Host and Timer; it is protected by descriptor-owner checks, but remains a future API cleanup target. Persistent Calendar/Reports feeds beyond TASK-042, trusted/persistent ML feed integration, metadata totals, Recently Worked / Unnoted Sessions saved filters, manual segment editing, calendar drag/drop, production charting dependencies, and native persistence/schema/Tauri/package/Rust changes remain deferred.

### 18.9 User opens Calendar day/week

TASK-026 plugin-view flow:

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

TASK-042 app-shell route flow:

```text
User clicks Calendar in the MUI Drawer
→ App Shell snapshots public current-runtime pages/events/metadata
→ Projection excludes missing and archived pages
→ Projection keeps trusted Timer time_segment_created events in the selected UTC day/week range
→ Projection caps calendar.time-segments rows at 1,000 and marks partial when truncated
→ App Shell verifies active calendar-owned view and command descriptors
→ ViewHost mounts calendar.day or calendar.week with the bounded projection
→ Calendar view receives a route-owned commandBridge
→ commandBridge only delegates calendar.open-time-segment({ segmentId, pageId }) for current projected segment pairs
→ User-triggered Day/Week changes rebuild the route snapshot before remounting the view
```

The route bridge rejects every other command id and stale/non-projected segment pair before Command Registry execution. It is not a raw Command Registry facade and does not expose broad runtime handles to the Calendar view.

Calendar date inputs are UTC date-only strings. If `date` or `weekStart` is absent, the implementation derives the selected range from the current UTC date; deterministic tests pass explicit date/weekStart values or set the system clock. TASK-026 still accepts any `Date.parse`-parseable instant for segment `startAt`/`endAt`; strict `Z`-only UTC and duration-match validation remain future hardening.

Deferred after TASK-026 / TASK-042:

```text
calendar.month
manual segment creation/editing
snake_case command aliases
drag/drop editing
broad cross-plugin event read/query facade
Timer metadata totals
Persistent Stats/ML/Habit/Task scheduled feeds
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
automatic Calendar/Stats/ML Habit feeds
app-shell Heatmap route/navigation
native/Tauri/package/Rust/schema changes
```

---

### 18.11 User opens Reports and runs Stats aggregation

TASK-028 plugin-view flow:

```text
Caller/view host prepares normalized Stats input from public plugin outputs/events/metadata
→ CommandRegistry.execute("stats.run-aggregation", { aggregationId, input })
→ Stats validates exact plain payload, matching input kind, trusted provenance, bounded inert arrays, finite numeric magnitudes, and bounded labels/ids
→ Stats returns a generic Chart DTO
→ Caller resolves ViewRegistry id chart.bar, chart.line, or chart.pie
→ Chart validates the generic DTO as exact inert plain data
→ Chart renders accessible table/list/status text
```

Stats does not query Timer/Habit/Task/Tag internals or private stores. Chart does not query Stats internals; it only renders supplied `chart.category-series`, `chart.time-series`, or `chart.comparison-series` DTOs. Both plugins avoid HTML/Markdown execution sinks.

TASK-042 app-shell Reports route flow:

```text
User clicks Reports in the MUI Drawer
→ App Shell snapshots public current-runtime pages/events/metadata
→ Projection excludes missing and archived pages
→ Projection builds bounded Stats input; default aggregation is stats.sum-time-by-page
→ Time-by-page and time-by-tag category outputs are capped at 200 Chart-compatible categories
→ Time-by-tag segment tagIds are limited to emitted tag rows
→ Habit event, habit summary, Timer note, and Stats input overflows mark partial route state
→ App Shell verifies active stats-owned stats.run-aggregation and chart-owned chart.bar descriptors
→ CommandRegistry executes stats.run-aggregation({ aggregationId, input })
→ Stale async resolve/reject results are ignored after route or aggregation changes
→ ViewHost renders the returned Chart DTO through chart.bar
```

Reports owns route-level empty, partial, loading, error, and unavailable states. It does not add a persistent stats index, saved reporting route, production chart dependency, native/Tauri/IPC/schema surface, or broad cross-plugin query/feed facade.

Deferred after TASK-028 / TASK-042:

```text
Stats dashboard and insight views
Stats saved filters
persistent stats indexes
production charting libraries
ML/AI insight generation
broad cross-plugin query/read facade
saved or persistent reporting dashboards beyond TASK-042
```

---

### 18.12 User runs Quick Capture

TASK-029 current flow:

```text
CommandRegistry.execute("quick-capture.open", {})
→ QuickCapturePlugin validates exact empty payload
→ Result is { kind: "quick-capture.open-result", viewId: "quick-capture.modal" }
→ A caller may resolve quick-capture.modal or quick-capture.mobile-input from ViewRegistry
→ Current views render labelled region + textarea baselines

CommandRegistry.execute("quick-capture.save", { markdown })
→ QuickCapturePlugin validates exact bounded nonblank Markdown payload
→ Markdown is imported to structured markdown.line blocks
→ Plugin transaction searches for unarchived title "Inbox" pages marked by quick-capture.unprocessed = true
→ If no trusted Inbox exists, Quick Capture creates title "Inbox" and writes quick-capture.unprocessed metadata
→ If a trusted Inbox exists, Quick Capture appends captured blocks to its body
→ Result is { kind: "quick-capture.save-result", pageId, createdInbox, appendedBlockIds }

CommandRegistry.execute("quick-capture.save-and-open", { markdown })
→ Uses the same save path
→ Adds openPageId: pageId to the result
```

Quick Capture does not adopt title-only user Inbox pages without its metadata marker. Captured Markdown remains inert structured text; unsafe-looking HTML, Markdown links, task syntax, and tag syntax are not executed. Quick Capture does not import Task or Tag internals and does not auto-create Task/Tag metadata, events, or pages. A caller must explicitly run public commands such as `tag.refresh-tags`, `task.resolve-task-block`, or `task.open-task-page` if it wants existing Task/Tag plugins to process captured Markdown.

Deferred after TASK-029:

```text
native/global shortcut entry point
Tauri permission/capability changes for shortcuts
full app-shell modal with focus/close/save behavior
mobile toolbar mounting and syntax buttons
automatic Task/Tag cleanup or AI inbox processing
```

### 18.13 User runs Search

TASK-041 app-shell flow:

```text
Top-bar Search button
→ App Shell opens named MUI Dialog and focuses the labelled search textbox
→ User submits bounded query text
→ CommandRegistry.execute("search.query", { query })
→ SearchPlugin validates exact bounded plain payload
→ Blank trimmed query returns { kind: "search.results", query, results: [] }
→ Search lists current pages and scans up to the page cap
→ Archived pages are excluded by the page listing behavior
→ Page title and structured body text are searched as case-insensitive literal substrings
→ Results include pageId, capped title, capped snippet, and matchedFields
→ App Shell accepts only active search-owned kind "search.results" data
→ App Shell copies query/results into a shell-owned bounded route DTO
→ Results route renders status + list/listitem/button rows as inert React text
→ Result click validates that pageId still exists
→ Existing page opens through normal app-shell page route state
```

Search results do not include full page bodies. Search route state does not receive raw runtime handles, full page bodies, plugin-private objects, NativeBridge, Tauri/native handles, filesystem/path handles, SQL, or raw errors. Later page edits are visible on the next `search.query` call because there is no persistent index in this slice. Closing the Search dialog while a query is pending returns focus and invalidates later resolve/reject results so stale searches cannot navigate or reopen results.

The registered `search.results` view remains the Search plugin baseline view/data kind. TASK-041 uses a shell-owned route DTO for interactive result navigation so the shell can validate page existence before opening a page route.

Deferred after TASK-041:

```text
persistent Search indexing
background search indexer or worker
SQLite FTS
ranking beyond current page-list scan order
native/global Search shortcuts
command-palette search polish beyond the current top-bar dialog/results route
native/Tauri/package/Rust/schema/capability changes
```

### 18.14 User runs ML prediction

TASK-030 current flow:

```text
Caller/view host prepares exact bounded page/metadata/event projections
→ CommandRegistry.execute("ml.run-prediction", { algorithmId, input })
→ Plugin Host creates command-time PluginContext for MlPlugin
→ MlPlugin validates algorithmId = "ml.predict-remaining-time"
→ MlPlugin validates input kind = "ml.remaining-time-prediction-input"
→ Feature builder validates inert arrays/plain records, bounded values, current page presence, and exact UTC instants
→ Feature builder extracts task estimate/status, Timer tracking/note evidence, Tag ids, child completion, and similar completed task history from the provided projections only
→ Deterministic baseline returns kind "ml.remaining-time-prediction"
→ Caller may resolve ViewRegistry id "ml.prediction-panel" or SlotRegistry id "ml.page-sidebar.prediction-panel"
→ PredictionPanel validates the DTO and renders inert text, or fails closed to unavailable status
```

`ml.predict-remaining-time` is a manifest algorithm descriptor only. There is no executable AlgorithmRegistry/runtime algorithm handler in TASK-030. `ml.run-prediction` does not read Task/Timer/Tag/Habit/Stats private stores or facades and does not import sibling plugin internals. It returns a deterministic DTO only; it does not persist `ml.predictedRemainingTime`, `ml.predictionConfidence`, or `ml.prediction-generated` records from caller-provided projections.

Deferred after TASK-030:

```text
executable AlgorithmRegistry / runtime algorithm handler
trusted cross-plugin query/feed facade
persistent ML prediction metadata/events and model refresh
recommend next task / best work time / estimate bias / clustering / ranking
ML-native explanation/model integration beyond TASK-031 ai.explain-prediction advisory command
additional app-shell/sidebar polish beyond the TASK-043 page context panel
network/filesystem/workers/model storage/training/background jobs
native/Tauri/package/Rust/schema/capability changes
```

### 18.15 User runs AI advisory command

TASK-031 current flow:

```text
Caller/view host prepares exact bounded projections for the chosen AI command
→ CommandRegistry.execute("ai.generate-subtasks", input)
→ Plugin Host creates command-time PluginContext for AiPlugin
→ AiPlugin validates exact input kind, projection shape, bounds, and forbidden secret/provider fields
→ AiPlugin snapshots validated input before async provider execution
→ AiPlugin builds an openai provider request with instructions, string input, store false, and strict text.format json_schema
→ Injected/mocked provider or transport returns raw/provider output
→ OpenAI adapter normalizes output_text or message output_text content
→ AiPlugin validates provider output and returns an advisory DTO, or returns a redacted fail-closed AI result
```

The current flow does not write pages, metadata, events, filters, settings, or provider configuration. `ai.suggestion-panel` and `ai.review-panel` can be resolved from ViewRegistry and render accessible unavailable/loading status, but there is no app-shell AI route, acceptance UX, persistent/executable provider settings UI, secret storage, native HTTP, live provider execution, or durable AI metadata/event write path in TASK-031.

Deferred after TASK-031:

```text
persistent plugin settings and executable provider settings UI
OS keychain / secret storage
native HTTP transport / OpenAI SDK / live provider execution
durable AI metadata/event writes and suggestion acceptance workflow
broader app-shell AI route/sidebar workflows beyond the TASK-043 advisory context panel
raw Responses missing-status stricter parsing
exact preservation of public result words matching persist*
generate-filter parity with broader Core filter operators such as neq / exists
native/Tauri/package/Rust/schema/capability changes
```

---

### 18.16 User opens ML / AI page context panel

TASK-043 current flow:

```text
User is on a trusted page route
→ User clicks top-bar Context Panel
→ On desktop, App Shell opens a named complementary Page context panel next to the Markdown workspace
→ Panel snapshots public runtime pages, metadata, and events
→ buildMlContextProjection derives current-page ml.remaining-time-prediction-input
→ ML projection includes current page, direct child page summaries, allowed Task/Tag metadata, and Timer segment/note events
→ ML projection caps page/metadata/event arrays at 1,000 rows and reports partial status when truncated
→ User clicks Run prediction
→ App Shell verifies active owned ml.run-prediction descriptor
→ CommandRegistry.execute("ml.run-prediction", projection)
→ Valid current-page result renders through ViewHost id/type ml.prediction-panel
```

AI tabs in the same panel use exact registered views and advisory commands:

```text
Suggestions tab renders ViewHost id/type ai.suggestion-panel with { kind: "ai.suggestion-panel" }
Review tab renders ViewHost id/type ai.review-panel with { kind: "ai.review-panel" }
buildAiContextProjection derives current-page advisory payloads
→ ai.suggest-tags
→ ai.suggest-due-date
→ ai.generate-subtasks
→ ai.explain-prediction only after a valid current-page ML prediction exists
AI projection arrays cap at 100 rows
Current-page bodyMarkdown caps at 50,000 chars
App Shell verifies active owned ai command descriptors before execution
Command results render as advisory status text only
```

TASK-045 keeps the desktop `Page context` surface as `complementary`. On narrow layouts the same launcher opens a named modal MUI `Dialog` instead of a Drawer route:

```text
User is on a trusted page route in a narrow viewport
→ User clicks top-bar Context Panel
→ App Shell opens a named modal Page context Dialog
→ Dialog contains the same bounded ML / AI tabs and close control
→ MUI Dialog marks the surface modal and contains focus
→ Escape or Close dismisses the Dialog
→ App Shell returns focus to the Context Panel launcher
→ Markdown editor remains mounted behind the Dialog
```

The panel closes or refreshes on route changes and ignores stale async ML/AI results for earlier pages. Missing current pages, archived/malformed data, unavailable views or commands, malformed command output, and command failures show generic unavailable/error states. The panel does not expose full workspace bodies, unrelated page bodies, raw page records, full runtime handles, Core stores, registries, Plugin Host, NativeBridge/Tauri handles, provider settings, API keys, raw provider errors, stack traces, paths, SQL, or secrets.

Deferred after TASK-043:

```text
broad page.sidebar.panel SlotHost mounting
durable ML prediction metadata/events
AI suggestion acceptance/apply workflows
executable provider settings UI
persistent plugin settings
secret storage / OS keychain
native HTTP / OpenAI SDK / live provider execution
network/native execution
package/Cargo/Rust/Tauri/schema/IPC/capability/permission changes
```

---

### 18.17 Sync skeleton contract

TASK-032 current flow is definition-only:

```text
App bootstrap loads SyncPlugin from BUILT_IN_PLUGINS
→ Plugin Host installs/activates manifest id sync
→ SyncPlugin.register() does not add runtime commands or views
→ syncable unit serializers can be imported by tests/future sync code
→ conflict policy helper can classify mutable-unit and event-unit conflicts
```

Current Sync code does not execute a sync job, read/write stores through a command, persist plugin settings, open a network connection, call NativeBridge/Tauri IPC, or resolve a user-facing conflict. Durable payload candidates are DTO snapshots for Markdown Page, Metadata, Event, Filter, and Plugin Settings; local plugin indexes are marked rebuildable and excluded from durable sync payloads. Event conflict classification first validates strict event DTO shape: event units and `syncKey` must be exact plain data records, accessors are rejected without getter reads, and `snapshot.id` must match `syncKey.id`. TASK-044 can display this skeleton status inside the shell-owned Settings workspace, but it does not add Sync-owned commands, views, settings panels, transport, remote endpoint configuration, background jobs, settings persistence, or conflict UI.

Deferred after TASK-032:

```text
executable sync settings UI / persistent plugin settings facade
secret storage / OS keychain
remote account or endpoint configuration
network/native sync transport
background jobs / workers
delete/tombstone model
conflict UI and user resolution workflow
schema-backed sync state
native/Tauri/package/Rust/schema/capability changes
```

---

### 18.18 User opens Settings workspace

TASK-044 current flow:

```text
User clicks the top-bar Settings button
→ App Shell selects the Settings workspace route
→ Settings route reads public runtime app facts
→ Settings route lists public plugin manifest settings descriptors
→ ai.provider-settings renders as inert descriptor-only status
→ Settings route embeds Sync skeleton status for manifest id sync
→ Sync status states no runtime commands, views, settings panels, transport, remote endpoint, background jobs, conflict UI, or settings persistence
```

The Settings route is route selection and display only. It does not execute Command Registry entries, render executable plugin settings panels, mutate plugin settings, persist provider configuration, store secrets, configure a remote endpoint, start Sync, or resolve conflicts. It does not expose raw runtime handles, Core stores, registries, Plugin Host, NativeBridge/Tauri handles, filesystem/path values, SQL, provider settings, API keys, tokens, credentials, remote endpoints, raw errors, or secrets.

Deferred after TASK-044:

```text
executable provider/settings UI
persistent plugin settings facade
secret storage / OS keychain
sync account or endpoint configuration
network/native sync transport
background sync jobs
conflict UI and user resolution workflow
provider settings persistence or live provider execution
native/Tauri/package/Rust/schema/IPC/capability changes
```

---

### 18.19 User opens responsive shell surfaces

TASK-045 current flow:

```text
Desktop viewport
→ App Shell evaluates the MUI breakpoint through useMediaQuery
→ Workspace navigation is rendered as a visible navigation landmark
→ Workspace navigation launcher reports aria-expanded="true"
→ Main Markdown workspace remains the primary editable region
```

```text
Narrow viewport
→ App Shell evaluates the MUI breakpoint through useMediaQuery
→ Temporary workspace navigation starts closed
→ User opens the Workspace navigation launcher
→ Navigation renders as the Workspace navigation landmark
→ User chooses a route such as Today
→ App Shell selects the route, closes temporary navigation, and returns focus to the launcher
→ Reopening navigation exposes the selected route with aria-current="page"
```

Command Palette, Search, Quick Capture, and narrow Page context all use named MUI Dialog surfaces. Each Dialog has initial focus in the first workflow control or close control, keeps focus contained while open, supports Escape or cancel/close behavior, and returns focus to the launcher. Startup failure text remains generic and redacted; it does not render raw runtime errors, stack traces, SQL, filesystem paths, provider names, tokens, credentials, NativeBridge handles, or Plugin Host details.

Deferred after TASK-045:

```text
backend/native routing or broad global route databases
native/global Quick Capture or Search shortcuts
mobile Quick Capture toolbar / native mobile integration
persistent Search index / search worker / SQLite FTS
broad query/feed/dashboard surfaces
executable provider/settings UI
secret storage / OS keychain
network/native sync transport
conflict UI and user resolution workflow
native/Tauri/package/Rust/schema/IPC/capability/release changes
```

---
