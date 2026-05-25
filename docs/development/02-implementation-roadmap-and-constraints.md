# 实现路线与架构约束

汇总代码实现阶段、验收点、架构硬约束，以及最终代码架构总结。

## 19. 开发顺序

### Phase 1：Core Kernel

实现：

```text
Markdown Page Store
Metadata Store
Event Store
Filter Store
View Registry
Command Registry
Plugin Host
Plugin Registry
Transaction Manager
```

验收：

```text
能创建 Markdown Page
能写 Metadata
能写 Event
能保存 Filter
插件能注册 Command
插件能注册 View
插件能注册 Metadata Field
插件能注册 Event Type
```

---

### Phase 2：Markdown Editor Plugin

TASK-016/TASK-017 已交付的实现：

```text
Built-in markdown plugin
markdown.page-editor view
markdown.insert-text command
markdown.editor-mobile-toolbar.base slot
Controlled textarea shell
Toolbar snippets: - [ ] , #, [[ ]]
Command-bus insertion
runtime.markdown.collectEditorExtensions()
runtime.markdown.pages narrow page facade
Core helpers: importMarkdownToStructuredDocument / exportStructuredDocumentToMarkdown / validateStructuredMarkdownDocument
Line-oriented markdown.line structured bodies with stable blockId
Stable block ID reconciliation across edits, insertions, deletions, duplicate text, deleted-ID collisions, and similar inserted lines
Legacy markdown.text load-only fallback for exact TASK-016 bodies
Rust IPC structured body validation for core.pages.create / core.pages.update
```

验收：

```markdown
文本123

- [ ] 任务1

文本456

- [ ] 任务2
```

可以正常输入、保存、重新打开。

当前保存/重新打开只通过 Markdown runtime 的 narrow page facade 走 allowlisted NativeBridge `core.pages.get` / `core.pages.update` DTO。`load` 把结构化 body 导出为 editor Markdown；`save` 把 editor Markdown 导入为带稳定 `blockId` 的结构化 body。`storage.persistence = "in-memory-core"` 仍然属实，Core stores 没有整体改为 SQLite-backed。

延后实现：

```text
Tiptap / ProseMirror / rich editor
Semantic task/tag/page-link behavior
Checkbox events
Tag indexing
Page-link navigation
@date token
Autocomplete
Slash menu
Full editor extension adaptation
Full CommonMark AST round-tripping
Native filesystem Markdown import/export
User-facing load/save error UX
Packaging/release behavior
```

---

### Phase 3：Task Plugin

TASK-018 已交付的最小切片：

```text
Built-in task plugin in BUILT_IN_PLUGINS
Manifest markdown syntax descriptor: - [ ]
Command: task.resolve-task-block
Command payload: { sourcePageId, sourceBlockId }
Parser input: TASK-017 top-level markdown.line blocks with stable blockId
Task title derived from the current source block
TaskBlock → Markdown Page through command-level resolver
Task metadata: task.enabled, task.status, task.sourcePageId, task.sourceBlockId
Source binding: attrs.boundPageId copied into the source block body
Duplicate prevention by (sourcePageId, sourceBlockId)
Verified attrs.boundPageId reuse only when task metadata matches the same source relation
Metadata-only relation recovery after Markdown save/import drops attrs
CommonMark indented-code and fenced-code task-looking lines stay inert
No new Tauri IPC, permissions, filesystem, package, Rust, or native surface
```

TASK-018 验收：

```markdown
- [ ] A
```

执行：

```ts
runtime.commands.execute("task.resolve-task-block", {
  sourcePageId,
  sourceBlockId
});
```

会创建或复用 A 的任务页，并写入 task metadata 与 source binding。

Phase 3 已交付和后续范围：

```text
Automatic editor-save scanning / indexing
All Tasks Filter
Today Filter
Task list item / metadata field views
```

TASK-019 已交付的最小导航切片：

```text
Command: task.open-task-page
Command payload: { sourcePageId, sourceBlockId }
Command return: { pageId }
Shared behavior: same resolver/source relation path as task.resolve-task-block
Click title -> task.open-task-page -> open returned pageId
Loaded pageId/pageFacade editor mode carries structured body
Task-title buttons hidden after unsaved edits diverge from the structured body snapshot
Delayed open results ignored after page/content changes
Malformed attrs.boundPageId treated as absent/untrusted
No new Tauri IPC, permissions, filesystem, package, Rust, or native surface
```

