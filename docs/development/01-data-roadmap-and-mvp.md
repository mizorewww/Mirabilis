# 数据方向、开发顺序与 MVP

汇总产品视角的数据表方向、阶段开发顺序、MVP 必须打通的闭环，以及最终系统形态。

## 27. 数据表设计方向

使用 SQLite。TASK-013 通过 `src-tauri/src/db` 的私有 Rust `rusqlite` 层落地 schema、migration 和 typed repositories；前端与插件不提交 raw SQL。

### 27.1 core_schema_migrations

```text
version
name
checksum
applied_at
```

Migration ledger 配合 SQLite `PRAGMA user_version` 记录已应用的 Core schema 版本。TASK-013 当前版本为 `1` / `001_core_schema`。

### 27.2 core_pages

```text
id
title
parent_page_id
body_json
created_at
updated_at
archived_at
```

### 27.3 core_metadata

```text
id
page_id
namespace
key
value_json
value_type
source_plugin_id
created_at
updated_at
```

### 27.4 core_events

```text
id
page_id
namespace
type
payload_json
source_plugin_id
created_at
```

### 27.5 core_filters

```text
id
name
query_json
sort_json
group_json
view_type
source_plugin_id
created_at
updated_at
```

### 27.6 core_plugins

```text
id
name
version
enabled
manifest_json
settings_json
installed_at
updated_at
```

### 27.7 core_commands

```text
id
plugin_id
command_id
title
shortcut
context
```

`core_commands` 保存 command descriptor。它不是 handler、函数、可执行路径、动态 import 或插件代码持久化。

### 27.8 core_views

```text
id
plugin_id
view_type
name
accepted_data_shape_json
```

`core_views` 保存 view descriptor 与 accepted data shape。它不是 React component、renderer、动态 import 或插件代码持久化。

### 27.9 core_plugin_indexes

```text
id
plugin_id
index_name
table_name
created_at
updated_at
```

`core_plugin_indexes` 是未来 plugin-owned index metadata 的中立 baseline registry。`plugin_id` 属于 owning Core plugin，并通过 `REFERENCES core_plugins(id) ON DELETE CASCADE` 约束；它不是具体 task、tag、timer、habit、stats 或 ml 业务表，也不是插件提交动态 DDL 的通道。

未来插件索引可以重建。事实数据仍然来自：

```text
Markdown Page
Metadata
Event
Filter
```

---

## 28. 开发顺序

### Phase 1：Core Kernel

实现：

```text
Markdown Page
Metadata
Event
Filter
View Registry
Command Registry
Plugin Host
Plugin Registry
```

验收：

```text
能创建 Markdown Page
能保存 metadata
能写 event
能保存 filter
插件能注册 command
插件能注册 view
插件能注册 metadata field
插件能注册 event type
```

### Phase 2：Markdown Editor Plugin

实现：

```text
Markdown-ish 编辑器
普通文本
标题
列表
- [ ] 语法输入
#tag 语法输入
[[page]] 输入
移动端快捷工具栏
```

验收：

```markdown
文本123

- [ ] 任务1

文本456

- [ ] 任务2
```

能正常编辑、渲染、保存。

### Phase 3：Task Plugin

实现：

```text
识别 - [ ]
创建任务对应 Markdown Page
点击任务文字打开页面
checkbox 完成/重开
任务无限嵌套
All Tasks Filter
Today Filter
```

TASK-022 当前已经交付 All Tasks / Today 的 narrow slice：Task Plugin owns the default filters, both use `viewType: "page.list"`, and results can be executed/rendered through the generic page/metadata executor plus registered view/slot path. Save-time task scanning/indexing, global saved-filter navigation, app-shell filter route, date picker, `@date` parser, Overdue/Done filters, and richer task list UI remain later work.

验收：

```markdown
- [ ] A
```

点击 A 进入 A 页面。
A 页面写：

```markdown
- [ ] B
```

点击 B 进入 B 页面。

### Phase 4：Metadata UI Plugin

TASK-023 当前已交付窄的 Metadata UI slice：

```text
metadata-ui built-in plugin
MetadataBar export
page.header.metadata slot composition in SlotRegistry order
Task read-only current fields
Tag existing add/remove controls through tag commands
Timer Start control through scoped timer.start
```

当前可见验收面：

```text
todo · #tag · due · Start
```

`MetadataBar` 是 reusable component；TASK-039 后，production app shell 在 page routes 上默认挂载 public `metadata-ui` `MetadataBar`，位置是 route title 下方、editor 上方。完整 metadata renderer/editor registry、date picker、estimate editor、完整 tag picker polish、save-time scanning/indexing 和 Timer tracked-total metadata 仍是后续范围。TASK-025 当前交付 `page.timeline` segment/note slot；TASK-039 后，它只在 trusted page routes 上通过 `SlotHost` 挂载，且只接收 `{ page: { id, title } }`。

