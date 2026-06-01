# 插件平台设计

描述 Plugin 作为一等公民时的 Manifest、贡献能力、生命周期、运行时注册表，以及 App Plugin 与 Tauri Plugin 的边界。

## 5. Plugin 是一等公民

Plugin 是这个系统的主要扩展单位。

所有计划开发的功能都用 Plugin 接入：

```text
Task Plugin
Tag Plugin
Habit Plugin
Timer Plugin
Calendar Plugin
Heatmap Plugin
Stats Plugin
Chart Plugin
Machine Learning Plugin
AI Plugin
Search Plugin
Sync Plugin
Quick Capture Plugin
Markdown Extension Plugin
```

参考 Obsidian 的插件思路：Obsidian 插件通过 `manifest.json` 声明插件身份、版本、最低 App 版本等信息，并通过插件生命周期注册命令、视图、设置页、状态栏等扩展点；Obsidian 官方开发文档也明确插件有 `onload()` / `onunload()` 这类生命周期。这个产品要吸收这种“Core 提供能力注册点，插件注册具体能力”的架构思路。([Developer Documentation](https://docs.obsidian.md/Reference/Manifest "Manifest - Developer Documentation"))

---

## 6. Plugin Manifest 设计

每个插件都必须有 Manifest。

示例：

```json
{
  "id": "task",
  "name": "Task Plugin",
  "version": "0.1.0",
  "description": "Recognize - [ ] syntax and turn it into navigable task pages.",
  "minAppVersion": "0.1.0",
  "author": "mizorewww",
  "main": "plugins/task/main",
  "contributes": {
    "markdownSyntax": [],
    "metadataFields": [],
    "eventTypes": [],
    "commands": [],
    "filters": [],
    "views": [],
    "slots": [],
    "indexers": [],
    "algorithms": [],
    "mobileToolbarItems": [],
    "settingsPanels": []
  }
}
```

Manifest 用来声明插件能给系统贡献什么。
TASK-010 中，`contributes` 里的能力是 manifest contribution descriptor，不等于已经存在同名 runtime facade。
当前 `PluginContext` 暴露 `pages`、`metadata`、`events`、`filters`、`commands`、`views`、`slots` 和 `transaction`。
其中只有 `commands`、`views`、`slots` 有当前 plugin-facing `register/get/list` facade；`metadataFields`、`eventTypes`、`indexers`、`algorithms`、`mobileToolbarItems`、`settingsPanels` 目前由 manifest 描述，后续 Plugin Host / Plugin Platform 再把它们接成可执行或可渲染运行时能力。TASK-022 后，Plugin Host 会从 valid `metadataFields` manifest descriptors 派生 metadata owner reservations，用于 plugin-facing metadata writes 和低层 filter execution 的 trust boundary。TASK-023 后，`metadataFields` 仍是 inert descriptors / reservation inputs；Metadata UI 不把 manifest 字段当作 executable renderer/editor declaration。

---

## 7. Plugin 可以贡献的能力

TASK-010 当前 API contract 覆盖以下贡献能力：

```text
1. Markdown Syntax
2. Metadata Field
3. Event Type
4. Command
5. Filter
6. View
7. Slot Contribution
8. Indexer
9. Algorithm
10. Mobile Toolbar Item
11. Settings Panel
```

这意味着：

- `- [ ]` 是 Task Plugin 注册的 Markdown Syntax；

- `#tag` 可先通过 Tag Plugin 的 Markdown Syntax / Metadata Field 契约接入；Inline Token 是后续扩展；
  TASK-021 当前已接入内置 `TagPlugin`：manifest id `tag`，Markdown syntax descriptor `tag.hashtag` / `#tag`，metadata field descriptor `tag.tags` / `namespace: "tag"` / `key: "tags"` / `valueType: "json"`。descriptor 本身仍是 inert metadata；正文 tag 刷新由显式 `tag.refresh-tags({ pageId })` command 完成。

- Task Plugin 当前通过 manifest 声明 `task.enabled`、`task.status`、`task.sourcePageId`、`task.sourceBlockId`、`task.scheduled` 和 `task.due` metadata fields。TASK-022 的 All Tasks / Today filters 使用这些 task-owned metadata fields，并通过 canonical `viewType: "page.list"` 渲染。

- Metadata UI Plugin 当前是内置插件，manifest id 是 `metadata-ui`。它导出 reusable `MetadataBar` component；具体字段 UI 仍由业务插件通过 `page.header.metadata` slot contribution 提供，而不是通过 manifest `metadataFields` 执行 renderer/editor。

- `#habit` 是 Habit Plugin 识别的语义。TASK-027 当前内置 `habit` 注册 `habit.refresh-habit`、`habit.check-today`、`habit.uncheck-today`、`habit.set-frequency`，维护 `habit.enabled`、`habit.frequency`、`habit.lastCheckedAt`、`habit.nextDue` metadata，并追加 `namespace: "habit"` / `type: "checked" | "unchecked"` events；

- Timer Plugin 当前注册 lifecycle commands 和 `timer.add-note`，并 emit `namespace: "timer"` events：`type: "started"` / `"paused"` / `"resumed"` / `"stopped"` / `"time_segment_created"` / `"time_segment_note_added"`；

- 热力图是 Heatmap Plugin 注册的 View。TASK-027 当前内置 `heatmap` 注册 generic `heatmap.calendar` view，`type: "heatmap"`，接受 `{ kind: "heatmap.date-series" }` normalized DTO；Heatmap 不直接读取 Habit internals；

- 各种统计图是 Chart / Stats Plugin 注册的 View；

- Machine Learning Plugin 当前以内置 plugin id `ml` 接入。TASK-030 中 `ml.predict-remaining-time` 是 manifest algorithm descriptor，当前可执行入口是 Command Registry 里的 `ml.run-prediction`；不存在 executable AlgorithmRegistry facade。

- AI Plugin 当前以内置 plugin id `ai` 接入。TASK-031 注册 provider-owned advisory commands、`ai.suggestion-panel` / `ai.review-panel` views、AI-owned metadata/event descriptors 和 inert `ai.provider-settings` descriptor；provider boundary 由 `src/plugins/ai/**` 拥有，Core 不包含 OpenAI、model、prompt 或 provider behavior。AI Tool、live provider execution、persistent settings/secret storage 和 acceptance workflows 是后续扩展；

- 日历是 Calendar Plugin 注册的 View。TASK-026 当前内置 `calendar` 注册 `calendar.day` / `calendar.week`，接受 `{ kind: "calendar.time-segments" }` normalized DTO，并通过 `calendar.open-time-segment` 打开 inert detail；`calendar.month`、snake_case aliases、manual create/edit 和直接跨插件读取 Timer events 不在这个 slice 内；

- 快速收集箱是 Quick Capture Plugin 注册的入口和命令。TASK-029 当前内置 `quick-capture` 注册 `quick-capture.open`、`quick-capture.save`、`quick-capture.save-and-open`、`quick-capture.modal`、`quick-capture.mobile-input`、`quick-capture.unprocessed` 和 `quick-capture.filter.inbox`；native/global shortcut 和 mobile toolbar mounting 仍是后续范围；

- 搜索是 Search Plugin 注册的命令和结果视图。TASK-029 当前内置 `search` 注册 `search.query` 和 `search.results`，按需扫描未 archived page title/body；persistent Search indexing、background indexer、SQLite/FTS 和 native surface 仍是后续范围。

- Sync Plugin 当前以内置 plugin id `sync` 接入。TASK-032 注册的是 skeleton：没有 runtime commands、views、settings panels、transport、network behavior 或 native surface；`src/plugins/sync/**` 只定义 Markdown Page、Metadata、Event、Filter 和 Plugin Settings DTO snapshots 的 syncable unit descriptors/serializers，本地 plugin indexes 被标记为 rebuildable derived data，conflict policy 规定 mutable units 需要 manual resolution、event units append-only union/dedupe/same-id conflict。Plugin Settings 只是 DTO snapshot，不表示 settings UI、settings persistence 或 secret storage 已存在；top-level/nested secret、auth、credential、remote-endpoint-like keys are rejected, and future settings sync needs explicit allowlists plus keychain separation.

以下能力仍属于后续 Plugin Platform 工作，不属于 TASK-010 当前 API contract：

```text
Markdown Block Renderer
Inline Token
Metadata Field Renderer
Metadata Field Editor
Background Worker
AI Tool
Import / Export Handler
Keyboard Shortcut
```

---

## 8. Plugin 生命周期

TASK-010 当前 API contract 覆盖的生命周期：

```text
install
activate
register
deactivate
uninstall
```

`migrate`、`index`、`render` 仍是后续 Plugin Host / Plugin Platform 的生命周期或运行时能力，不属于当前 TASK-010 API contract。

### 8.1 install

首次安装插件时运行。

创建：

```text
metadata field definitions
event type definitions
default filters
default views
plugin settings panel definitions
indexer definitions
```

### 8.2 activate

App 启动或用户启用插件时运行。

### 8.3 register

当前 `register(ctx)` 通过 `ctx.commands.register`、`ctx.views.register` 和 `ctx.slots.register` 注册可执行或可渲染能力，并可通过 `ctx.pages`、`ctx.metadata`、`ctx.events`、`ctx.filters` 和 `ctx.transaction` 操作 Core 数据。
Plugin-facing 注册输入不携带 `pluginId` 或 `sourcePluginId`；这些 ownership key 由 Plugin Host 根据当前插件身份注入。

以下能力在 TASK-010 中是 manifest contribution descriptor，不是当前 `ctx.*.register` facade：

```text
metadata fields
event types
filters
markdown syntax
indexers
algorithms
mobile toolbar items
settings panels
```

### 8.4 deactivate

停用插件能力，但保留数据。

### 8.5 uninstall

卸载插件。默认保留数据，除非用户明确清理插件数据。

---

## 9. Plugin Runtime

Plugin Runtime 需要提供以下系统能力。

### 9.1 Plugin Registry

记录所有插件：

```text
plugin_id
name
version
enabled
manifest
permissions
settings
```

### 9.2 Command Registry

插件注册命令：

```text
command_id
title
plugin_id
handler
shortcut
available_context
```

示例：

```text
task.insert_task_syntax
task.toggle-status
tag.refresh-tags
tag.add-tag
tag.remove-tag
tag.create-filter
timer.start
timer.stop
timer.pause
timer.resume
timer.switch
timer.add-note
habit.refresh-habit
habit.check-today
habit.uncheck-today
habit.set-frequency
stats.run-aggregation
ml.run-prediction
ai.generate-subtasks
```

### 9.3 View Registry

插件注册 View：

```text
view_type
plugin_id
renderer
accepted_data_shape
default_filter
```

示例：

```text
calendar.week
heatmap.calendar
chart.bar
chart.line
chart.pie
timer.timeline
ml.prediction-panel
```

### 9.4 Metadata Registry

插件注册字段：

```text
field_id
namespace
key
value_type
default_value
renderer
editor
indexable
filterable
```

其中 `renderer` / `editor` 属于后续 UI 扩展能力；TASK-010 当前 contract 只定义 metadata field contribution 的基础字段。

示例：

```text
task.status
task.due
task.scheduled
task.estimate
tag.tags
habit.enabled
habit.frequency
habit.lastCheckedAt
habit.nextDue
timer.total_tracked_time (deferred after TASK-026)
ml.predictedRemainingTime
ai.summary
ai.suggestedTags
ai.suggestedEstimate
```

TASK-030 当前声明 `ml.predictedRemainingTime` 和 `ml.predictionConfidence` metadata descriptors，但 `ml.run-prediction` 只返回 deterministic prediction DTO，不会基于 caller-provided projections 写入 durable ML metadata。实际持久化预测结果 deferred until a trusted query/feed/projection source exists.

TASK-021 当前 `tag.tags` 由 Tag Plugin 维护为 `json` metadata field，值是小写、不带 `#` 的 ASCII slug `string[]`，最多 32 个唯一值。TASK-023 后，这个可见 tag UI 仍是 Tag Plugin 注册到 `page.header.metadata` 的 `TagMetadataSlot` slot contribution，并可由 `MetadataBar` 统一组合；它不是 manifest renderer/editor。

TASK-022 当前 `task.scheduled` 和 `task.due` 是 `valueType: "date"` metadata field，存储 local `YYYY-MM-DD` 字符串。Today filter 使用 relative-date query value `{ kind: "relative-date", value: "today" }` 与这些 date metadata 比较；日期选择器、`@date` parser 和 `task.set_due` / `task.set-due` command 仍是后续范围。

TASK-023 through TASK-027 当前交付的 Metadata UI、Timer Start/segment、Calendar、Habit 和 Heatmap baseline slices：

- Built-in `metadata-ui` plugin exists and exports `MetadataBar`.
- `MetadataBar` composes `page.header.metadata` slot contributions in SlotRegistry order. TASK-039 mounts this public `metadata-ui` component in production app-shell page routes below the route title and above the editor; saved-filter and placeholder routes still do not receive page metadata slot UI.
- Field UI remains plugin-driven through slot contributions. Manifest `metadataFields` only provide ownership/descriptor data for trust filtering.
- `MetadataBar` requires an owner-aware `MetadataBarCommandRegistry` for command descriptor lookup. It passes narrow props to slot components: `pageId`, contributing `pluginId`, trusted owner field descriptors, trusted owner values, and a command executor that only dispatches commands whose registered descriptor owner matches the contributing plugin. If descriptor lookup is unavailable, missing, malformed, throws, or resolves to another owner, execution fails closed before dispatch.
- It fails closed without Plugin Host ownership data, filters trusted metadata by active owner manifest plus matching `sourcePluginId` / descriptor / `valueType`, rejects unsafe namespace/key/valueType data, stores trusted values in a prototype-safe object, and renders values through React text sinks.
- Current built-in contributors are Tag, Task, and Timer controls: Tag add/remove controls keep using Tag commands; Task current fields are read-only; Timer contributes an enabled Start control that executes descriptor-owned `timer.start`.
- Calendar contributes registered views, not metadata fields: built-in `calendar` registers `calendar.day` / `calendar.week`, accepts `calendar.time-segments` DTOs, and keeps direct Timer event reads plus persistent Calendar feed work deferred. TASK-042 mounts the app-shell Calendar route by passing explicit transient projections into these registered views.
- Habit contributes metadata fields and command-driven completion: built-in `habit` recognizes `#habit`, writes `habit.enabled` / `habit.frequency` / `habit.lastCheckedAt` / `habit.nextDue`, registers `habit.refresh-habit` / `habit.check-today` / `habit.uncheck-today` / `habit.set-frequency`, and saves Habits / Today Habits filters.
- Heatmap contributes a registered view, not Habit-owned behavior: built-in `heatmap` registers `heatmap.calendar`, accepts `heatmap.date-series` DTOs, and keeps Habit event normalization in caller/view-host code.

Full metadata renderer/editor registry, rich field widgets, date picker, estimate editor semantics, Timer tracked-total metadata, save-time scanning/indexing, Habit/Heatmap app-shell route/feed, and persistent Calendar feeds remain deferred. TASK-039 mounts Timer's `page.timeline` segment/note slot only on trusted page routes through `SlotHost` with `{ page: { id, title } }`, and mounts `global.floating` through MUI `Portal` with a timer-owned Pause / Resume / Stop command facade using exact `{}` payloads. TASK-026 adds Calendar day/week rendering only when a caller supplies normalized data to the registered view; TASK-042 is the current app-shell caller that supplies bounded `calendar.time-segments` route projections. TASK-027 adds Habit commands/filters and Heatmap rendering only when callers provide normalized data to the registered view.

Metadata owner reservation 规则：

- Plugin Host 只从 complete valid `metadataFields` descriptors 派生 reservation。
- Descriptor 的 `namespace` 必须等于 declaring manifest id，`namespace` / `key` 必须是 metadata-safe segment，`valueType` 必须是有效 metadata value type。
- malformed、non-array 或 incomplete descriptors 不会 reserve namespace，也不应让 lifecycle 以 untyped failure 退出。
- `loadBuiltInPlugins()` 会在同一批内置插件 install/register 写入前先 stage valid reservations，包括 transaction-scoped writes。
- dotted plugin id 不能 reserve 同名 metadata namespace，因为当前 metadata namespace segment 不允许点号。

### 9.5 Event Registry

插件注册事件类型：

```text
event_type
namespace
payload_schema
indexing_strategy
```

示例：

```text
namespace=task, type=completed
namespace=task, type=reopened
timer.started
timer.paused
timer.resumed
timer.stopped
namespace=timer, type=time_segment_created
namespace=timer, type=time_segment_note_added
namespace=habit, type=checked
namespace=habit, type=unchecked
namespace=ml, type=prediction-generated
namespace=ai, type=suggestion-generated
namespace=ai, type=summary-generated
```

### 9.6 Algorithm Registry

机器学习、推荐、预测、排序的长期目标可以通过 Algorithm Registry 接入。
当前 TASK-030 没有 executable AlgorithmRegistry、runtime algorithm handler 或 per-algorithm execution facade；`algorithms` 仍是 manifest contribution descriptors。ML baseline 的 runtime execution path 是 `CommandRegistry.execute("ml.run-prediction", { algorithmId, input })`。

```text
algorithm_id
plugin_id
input_schema
output_schema
trigger
handler
```

示例：

```text
ml.predict-remaining-time
ml.recommend_best_work_time
ml.detect_time_estimate_bias
ml.rank_today_tasks
ml.cluster_similar_tasks
```

---

## 10. Tauri Plugin 与 App Plugin 的关系

系统里有两类插件：

### 10.1 App Domain Plugin

这是产品插件。

包括：

```text
Task Plugin
Habit Plugin
Timer Plugin
Stats Plugin
Chart Plugin
Machine Learning Plugin
AI Plugin
Calendar Plugin
Heatmap Plugin
```

它们处理产品语义。

### 10.2 Tauri Native Plugin

这是底层系统能力。

包括：

```text
SQLite
File System
Global Shortcut
Notification
Updater
Window
Tray
Sync networking
```

Tauri v2 本身支持插件开发、插件命令、生命周期 hook 和权限控制；它的 capability 机制用于控制窗口或 webview 能访问哪些 core、app 或 plugin commands。这个产品的 App Plugin 不一定都要做成 Tauri Native Plugin，但涉及系统能力的部分，例如全局快捷键、文件系统、通知、SQLite、同步，可以通过 Tauri 插件或 Rust command 暴露。([Tauri](https://v2.tauri.app/develop/plugins/ "Plugin Development | Tauri"))

---