TASK-020 已交付的最小 checkbox/status 切片：

```text
Command: task.toggle-status
Command payload: { sourcePageId, sourceBlockId }
Command return: { pageId, status }
Status vocabulary: todo | done
Unchecked source marker - [ ] completes to - [x]
Checked source markers - [x] / - [X] reopen to - [ ]
Task metadata task.status updates with the source marker
Task events use namespace: "task", type: "completed" | "reopened"
task.open-task-page can create/bind/open unresolved checked source lines as done pages without completion/reopen events
task.resolve-task-block remains unchecked-only
No new Tauri IPC, permissions, filesystem, package, Rust, or native surface
```

点击 A 进入 A 页面、A 页面写 `- [ ] B` 后点击 B 进入 B 页面，是 TASK-019 当前显式 click/open 行为。点击 checkbox 切换 source task line 状态并写 metadata/event 是 TASK-020 当前行为。TASK-022 当前交付 All Tasks / Today filters 的 data-only execution 和 registered `page.list` rendering slice。TASK-023 through TASK-030 已交付 reusable MetadataBar slice、Timer Start control、global active timer bar、Time Segment events、Time Segment Note Markdown Pages、`page.timeline` segment/note slot、Calendar day/week normalized segment rendering baseline、Habit commands/filters、Heatmap normalized DTO view baseline、Stats normalized aggregation baseline、Chart accessible DTO view baseline 和 ML deterministic prediction DTO baseline；保存后自动扫描/索引、全局 saved-filter navigation、app-shell filter/Calendar/Habit/Heatmap/Stats route、完整 metadata editor registry、Task checkbox 自动桥接 Habit、Timer metadata totals、Calendar/Stats cross-plugin feed/query facade、trusted/persistent ML feed integration、rich editor behavior 和 native/package surfaces 仍是后续范围。

TASK-021 已交付的最小 Tag Plugin baseline：

```text
Built-in tag plugin in BUILT_IN_PLUGINS
Plugin id: tag
Manifest markdown syntax descriptor: tag.hashtag, syntax #tag
Manifest metadata field descriptor: tag.tags, namespace tag, key tags, valueType json
Command: tag.refresh-tags
Command payload: { pageId }
Command behavior: explicitly scan saved structured markdown.line blocks and replace tag.tags
Command: tag.add-tag
Command: tag.remove-tag
Mutation payload: { pageId, tag }
Tag metadata: lowercase ASCII slug string[] without #
Grammar: trim, strip one leading #, raw ASCII slug before lowercasing
Limits: max 32 chars per tag, max 32 unique tags per page, first-seen order
Rejected: non-ASCII and values like K instead of Unicode case-folding
Ignored by source scan: headings, fenced code, escaped hashes, URL-ish invalid tokens, non-ASCII/control-ish tokens
Slot: tag.page-header-metadata.tags in page.header.metadata, order 300
Slot behavior: inert tag display plus add/remove controls through commands
Filter command: tag.create-filter stores metadata.tag.tags includes tag query with viewType page.list
TASK-022 can execute/render page.list saved filters through generic page/metadata filtering
No save-time scan, background indexer, rich inline token UI, autocomplete, global metadata bar, or app-shell filter route
No new Tauri IPC, permissions, filesystem, package, Cargo, Rust, or native surface
```

TASK-022 已交付的最小 Task filter/view slice：

```text
Core API: executeFilterQuery({ pages, metadata, query, currentDate?, metadataOwnerReservations? })
Executor behavior: data-only, inert, no store mutation, excludes archived pages
Supported query subset: metadata field paths, eq, neq, gt, lt, includes, exists, and/or
Fail closed: unknown/unsafe fields, malformed values, wrong value types, invalid date metadata, cycles/over-depth
Deferred operator semantics: within is still legal AST/store op but has no Event/plugin-index executor semantics yet
Task filter: task.filter.all-tasks, name All Tasks, viewType page.list, query metadata.task.enabled eq true
Task filter: task.filter.today, name Today, viewType page.list, task-enabled and not done, scheduled or due equals relative today
Date metadata: task.scheduled/task.due use valueType date and local YYYY-MM-DD strings
Task view: task.page-list, type page.list, accepts filter-results.markdown-pages
Task empty state: task.filter-empty-state on filter.empty_state with generic page empty-state copy
Compatibility: page.list preserves TASK-021 Tag Plugin saved filter compatibility
Metadata trust: callers pass host-derived metadataOwnerReservations; Core does not hard-code task/tag semantics
No JS filters, date picker, @date parser, task.set_due/task.set-due, Overdue/Done filters, native/Tauri/package/Rust changes
```