### Phase 5：Timer Plugin

实现：

```text
Start
Stop
Pause
Resume
Switch
Global Timer
```

TASK-025 当前计时行为：

```text
timer.start
timer.stop
timer.pause
timer.resume
timer.switch
timer.add-note
timer.global-active-bar
timer.page-timeline.segments
```

TASK-025 当前已交付：

```text
Time Segment event
Time Segment Note Markdown Page
page.timeline segment/note slot
```

当前验收：

```text
任务能计时
Global Timer 显示 active page title / elapsed / Pause / Resume / Stop
停止追加 timer.stopped，再追加 namespace timer/type time_segment_created，并清除 active state
active timer.start 和 active timer.switch finalize previous timer before starting the next
timer.add-note 为 stopped segment 创建或更新 Markdown Page note
timer.page-timeline.segments 显示当前页面 Timer-owned segments 和 inert Note text
```

Recently Worked / Unnoted Sessions saved filters、metadata totals、persistent Calendar feeds/dashboards beyond TASK-042 day/week route projection、Timer-to-Stats feed normalization、trusted/persistent ML feed integration、manual segment editing、calendar drag/drop、native persistence/schema/Tauri/package/Rust changes 仍是后续范围。

### Phase 6：Calendar Plugin

TASK-026 当前实现：

```text
calendar.day
calendar.week
Accepted data kind: calendar.time-segments
Normalized Timer segment DTO rendering
calendar.open-time-segment({ segmentId, pageId })
点击时间块打开 inert detail
UTC day/week display with interval-overlap carryover segments
runtime-scoped command validation
fail-closed DTO/command validation
```

仍后续：

```text
calendar.month
manual segment creation/editing
snake_case command aliases
persistent Calendar dashboards/feeds beyond TASK-042 day/week route projection
drag/drop editing
broad cross-plugin event read/query facade
Timer metadata totals
Stats/ML/Habit/Task scheduled feeds
external calendar sync
native/Tauri/package/Rust/schema changes
strict UTC Z-only and duration-match hardening
stale detail clearing after data/date/week changes
```

### Phase 7：Habit Plugin + Heatmap View Plugin

TASK-027 当前实现：

```text
#habit syntax descriptor and explicit habit.refresh-habit
habit.enabled / habit.frequency / habit.lastCheckedAt / habit.nextDue metadata
habit.check-today / habit.uncheck-today / habit.set-frequency commands
namespace habit/type checked or unchecked events
Habits and Today Habits filters
generic heatmap.calendar view over kind heatmap.date-series DTOs
```

仍后续：

```text
Task checkbox auto-bridge
Habit Review
habit.target / habit.streak
skipped / weekly / monthly recurrence
Calendar/Stats/ML Habit feeds
app-shell Habit/Heatmap route polish
native/Tauri/package/Rust/schema changes
```

### Phase 8：Stats / Chart Plugin

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

Stats 当前消费调用方提供的 normalized DTO input，可以来自公开 plugin output/event/metadata 投影；Chart 当前渲染 generic Chart DTO，不读取 Stats internals。Unnoted sessions 已作为 aggregation 覆盖；TASK-042 已交付 transient Reports app-shell route。saved filters、persistent dashboards / insight views、broad reporting routes 仍是后续范围。

### Phase 9：ML Plugin

TASK-030 当前实现：

```text
built-in TypeScript-only plugin id ml
inert algorithm descriptor ml.predict-remaining-time
runtime command ml.run-prediction
input kind ml.remaining-time-prediction-input
output kind ml.remaining-time-prediction
view ml.prediction-panel
slot ml.page-sidebar.prediction-panel -> page.sidebar.panel
metadata descriptors ml.predictedRemainingTime / ml.predictionConfidence
event descriptor ml.prediction-generated
deterministic remaining-time baseline DTO
```

`ml.run-prediction` consumes exact bounded caller-provided pages/metadata/events projections only. It does not read sibling plugin private stores/facades, does not import Task/Timer/Tag/Habit/Stats internals, and does not persist ML metadata/events from those projections. Durable prediction writes require a future trusted query/feed/projection source.

TASK-043 当前把 ML 接入 app-shell page context panel：trusted page routes 可以打开右侧 `Page context` panel，shell 从 public runtime pages/metadata/events 快照构造 current-page `ml.remaining-time-prediction-input`，ML projection arrays cap at 1,000 rows，执行 active owned `ml.run-prediction`，并通过 exact `ViewHost` id/type `ml.prediction-panel` 渲染结果。Broad `page.sidebar.panel` mounting、durable ML metadata/events 和 persistent/trusted ML feed integration 仍是后续范围。

