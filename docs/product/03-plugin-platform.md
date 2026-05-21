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
其中只有 `commands`、`views`、`slots` 有当前 plugin-facing `register/get/list` facade；`metadataFields`、`eventTypes`、`indexers`、`algorithms`、`mobileToolbarItems`、`settingsPanels` 目前由 manifest 描述，后续 Plugin Host / Plugin Platform 再把它们接成可执行或可渲染运行时能力。

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

- `#habit` 是 Habit Plugin 识别的语义；

- 计时段是 Timer Plugin 注册的 Event Type；

- 热力图是 Heatmap Plugin 注册的 View；

- 各种统计图是 Chart / Stats Plugin 注册的 View；

- 机器学习预测是 Machine Learning Plugin 注册的 Algorithm；

- AI 任务拆解当前是 AI Plugin 注册的 Command；AI Tool 是后续扩展；

- 日历是 Calendar Plugin 注册的 View；

- 快速收集箱是 Quick Capture Plugin 注册的入口和命令。

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
timer.start_timer
timer.stop_timer
habit.check_today
stats.open_review
ml.predict_remaining_time
ai.generate_subtasks
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
habit.heatmap
stats.bar_chart
stats.line_chart
timer.timeline
ml.prediction_panel
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
timer.total_tracked_time
ml.predicted_remaining_time
```

TASK-021 当前 `tag.tags` 由 Tag Plugin 维护为 `json` metadata field，值是小写、不带 `#` 的 ASCII slug `string[]`，最多 32 个唯一值。Metadata field contribution 只声明字段形状；完整 renderer/editor registry 仍属于后续 Metadata UI 工作。TASK-021 的可见 tag UI 是单独注册到 `page.header.metadata` 的 `TagMetadataSlot` slot contribution。

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
timer.stopped
timer.time_segment_created
habit.checked
ml.prediction_generated
ai.summary_generated
```

### 9.6 Algorithm Registry

机器学习、推荐、预测、排序都通过 Algorithm Registry 接入。

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
ml.predict_task_remaining_time
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