---

### Phase 4：Metadata UI

TASK-023 当前已交付：

```text
metadata-ui built-in plugin
MetadataBar export
page.header.metadata slot composition in SlotRegistry order
Task read-only current fields
Tag existing add/remove controls through tag commands
Timer Start control through scoped timer.start
```

当前验收面：

```text
todo · #tag · due · Start
```

`MetadataBar` 组合 plugin-owned `page.header.metadata` slot contributions，并用 active Plugin Host manifest ownership data 过滤 trusted field descriptors/values。Manifest `metadataFields` 仍是 inert descriptors / reservation inputs，不是 executable renderer/editor declarations。Production app-shell/editor 默认挂载、完整 metadata renderer/editor registry、date picker、estimate editor、完整 tag picker polish、save-time scanning/indexing 和 Time Segment timeline/note flow 仍是后续范围。

---

### Phase 5：Timer Plugin

实现：

```text
timer.start
timer.stop
timer.pause
timer.resume
timer.switch
global active timer bar
```

TASK-024 当前边界：

```text
Timer-owned registration-scoped in-memory active state
timer.started / timer.paused / timer.resumed / timer.stopped events
metadata Start control executes timer.start
global.floating timer.global-active-bar shows active page title / elapsed / Pause / Resume / Stop
```

TASK-024 时留给 TASK-025+ 的范围：

```text
time segment event
time segment note page
page timeline
recently worked filter
unnoted sessions filter
```

TASK-025 当前已交付的 Timer slice：

```text
timer.stop finalizes active timer with timer.stopped then namespace timer/type time_segment_created
active timer.start and active timer.switch use the same previous-timer finalization path
time_segment_created payload uses camelCase segmentId/pageId/startAt/endAt/durationSeconds/source timer
pause/resume duration is excluded from durationSeconds
timer.add-note creates or updates Markdown Page notes for stopped segments
timer.add-note appends namespace timer/type time_segment_note_added without mutating original segment events
timer.page-timeline.segments renders current-page Timer-owned segments and inert Note text
MetadataBar command execution requires owner-aware descriptor lookup and fails closed without lookup
PluginHost internal scoped command executor authorizes by descriptor owner, not command id prefix
```

Still deferred after TASK-026/TASK-030: Timer metadata totals, Calendar app-shell route/navigation, broad cross-plugin event read/query facade, Stats app-shell/feed integration, trusted/persistent ML feed integration, Recently Worked / Unnoted Sessions saved filters, manual segment editing, calendar drag/drop, native persistence/schema, and Tauri/package/Rust/native changes.

---

### Phase 6：Calendar Plugin

TASK-026 当前实现：

```text
calendar.week
calendar.day
Accepted data kind: calendar.time-segments
Normalized Timer segment DTO rendering
calendar.open-time-segment({ segmentId, pageId })
click segment → inert segment detail
UTC day/week display with interval-overlap carryover segments
runtime-scoped command validation
fail-closed DTO/command validation
```

TASK-026 当前不让 Calendar 通过 plugin-facing event facade 直接读取 Timer-owned events。调用方或 view host 负责把 public Timer `time_segment_created` events 规范化为 `calendar.time-segments` DTO；后续任务可以引入经过审查的 cross-plugin read/query facade。

仍后续：

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

---

### Phase 7：Habit + Heatmap Plugins

TASK-027 当前实现：

```text
#habit syntax descriptor and explicit habit.refresh-habit
habit.enabled / habit.frequency / habit.lastCheckedAt / habit.nextDue metadata
habit.check-today / habit.uncheck-today / habit.set-frequency commands
namespace habit/type checked or unchecked events
Habits and Today Habits filters
generic heatmap.calendar view over kind heatmap.date-series DTOs
```