仍是后续范围：

```text
executable AlgorithmRegistry / runtime algorithm handler
trusted cross-plugin query/feed facade
persistent predictions / model refresh
推荐下一任务
分析高效时间段
估时偏差模型
相似任务聚类
task ranking
ML-native explanation beyond TASK-031 ai.explain-prediction advisory command
additional app-shell/sidebar polish beyond the TASK-043 page context panel
native/package/Rust/schema/Tauri capability changes
```

### Phase 10：AI Plugin

TASK-031 当前实现的是 AI Plugin provider abstraction baseline：

```text
built-in plugin id ai
provider id openai
canonical commands ai.cleanup-inbox / ai.turn-text-into-task / ai.suggest-tags / ai.suggest-due-date
canonical commands ai.generate-subtasks / ai.generate-filter / ai.summarize-time-notes / ai.generate-weekly-review / ai.explain-prediction
advisory DTOs only, no page/metadata/event/filter mutation
OpenAI Responses-style request boundary with instructions, string input, store false, and strict json_schema format
mocked/injected provider and transport tests, no live OpenAI calls
inert ai.provider-settings descriptor
fail-closed ai.suggestion-panel and ai.review-panel views
```

TASK-043 当前把 AI 接入 app-shell page context panel：Suggestions / Review tabs 通过 exact `ViewHost` ids 渲染 `ai.suggestion-panel` 和 `ai.review-panel`，shell 只为 `ai.suggest-tags`、`ai.suggest-due-date`、`ai.generate-subtasks` 和 valid ML prediction 后的 `ai.explain-prediction` 生成 bounded current-page advisory payloads。AI projection arrays cap at 100 rows，current-page body text cap at 50,000 chars。Shell 只执行 active owned AI command descriptors，结果保持 advisory，不写 pages、metadata、events、filters、settings、secrets、provider configuration 或 durable AI metadata/events。

Persistent plugin settings, settings UI, secret storage/keychain, native HTTP/live provider execution, AI acceptance workflows, durable AI metadata/events, and package/native/Tauri/Rust/schema/capability changes remain deferred.

### Phase 11：Sync Plugin

TASK-032 当前实现的是 Sync Plugin skeleton：

```text
built-in plugin id sync
no runtime commands / views / settings panels / transport
syncable unit descriptors and serializers for Markdown Page / Metadata / Event / Filter / Plugin Settings DTO snapshots
local plugin indexes marked rebuildable and excluded from durable sync payloads
mutable units require manual conflict resolution
event units use append-only union, duplicate dedupe, and same-id-content conflict
tombstones / deletes / conflict UI deferred
```

Plugin Settings are DTO snapshots only in this slice. Top-level or nested secret/auth/credential/remote-endpoint-like keys are rejected; future settings sync should use explicit allowlists and keep secrets or remote credentials out of durable setting snapshots. TASK-032 does not add settings UI, persistent plugin settings, secret storage/keychain, remote endpoint storage, native/network sync transport, schema changes, Tauri permissions/capabilities, package/Cargo changes, or Rust commands. No network sync may be enabled without explicit settings and security review.

---

## 29. MVP 必须打通的闭环

MVP 完成后，用户必须可以完成下面完整流程。

用户写：

```markdown
# 产品设计

文本123

- [ ] 设计 Core 架构 #architecture

文本456

- [ ] 设计 Plugin 系统 #plugin
```

系统显示：

```text
文本123

☐ 设计 Core 架构

文本456

☐ 设计 Plugin 系统
```

用户点击 `设计 Plugin 系统`，进入页面：

```markdown
# 设计 Plugin 系统

Plugin 是一等公民。

- [ ] 设计 Manifest
- [ ] 设计 View Registry
- [ ] 设计 Command Registry
- [ ] 设计 Algorithm Registry
```

页面顶部显示：

```text
todo · #plugin · estimate empty · tracked 0m · Start
```

用户点击 Start。

计时器显示：

```text
设计 Plugin 系统 · 00:00:01
Pause · Stop
```

TASK-025 当前 Global Timer 可以 Pause / Resume / Stop；`timer.stop`、active `timer.start` 和 active `timer.switch` 会生成 Timer-owned Time Segment events。TASK-026 当前 Calendar day/week 可以渲染调用方传入的 normalized `calendar.time-segments` DTO；Calendar 不直接通过 plugin-facing event facade 读取 Timer-owned events。TASK-028 当前 Stats 可以通过 `stats.run-aggregation` 聚合调用方传入的 normalized Timer/Habit/Task/Tag DTO。

