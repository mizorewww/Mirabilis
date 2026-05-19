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
    "viewSlots": [],
    "indexers": [],
    "algorithms": []
  }
}
```

Manifest 用来声明插件能给系统贡献什么。

---

## 7. Plugin 可以贡献的能力

插件可以注册以下能力：

```text
1. Markdown Syntax
2. Markdown Block Renderer
3. Inline Token
4. Metadata Field
5. Metadata Field Renderer
6. Metadata Field Editor
7. Event Type
8. Command
9. Filter
10. View
11. View Slot Contribution
12. Indexer
13. Algorithm
14. Background Worker
15. AI Tool
16. Import / Export Handler
17. Settings Panel
18. Keyboard Shortcut
19. Mobile Toolbar Button
```

这意味着：

- `- [ ]` 是 Task Plugin 注册的 Markdown Syntax；

- `#tag` 是 Tag Plugin 注册的 Inline Token；

- `#habit` 是 Habit Plugin 识别的语义；

- 计时段是 Timer Plugin 注册的 Event Type；

- 热力图是 Heatmap Plugin 注册的 View；

- 各种统计图是 Chart / Stats Plugin 注册的 View；

- 机器学习预测是 Machine Learning Plugin 注册的 Algorithm；

- AI 任务拆解是 AI Plugin 注册的 Command / AI Tool；

- 日历是 Calendar Plugin 注册的 View；

- 快速收集箱是 Quick Capture Plugin 注册的入口和命令。


---

## 8. Plugin 生命周期

插件生命周期：

```text
install
activate
register
migrate
index
render
deactivate
uninstall
```

### 8.1 install

首次安装插件时运行。

创建：

```text
metadata field definitions
event type definitions
default filters
default views
plugin settings
indexes
```

### 8.2 activate

App 启动或用户启用插件时运行。

### 8.3 register

向 Core 注册能力：

```text
commands
views
metadata fields
event types
filters
markdown syntax
renderers
indexers
algorithms
```

### 8.4 migrate

插件升级时迁移自己负责的数据。

### 8.5 index

插件根据 Markdown Page、Metadata、Event 建立索引。

### 8.6 render

插件在 Core 提供的 View Slot 中渲染 UI。

### 8.7 deactivate

停用插件能力，但保留数据。

### 8.8 uninstall

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
task.toggle_checkbox
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
task.completed
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
