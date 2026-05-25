# Core 数据模型

定义 Core 直接拥有的 Markdown Page、Metadata、Event、Filter、View Registry 和 Command Registry。

## 4. Core 数据模型

### 4.1 Markdown Page

Markdown Page 是系统最基础的内容单位。

任何东西最终都落在某个 Markdown Page 上：

- 普通笔记；

- 项目页面；

- 任务页面；

- 子任务页面；

- 习惯任务页面；

- AI 生成页面；

- 快速收集箱页面；

- 统计说明页面；

- Time Segment Note 页面。


基础结构：

```text
MarkdownPage
- id
- title
- parent_page_id
- markdown_body / structured_markdown_doc
- created_at
- updated_at
- archived_at
```

编辑器可以用 Tiptap / ProseMirror 存结构化文档，但产品语义仍然是 Markdown Page。

---

### 4.2 Metadata

Metadata 是页面上的结构化字段。

字段可以由用户编辑，也可以由插件自动写入。

基础结构：

```text
Metadata
- id
- page_id
- namespace
- key
- value
- value_type
- source_plugin_id
- created_at
- updated_at
```

示例：

```text
page_id: xxx
namespace: task
key: status
value: todo
```

```text
page_id: xxx
namespace: tag
key: tags
value: ["product", "timer"]
value_type: json
```

TASK-021 当前由 Tag Plugin 写入 `namespace: "tag"`、`key: "tags"`、`value_type: "json"`。值必须是规范化后的 `string[]`：不带 `#`、小写 ASCII slug、最多 32 个唯一 tag，并按第一次出现顺序保存。Core 只保存该 JSON 值，不解释 tag 语义。

```text
page_id: xxx
namespace: timer
key: total_tracked_time
value: 7200
```

Core 只保存 metadata。
字段含义由插件解释。

---

### 4.3 Event

Event 是系统中发生过的事实。

基础结构：

```text
Event
- id
- page_id
- namespace
- type
- payload
- created_at
- source_plugin_id
```

示例：

```text
namespace: task
type: completed
payload: { done_at: "2026-05-19T10:00:00" }
```

```text
namespace: timer
type: time_segment_created
payload: {
  segmentId: "seg_xxx",
  pageId: "page_xxx",
  startAt: "2026-05-19T10:00:00.000Z",
  endAt: "2026-05-19T10:47:00.000Z",
  durationSeconds: 2820,
  source: "timer"
}
```

TASK-025 当前 Timer finalization path 会追加 `namespace: "timer"`、`type: "time_segment_created"` event。Note link 不会回写到原始 segment event；`timer.add-note` 通过 `namespace: "timer"`、`type: "time_segment_note_added"` event 关联 Markdown Page note。

```text
namespace: habit
type: checked
payload: { date: "2026-05-19" }
```

Core 只记录 event。
事件如何影响 UI、统计、图表、机器学习，由插件处理。

---

### 4.4 Filter

Filter 是保存的查询定义。

基础结构：

```text
Filter
- id
- name
- query
- sort
- group
- view_type
- created_at
- updated_at
```

示例：

```text
name: All Tasks
query:
  metadata.task.enabled = true
view_type: page.list
```

```text
name: Habits
query:
  metadata.habit.enabled = true
```

```text
name: Recently Worked
query:
  events.timer.time_segment_created within 7 days
```

Filter 查询 Markdown Page、Metadata 和 Event。TASK-022 当前交付的 `executeFilterQuery` 是 data-only current page/metadata executor：它执行 metadata field paths、`eq` / `neq` / `gt` / `lt` / `includes` / `exists`、`and` / `or`，并排除 archived pages。Event/plugin-index 查询、`within` 的 Event 语义、排序/分组、JS filters 和 app-shell route wiring 仍是后续范围。

---

### 4.5 View Registry

View Registry 负责注册视图类型。

视图类型包括：

```text
list
table
calendar
timeline
heatmap
chart
focus
board
custom
```

View 本身由插件提供。

例如：

```text
Habit Plugin 注册 heatmap view
Timer Plugin 注册 timeline view
Calendar Plugin 注册 calendar view
Stats Plugin 注册 chart view
ML Plugin 注册 prediction view
```

Core 只维护 view registry，不实现具体业务视图。

---

### 4.6 Command Registry

Command Registry 负责注册命令。

命令是用户动作或系统动作。

示例：

```text
insert-task-syntax
open-page
task.toggle-status
timer.start
timer.stop
timer.pause
timer.resume
timer.switch
timer.add-note
tag.refresh-tags
tag.add-tag
tag.remove-tag
set-due-date
tag.create-filter
run-ml-prediction
generate-ai-summary
```

Core 不实现这些命令的业务逻辑。
Core 只负责命令注册、发现、调用、快捷键绑定和命令面板展示。

---