TASK-027 当前不实现 Task checkbox 自动桥接、Habit Review、habit.target、habit.streak、skipped/weekly/monthly recurrence、automatic Calendar/Stats/ML Habit feeds、app-shell route polish 或 native/Tauri/package/Rust/schema changes。

---

### Phase 8：Stats + Chart Plugins

TASK-028 当前实现：

```text
stats.run-aggregation({ aggregationId, input })
stats.sum-time-by-tag
stats.sum-time-by-page
stats.estimate-vs-actual
stats.habit-completion-rate
stats.task-switch-count
stats.unnoted-sessions-count
chart.bar / chart.line / chart.pie
chart.category-series / chart.time-series / chart.comparison-series
```

Stats 当前消费调用方提供的 normalized DTO input，可以来自公开 plugin output/event/metadata 投影；Chart 当前只渲染 generic Chart DTO，不查询 Stats internals。Unnoted sessions 已作为 `stats.unnoted-sessions-count` aggregation 覆盖，但 saved filter / app-shell route 仍未交付。

TASK-028 当前不实现 Stats dashboard/insight views、saved filters、persistent indexes、production charting libraries、ML/AI insight generation、broad cross-plugin query/read facade、app-shell routes 或 native/Tauri/package/Rust/schema changes。

---

### Phase 9：ML Plugin

TASK-030 当前实现：

```text
feature builder from exact bounded caller-provided page/metadata/event projections
deterministic remaining time prediction baseline
runtime command ml.run-prediction
inert manifest algorithm descriptor ml.predict-remaining-time
input kind ml.remaining-time-prediction-input
output kind ml.remaining-time-prediction
view ml.prediction-panel
slot ml.page-sidebar.prediction-panel
metadata descriptors ml.predictedRemainingTime / ml.predictionConfidence
event descriptor ml.prediction-generated
```

TASK-030 不实现 executable AlgorithmRegistry、runtime algorithm handler、trusted query/feed facade、durable prediction metadata/events from caller-provided projections、model refresh/training/background jobs、best work time detection、task ranking、similar task clustering、recommendation、AI explanation、app-shell polish 或 native/package/Rust/schema/Tauri capability changes。

---

### Phase 10：AI Plugin

实现：

```text
quick capture cleanup
generate subtasks
suggest metadata
generate filter
summarize time notes
weekly review
explain prediction
```

还有llm provider(目前支持openai api)

---

## 20. 架构约束

最后用几条硬约束保证不会走歪。

### 20.1 Core 文件夹不得出现这些词的业务实现

```text
task
habit
timer
calendar
heatmap
stats
chart
ml
ai
```

Core 里可以出现：

```text
page
metadata
event
filter
view registry
command registry
plugin host
```

### 20.2 插件不能直接改其他插件的数据

Timer Plugin 不直接改 Task Plugin 内部状态。
它可以写自己的 event 和 metadata。
如果要响应任务完成，监听 `namespace: "task", type: "completed"` event。

### 20.3 所有用户动作走 Command Registry

UI 不直接调用业务函数。

```ts
runtime.commands.execute("task.toggle-status", {
  sourcePageId,
  sourceBlockId
});
runtime.commands.execute("timer.start", { pageId });
runtime.commands.execute("ai.generate-subtasks", { pageId });
```

### 20.4 所有跨插件协作走 Event / Metadata / Query

```text
Task Plugin 写 namespace: "task", type: "completed" event
Timer Plugin 监听后停止计时
Stats Plugin 后续可通过 reviewed query/feed facade 更新统计；TASK-028 当前由调用方传入 normalized DTO
ML Plugin 后续用这些数据生成预测
```

### 20.5 所有高级能力都注册为 Plugin

```text
任务：Task Plugin
标签：Tag Plugin
习惯：Habit Plugin
计时：Timer Plugin
日历：Calendar Plugin
热力图：Heatmap Plugin
统计：Stats Plugin
图表：Chart Plugin
机器学习：ML Plugin
AI：AI Plugin
快速收集箱：Quick Capture Plugin
搜索：Search Plugin
同步：Sync Plugin
```