TASK-025 当前用户可在 `page.timeline` 的 `timer.page-timeline.segments` 中为 stopped segment 写 Note：

```text
刚想清楚：Core 只负责 Markdown Page、Metadata、Event、Filter、View registry、Command registry。任务、习惯、计时、统计、ML 全部是 Plugin。
```

用户 Stop 后系统生成 Time Segment event：

```text
10:00–10:47
设计 Plugin 系统
Note: 刚想清楚...
```

当调用方把 Timer event 规范化为 Calendar DTO 后，Calendar 显示：

```text
10:00–10:47 设计 Plugin 系统
```

调用方把 Timer/Tag metadata 规范化为 Stats input 后，Stats / Chart 可以显示：

```text
#plugin 本周 47m
设计 Plugin 系统 tracked 47m
```

TASK-042 后，App Shell 已用 explicit transient projections 挂载 Calendar day/week 和 Reports/Chart route surfaces。Broad cross-plugin event query/read facade、persistent Calendar/Reports feeds、trusted/persistent ML feed integration、Timer metadata totals、Recently Worked / Unnoted Sessions saved filters、manual segment editing、calendar drag/drop、Task/Habit scheduled feeds 和 native persistence/schema/Tauri/package/Rust changes 仍是后续范围。

All Tasks 显示：

```text
设计 Core 架构
设计 Plugin 系统
设计 Manifest
设计 View Registry
设计 Command Registry
设计 Algorithm Registry
```

这就是 MVP 的核心闭环。

---

## 30. 最终系统形态

最终要开发的是：

```text
任务可以无限嵌套的 Markdown-first 本地时间管理系统
```

它的核心交互是：

```text
在 Markdown Page 中写普通文本
输入 - [ ] 创建任务
点击任务文本进入任务对应 Markdown Page
在任务页面继续写 - [ ] 创建子任务
在页面顶部图形化编辑 metadata
给任务计时
给每段 Time Segment 写 Note
用 Filter 组织所有页面
用 Quick Capture 把临时 Markdown 收进 Inbox
用 Search 临时查询页面标题和正文
用 Calendar 展示时间段
用 Heatmap 展示习惯
用 Stats / Chart 展示统计
用 ML Plugin 做预测
用 AI Plugin 做整理和总结
```

它的 Core 只负责：

```text
Markdown Page
Metadata
Event
Filter
View Registry
Command Registry
Plugin Host
```

所有高级能力都通过插件接入：

```text
任务：Task Plugin
标签：Tag Plugin
习惯：Habit Plugin
计时：Timer Plugin
日历：Calendar Plugin
热力图：Heatmap Plugin
统计图：Stats / Chart Plugin
机器学习：Machine Learning Plugin
AI：AI Plugin
快速收集箱：Quick Capture Plugin
同步：Sync Plugin
搜索：Search Plugin
```

TASK-029 当前 Quick Capture / Search baseline 已接入 built-in plugin runtime：Quick Capture 使用 `quick-capture` id、`quick-capture.*` commands、`quick-capture.unprocessed` metadata 和 `quick-capture.filter.inbox` filter，把 Markdown 保存到 trusted plugin-marked Inbox；Search 使用 `search.query` 和 `search.results`，按需扫描未 archived 页面 title/body。TASK-031 当前 AI baseline 也已接入 built-in plugin runtime：`ai` 注册 canonical kebab-case commands、AI metadata/event descriptors、`ai.provider-settings` descriptor 和 fail-closed views，通过 plugin-owned `openai` provider boundary 返回 advisory DTO。TASK-043 当前把 ML / AI 接入 page-only right context panel：ML 通过 current-page bounded projection 执行 `ml.run-prediction`，AI 只执行 advisory current-page allowlist，二者都通过 exact `ViewHost` ids 渲染，不启用 live provider、settings UI、secret storage、network/native execution 或 durable AI/ML writes。TASK-032 当前 Sync baseline 以内置 `sync` plugin id 接入，但只定义 syncable unit DTO descriptors/serializers、rebuildable local plugin-index policy 和 conflict policy；没有 runtime commands/views/settings panels、transport、settings UI、secret storage、network/native sync 或 schema/capability changes。Quick Capture native/global shortcut、移动 toolbar 语法按钮、自动 Task/Tag 清理、persistent Search indexing / background indexer / SQLite FTS、AI settings UI/secret storage/live provider execution、durable AI/ML acceptance/write workflows 和 Sync network/native transport 都是后续范围。

产品开发的中心任务是把 **Plugin Host、Registry、Command、View、Metadata、Event、Filter** 做扎实。只要这套底层抽象稳定，任务、习惯、时间记录、热力图、统计、机器学习和 AI 都可以作为插件不断接入，而不会污染 Core。