TASK-029 当前 Quick Capture 和 Search 都是 TypeScript built-in plugin baseline。Quick Capture 注册 `quick-capture.open`、`quick-capture.save`、`quick-capture.save-and-open`、`quick-capture.modal`、`quick-capture.mobile-input`、`quick-capture.unprocessed` 和 `quick-capture.filter.inbox`；Search 注册 `search.query` 和 `search.results`，并在命令执行时按需扫描未 archived pages。这个 slice 没有 package/native/Tauri/Rust/schema/capability 变更，也没有 global shortcut、mobile toolbar mounting、persistent Search indexing、search indexer worker 或 SQLite/FTS。

---

## 21. 最终代码架构总结

这套代码架构应该长这样：

```text
Core Kernel
  只负责：
    Markdown Page
    Metadata
    Event
    Filter
    View Registry
    Command Registry
    Plugin Host

Plugin Host
  负责：
    加载插件
    管理生命周期
    注册能力
    处理依赖
    提供 lifecycle plugin context
    为 plugin command execution 提供 fresh command-time context

Plugins
  负责：
    任务
    标签
    习惯
    计时
    日历
    热力图
    统计图
    机器学习
    AI
    搜索
    同步
    快速收集箱

当前 TASK-018/TASK-022 代码流
  负责：
    TaskPlugin 注册 - [ ] markdown syntax descriptor
    TaskPlugin 注册 task.resolve-task-block
	    TaskPlugin 注册 task.open-task-page
	    TaskPlugin 注册 task.toggle-status
	    TaskPlugin 注册 task.filter.all-tasks / task.filter.today
	    TaskPlugin 注册 task.page-list view 和 filter.empty_state slot
	    Command Registry 执行 command
	    Plugin Host 注入 command-time PluginContext
	    TaskPlugin 通过 Core/plugin transaction 创建或复用任务页
	    TaskPlugin 写 task metadata 并复制更新 source block attrs.boundPageId
	    TaskPlugin 切换 source checkbox marker，更新 task.status，并追加 namespace/type task events
	    Core executeFilterQuery 可显式执行 current pages/metadata filter query
	    MarkdownEditorPlugin 从结构化 body 渲染 task-title buttons 和 checkbox
    MarkdownEditorPlugin 点击 task title 时发送 sourcePageId/sourceBlockId 并打开返回的 pageId
    MarkdownEditorPlugin 点击 checkbox 时发送 sourcePageId/sourceBlockId 并应用返回的 status
    NativeBridge/Tauri surface 保持不变

React App Shell
  负责：
    RuntimeProvider composition
    启动 loading state
    通用 startup failure alert
    从 public runtime app info 显示 shell status
    布局
    路由
    Slot 渲染
    View 渲染
    Command Palette
    Page UI

Tauri / Rust
  负责：
    SQLite
    文件系统
    全局快捷键
    通知
    窗口
    托盘
    同步传输
```

TASK-015 App Shell 边界：

- App Shell 可以组合 `RuntimeProvider`、启动 loading state、通用启动失败 alert，以及基于 public runtime `{ app }` info 的 shell status。
- App Shell 不实现 task、habit、timer、calendar、editor 或其他业务插件行为。
- App Shell 不直接 import Tauri API，不直接调用 `NativeBridge`，不接入 DB IPC 或 persistence wiring。
- App Shell / `useRuntime()` 不向 React descendants 暴露 full Core runtime handles，包括 stores、registries、services、pluginHost、NativeBridge、storage、db、filesystem 或 path APIs。

用户写：

```markdown
文本123

- [ ] 任务1

文本456

- [ ] 任务2
```

当前 roadmap state through TASK-027：

```text
MarkdownEditorPlugin 解析文档
TaskPlugin 识别 - [ ]
TaskPlugin 创建任务 Markdown Page
TagPlugin 通过显式 tag.refresh-tags 识别已保存 #tag
TimerPlugin 提供 timer.start / stop / pause / resume / switch / add-note、global active bar 和 page timeline segments
CalendarPlugin 提供 calendar.day / calendar.week 和 calendar.open-time-segment over normalized DTOs
HabitPlugin 提供 habit.refresh-habit / check-today / uncheck-today / set-frequency、Habit metadata、Habit events 和 Habits / Today Habits filters
HeatmapPlugin 提供 heatmap.calendar over normalized heatmap.date-series DTOs
Metadata UI 通过 reusable MetadataBar 组合 plugin-owned page.header.metadata fields
FilterEngine 聚合任务
ViewRegistry 渲染视图
```

这不是完整当前行为。TASK-018 当前只在调用 `runtime.commands.execute("task.resolve-task-block", { sourcePageId, sourceBlockId })` 时解析指定 unchecked source block，创建或复用任务页，写入 `task.enabled`、`task.status`、`task.sourcePageId`、`task.sourceBlockId`，并在验证 source relation 后通过 `attrs.boundPageId` 绑定 source block。TASK-019 当前在点击结构化 task title 时调用 `runtime.commands.execute("task.open-task-page", { sourcePageId, sourceBlockId })`，共享 source relation 行为，并只把返回的 `{ pageId }` 用于导航；TASK-020 后它也可以为尚未绑定的 checked source task line 创建、绑定并打开 `done` 任务页，且不写 completion/reopen event。TASK-020 当前在点击 checkbox 时调用 `runtime.commands.execute("task.toggle-status", { sourcePageId, sourceBlockId })`，返回 `{ pageId, status }`，写回 source marker、更新 `task.status`，并追加 `namespace: "task", type: "completed" | "reopened"` event。TASK-021 当前在调用 `runtime.commands.execute("tag.refresh-tags", { pageId })` 时扫描已保存 structured `markdown.line` source 并替换 `tag.tags`；`tag.add-tag` / `tag.remove-tag` 直接更新页面 scoped tag metadata；`tag.create-filter` 保存 `page.list` filter definition。TASK-022 当前可显式执行/渲染 Task/Tag 这类 `page.list` saved filters，但没有保存时自动刷新、global saved-filter navigation 或 production app-shell filter route。TASK-023 当前交付 reusable `MetadataBar` 和 Task/Tag/Timer metadata slot contributions；TASK-024 当前把 Timer slot 接到 `timer.start`，并交付 Timer-owned in-memory active state、lifecycle commands/events 和 `timer.global-active-bar`。TASK-025 当前追加 Time Segment events、Markdown Page-backed Time Segment Notes、`timer.add-note` 和 `timer.page-timeline.segments`。TASK-026 当前注册内置 `calendar` plugin、`calendar.day` / `calendar.week` views、`calendar.open-time-segment` command，并渲染调用方提供的 normalized `calendar.time-segments` DTO；Calendar 不直接通过 plugin-facing event facade 读取 Timer-owned events。TASK-027 当前注册内置 `habit` 和 `heatmap` plugins；Habit 通过显式 commands 识别 `#habit`、写 `habit.enabled` / `habit.frequency` / `habit.lastCheckedAt` / `habit.nextDue` metadata、追加 `namespace: "habit"` / `type: "checked" | "unchecked"` events，并保存 Habits / Today Habits filters；Heatmap 注册 `heatmap.calendar` view 并只消费调用方提供的 normalized `heatmap.date-series` DTO。TASK-028 当前注册内置 `stats` 和 `chart` plugins；Stats 通过 `stats.run-aggregation` 聚合 normalized DTO input，Chart 通过 `chart.bar` / `chart.line` / `chart.pie` 渲染 generic Chart DTO。TASK-030 当前注册内置 `ml` plugin；`ml.run-prediction` 只消费调用方提供的 exact bounded projections，返回 deterministic `ml.remaining-time-prediction` DTO，不持久化 caller-provided projection evidence。仍没有 production app-shell/editor 默认挂载、完整 field renderer/editor registry、Task checkbox 自动桥接 Habit、Timer metadata totals、Calendar/Habit/Heatmap/Stats route/navigation、broad cross-plugin read/query facade、trusted/persistent ML feed integration 或 native/schema changes。`attrs.boundPageId` 是 source binding 数据，不是直接导航目标；malformed、伪造或不匹配值按未绑定/不可信处理。

当前显式点击导航完成后，用户在任务页继续写：

```markdown
- [ ] 子任务
```

TASK-019 可以用同样 click/open 流程创建或打开子任务页，因此任务可以显式无限嵌套。保存后自动扫描、Tag/Timer/UI 自动刷新、global filter route 和 rich editor 行为仍属于后续任务。

这个架构的中心就是一句话：

> **Core 极小，Plugin 一等公民。所有产品能力都作为插件注册到 Core，而 Core 只维护 Markdown Page、Metadata、Event、Filter、View Registry、Command Registry 和 Plugin Host。**
