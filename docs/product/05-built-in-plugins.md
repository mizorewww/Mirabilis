# 内置插件产品设计

集中描述 Tag、Task、Habit、Timer、Calendar、Stats、Chart、ML、AI、Filter 和 Quick Capture 等内置插件的产品语义。

## 15. Tag Plugin

Tag Plugin 是内置插件，manifest id 是 `tag`。TASK-021 当前交付的是显式命令驱动的 tag baseline，不是保存时自动索引、富 inline token UI、autocomplete、全局 metadata bar 或完整 filter result 渲染。

### 15.1 当前注册能力

TASK-021 当前通过 `BUILT_IN_PLUGINS` 注册 `TagPlugin`，manifest 贡献：

```text
Markdown Syntax:
tag.hashtag
syntax: #tag

Metadata Field:
id: tag.tags
namespace: tag
key: tags
valueType: json
value: string[]
```

`tag.tags` 的值是规范化后的 `string[]`，不带 `#`。Tag grammar 是保守 ASCII slug：

- 输入先 `trim`，最多剥掉一个前导 `#`。
- raw 输入必须先匹配 ASCII slug，再 lower-case；不会先做 Unicode case folding。
- 第一个字符必须是 ASCII letter/digit；后续只允许 ASCII letter/digit、`_`、`-`。
- 规范化值全部小写，最长 32 字符。
- 每页最多保存 32 个唯一 tag，按第一次出现顺序去重。
- 非 ASCII 和类似 `K` 这类值会被拒绝，而不是 case-fold 成 ASCII。

### 15.2 Markdown 输入

用户写：

```markdown
- [ ] 写 Timer Plugin #architecture #timer
```

TASK-021 不在保存时自动扫描正文。调用方必须显式执行：

```ts
runtime.commands.execute("tag.refresh-tags", { pageId });
```

`tag.refresh-tags({ pageId })` 扫描已保存的结构化 `markdown.line` blocks，并把该页的 `tag.tags` 精确替换为当前 source tags；没有 source tags 时也写入显式空数组 `[]`。

识别结果：

```text
tags = ["architecture", "timer"]
```

扫描会忽略 heading 行、fenced code、escaped hash、非 token 边界的 `foo#bar`、URL-ish / invalid source token、HTML-like fragment 内的 `#tag`、非 ASCII token 和 control-ish token。

### 15.3 UI 添加

TASK-021 注册 `page.header.metadata` slot contribution：

```text
id: tag.page-header-metadata.tags
order: 300
component: TagMetadataSlot
```

当前 `TagMetadataSlot` 显示 inert `#tag` 文本 chip，并提供 add/remove 控件。它通过命令更新页面 scoped metadata：

```text
tag.add-tag({ pageId, tag })
tag.remove-tag({ pageId, tag })
```

这不是 TASK-023 的完整 Metadata UI Plugin，也不是全局 metadata bar 或完整 tag picker。长期 tag picker、autocomplete 和统一 metadata field editor 仍属于后续任务。

添加 `product` 后：

```text
tags = ["architecture", "timer", "product"]
```

移除已存在或缺失的 tag 都会写入该页的显式 `tag.tags` 值；移除后没有 tag 时保存 `[]`。

### 15.4 Filter 定义

TASK-021 当前提供：

```ts
runtime.commands.execute("tag.create-filter", { tag: "architecture" });
```

该命令保存一个 Tag Plugin 拥有的 filter definition：

```json
{
  "name": "#architecture",
  "query": {
    "where": [
      {
        "field": "metadata.tag.tags",
        "op": "includes",
        "value": "architecture"
      }
    ]
  },
  "viewType": "page.list"
}
```

Filter result execution 和渲染仍属于 TASK-022+。

长期 Tag Plugin 还会负责：

```text
tag autocomplete
tag index
tag-based stats
```

---

## 16. Task Plugin

Task Plugin 是一个插件，不是 Core 功能。

### 16.1 注册能力

TASK-018/TASK-020 当前已经交付的注册能力：

```text
Markdown Syntax:
- [ ]

Metadata:
task.enabled
task.status
task.sourcePageId
task.sourceBlockId

Commands:
task.resolve-task-block
task.open-task-page
task.toggle-status
```

`task` 是内置插件。manifest 暴露 `task.checkbox` markdown syntax descriptor，语法文本为 `- [ ]`；descriptor 只是编辑器扩展 metadata，不会自己创建任务页。`task.resolve-task-block` 是命令级 resolver，payload 为：

```ts
{
  sourcePageId: string;
  sourceBlockId: string;
}
```

resolver 从当前 source block 派生任务标题，创建或复用任务页，并把 source block 复制更新为带 `attrs.boundPageId` 的 block。重复执行同一 `(sourcePageId, sourceBlockId)` 不会创建重复任务页。

TASK-019 新增 `task.open-task-page`。它使用同一个 payload：

```ts
{
  sourcePageId: string;
  sourceBlockId: string;
}
```

open command 与 `task.resolve-task-block` 共享 resolver/source relation 行为，但返回值收窄为：

```ts
{
  pageId: string;
}
```

UI/editor 点击任务标题时只发送 source page/block 身份，并只打开 command 返回的 `pageId`。`attrs.boundPageId` 是经过 Task Plugin 验证或恢复的 source binding 数据；它不是受信任的导航目标。伪造、不匹配或 malformed `boundPageId` 都按未绑定/不可信处理。

当前能力与后续范围：

```text
Markdown Syntax:
Task Plugin reads - [ ], - [x], and - [X] source task lines for open/toggle

Events:
namespace=task, type=completed
namespace=task, type=reopened
task.renamed

Commands:
task.insert_task_syntax
task.toggle-status
task.set_due
task.set_estimate

Filters:
All Tasks
Today
Overdue
Done
No Estimate
Unlinked Tasks

Views:
task.list_item
task.metadata_fields
```

TASK-020 已实现 checkbox status toggle 和完成/重开 events。`task.due`、`task.scheduled`、`task.estimate`、`task.priority`、完成时间 metadata、filters、views、`task.renamed` 和非 toggle commands 仍是后续 Task Plugin 范围；后续新增 task metadata 时应继续使用 camelCase key。当前 command ID 使用 kebab-case：`task.resolve-task-block`、`task.open-task-page`、`task.toggle-status`。

### 16.2 输入到任务页面的完整流程

用户输入：

```markdown
- [ ] 写快速收集箱交互 #product
```

流程：

```text
Markdown Page 更新
TASK-017 保存为带稳定 blockId 的 markdown.line blocks
TASK-018 可执行 task.resolve-task-block({ sourcePageId, sourceBlockId })
Task Plugin 校验 source block 是未完成任务语法 - [ ] ...
Task Plugin 创建或复用任务对应 Markdown Page
Task Plugin 写入 task.enabled、task.status、task.sourcePageId、task.sourceBlockId
Task Plugin 通过 source block attrs.boundPageId 记录 source relation
TASK-019 可执行 task.open-task-page({ sourcePageId, sourceBlockId }) 并返回 { pageId }
TASK-020 可执行 task.toggle-status({ sourcePageId, sourceBlockId }) 并返回 { pageId, status }
Task Plugin 将 - [ ] 完成写回 - [x]，将 - [x] / - [X] 重开写回 - [ ]
Task Plugin 更新 task.status，并追加 namespace: "task", type: "completed" 或 "reopened" event
```

当前不会因为保存 Markdown Page 自动扫描所有 task block；也不会处理 `#product`、自动刷新 All Tasks / Today / Tag Filter，或注册任务列表渲染项。这些属于后续 Tag、Filter、View 和 editor integration 任务。`task.open-task-page` 可以为尚未绑定的 checked source task line 创建、绑定并打开 status 为 `done` 的任务页，且不会写 completion/reopen event；`task.resolve-task-block` 仍只接受 unchecked `- [ ]` source task line。

### 16.3 点击逻辑

任务行：

```text
☐ 写快速收集箱交互
```

点击 checkbox：

```text
Command: task.toggle-status
Payload: { sourcePageId, sourceBlockId }
Return: { pageId, status }
Markdown: - [ ] -> - [x]，- [x] / - [X] -> - [ ]
Metadata: task.status 更新为 todo 或 done
Event: namespace: "task", type: "completed" 或 "reopened"
```

点击文字：

```text
Command: task.open-task-page
Payload: { sourcePageId, sourceBlockId }
Return: { pageId }
Target: command 返回的 Markdown Page
```

点击文字打开任务页是 TASK-019 当前行为；点击 checkbox 切换 source task line 状态是 TASK-020 当前行为。Markdown 编辑器只在 task syntax extension 存在、当前 Markdown 与结构化 body 快照一致时显示 task-title 按钮和 checkbox 控件；loaded `pageId/pageFacade` 模式从 runtime Markdown page facade 携带结构化 `body`，因此重新打开的页面也能显示按钮和 checkbox。若用户在未保存 textarea 中删除或改名任务行，旧控件会隐藏；若 `task.open-task-page` 或 `task.toggle-status` 的异步结果在页面切换或内容变化后才返回，结果会被忽略。

filters 和 task views 尚未实现。

---

## 17. Habit Plugin

Habit Plugin 是插件。

它不进入 Core。

### 17.1 创建习惯

用户写：

```markdown
- [ ] 每天复盘 10 分钟 #habit
```

Habit Plugin 识别 `#habit`，写入：

```text
habit.enabled = true
habit.frequency = daily
```

这个页面仍然是任务页面。

### 17.2 注册能力

Habit Plugin 注册：

```text
Metadata:
habit.enabled
habit.frequency
habit.target
habit.streak
habit.last_checked_at

Events:
habit.checked
habit.unchecked
habit.skipped

Commands:
habit.check_today
habit.uncheck_today
habit.set_frequency

Filters:
Habits
Today Habits
Habit Review

Views:
habit.list
habit.heatmap
habit.card
```

### 17.3 习惯完成

用户点击 habit 任务的 checkbox。

Habit Plugin 处理：

```text
Event: habit.checked
Payload: { date: today }
```

第二天：

```text
Today Habits Filter 重新显示该 habit 为待完成
```

### 17.4 热力图

热力图不是 Core 功能。
热力图由 Habit Plugin 或 Heatmap Plugin 注册 View。

```text
View: habit.heatmap
Data: habit.checked events
```

---

## 18. Timer Plugin

Timer Plugin 是核心体验插件，但仍然不是 Core 功能。

### 18.1 计时的重要性

计时是这个产品的关键差异化。

任务告诉用户：

```text
我要做什么
```

计时告诉用户：

```text
我真实做了什么
做了多久
为什么做
做到哪里
哪里卡住
下一步是什么
```

每段计时都生成 Time Segment。
每个 Time Segment 都可以写 Note。

---

### 18.2 Timer Plugin 注册能力

```text
Metadata:
timer.total_tracked_time
timer.last_tracked_at
timer.active_segment_id

Events:
timer.started
timer.paused
timer.resumed
timer.stopped
timer.time_segment_created
timer.time_segment_note_added
timer.time_segment_adjusted

Commands:
timer.start
timer.stop
timer.pause
timer.resume
timer.switch
timer.add_note
timer.edit_segment
timer.create_manual_segment

Filters:
Tracked Today
Tracked This Week
Recently Worked
Long Sessions
Unnoted Sessions

Views:
timer.timeline
timer.segment_detail
timer.active_bar
```

---

### 18.3 Time Segment

Time Segment 是 Timer Plugin 管理的事件实体。

结构：

```text
TimeSegment
- id
- page_id
- start_at
- end_at
- duration
- note_page_id
- source: timer | manual
- created_at
- updated_at
```

Note 是一个 Markdown Page：

```markdown
# Time Segment Note

刚才主要在重新想插件系统：
- Core 只保留 Markdown Page / Metadata / Event / Filter / View registry / Command registry
- 任务、习惯、热力图、统计和 ML 都要通过 plugin 接入
```

### 18.4 开始计时

用户在任务页面点击 Start。

系统：

```text
Command: timer.start
Event: timer.started
Metadata: timer.active_segment_id = xxx
View: global active timer bar 显示
```

全局计时器：

```text
设计 Timer Plugin · 00:23:18
Pause · Stop · Note · Switch
```

### 18.5 计时中写 Note

用户点击 Note：

```text
刚发现 heatmap 也应该是 View Plugin，不应该写死。
```

Timer Plugin 把这段文字写到当前 Time Segment 的 Note Page。

### 18.6 停止计时

用户点击 Stop。

系统：

```text
Event: timer.stopped
Event: timer.time_segment_created
Metadata: timer.total_tracked_time 更新
Metadata: timer.last_tracked_at 更新
Calendar Plugin 收到可展示数据
Stats Plugin 收到可统计数据
ML Plugin 后续可使用该数据
```

---

## 19. Calendar Plugin

Calendar 是插件。

### 19.1 Calendar Plugin 注册能力

```text
Views:
calendar.day
calendar.week
calendar.month

Commands:
calendar.create_manual_segment
calendar.edit_time_block
calendar.open_time_segment

Accepted Data Shape:
start_at
end_at
title
page_id
event_id
color
description
```

### 19.2 Calendar 展示 Time Segment

Calendar View 展示 Timer Plugin 产生的 Time Segment：

```text
10:00–10:47 设计 Timer Plugin
14:00–14:45 写 Field Plugin
21:00–21:50 整理 ML Plugin
```

点击时间块，打开 Time Segment 详情。

### 19.3 Calendar 也能展示其他插件数据

Task Plugin 可以把 scheduled / due 任务送入 Calendar。
Habit Plugin 可以把 habit checked event 送入 Calendar。
Timer Plugin 把 Time Segment 送入 Calendar。

Calendar Plugin 只负责渲染时间轴。

---

## 20. Stats Plugin 与 Chart Plugin

统计也全部插件化。

### 20.1 Stats Plugin 注册能力

```text
Aggregations:
sum_time_by_tag
sum_time_by_page
sum_time_by_parent_page
estimate_vs_actual
habit_completion_rate
task_switch_count
longest_focus_session
recently_stalled_tasks
unnoted_sessions_count

Filters:
Planning Review
Weekly Review
Estimate Error
Recently Stalled
Unnoted Sessions

Views:
stats.dashboard
stats.insight_card
```

### 20.2 Chart Plugin 注册图表视图

各种图都由 Chart Plugin 或 Stats 子插件注册：

```text
bar_chart
line_chart
pie_chart
heatmap_chart
scatter_plot
calendar_heatmap
timeline_chart
```

示例：

```text
Stats Plugin 提供数据：
time by tag

Chart Plugin 提供 View：
bar chart
pie chart
stacked bar
```

### 20.3 估时偏差

任务有：

```text
task.estimate = 45m
timer.total_tracked_time = 2h10m
```

Stats Plugin 生成：

```text
estimate_error = +188%
```

Planning Review Filter 显示：

```text
设计 Timer Plugin
预估 45m
实际 2h10m
偏差 +188%
```

---

## 21. Machine Learning Plugin

机器学习算法也通过 Plugin 接入。

### 21.1 ML Plugin 注册能力

```text
Algorithms:
ml.predict_remaining_time
ml.recommend_next_task
ml.detect_best_work_time
ml.detect_estimate_bias
ml.cluster_similar_tasks
ml.rank_today_tasks

Metadata:
ml.predicted_remaining_time
ml.prediction_confidence
ml.best_work_time
ml.estimate_bias_score

Events:
ml.prediction_generated
ml.recommendation_generated

Views:
ml.prediction_panel
ml.recommendation_card
ml.explanation_panel

Commands:
ml.run_prediction
ml.refresh_models
```

### 21.2 任务剩余时间预测

输入：

```text
task.estimate
timer.total_tracked_time
child task completion
tag history
similar task history
recent work velocity
Time Segment Notes
```

输出：

```text
预计剩余 6–9 小时
置信度 0.72
主要原因：
- 子任务完成 4/9
- 同类 #architecture 任务平均超时 35%
- 最近 Note 多次提到“重新设计插件架构”
```

### 21.3 哪一天做什么最高效

ML Plugin 可以分析：

```text
time segments
task tags
completion events
focus duration
task switching
time of day
habit completion
```

输出：

```text
上午更适合 #writing
晚上更适合 #architecture
下午容易发生任务切换
```

这些都作为插件输出。
Core 不包含算法逻辑。

---

## 22. AI Plugin

AI Plugin 通过 Command / View / Metadata 接入。

### 22.1 AI Plugin 注册能力

```text
Commands:
ai.cleanup_inbox
ai.turn_text_into_task
ai.suggest_tags
ai.suggest_due_date
ai.generate_subtasks
ai.generate_filter
ai.summarize_time_notes
ai.generate_weekly_review
ai.explain_prediction

Metadata:
ai.summary
ai.suggested_tags
ai.suggested_estimate

Events:
ai.suggestion_generated
ai.summary_generated

Views:
ai.suggestion_panel
ai.review_panel
```

### 22.2 快速收集箱 AI

用户输入：

```text
明天下午把计时插件的交互写完，属于产品设计
```

AI Plugin 建议：

```markdown
- [ ] 写完计时插件交互 #product #timer
```

Metadata 建议：

```text
task.scheduled = 明天下午
task.estimate = 1h
```

用户接受后，由 Task Plugin、Tag Plugin、Metadata 系统落地。

---

## 23. Filter Plugin

Filter 是 Core 数据类型，但 Filter 的高级能力由 Filter Plugin 扩展。

### 23.1 内置 Filter

插件可以注册默认 Filter：

```text
Task Plugin:
- All Tasks
- Today
- Done
- Overdue
- No Estimate

Habit Plugin:
- Habits
- Today Habits

Timer Plugin:
- Recently Worked
- Tracked Today
- Unnoted Sessions

Stats Plugin:
- Planning Review
- Recently Stalled

ML Plugin:
- Recommended Next Tasks
```

### 23.2 JS Filter

JS Filter 是高级插件能力。

示例：

```javascript
item.metadata.task?.enabled &&
!item.metadata.task?.done &&
item.metadata.tag?.tags?.includes("product") &&
item.aggregates.timer?.lastTrackedWithinDays <= 7
```

JS Filter 用来实现：

```text
系统存储的一切内容都可以被筛选
```

---

## 24. Quick Capture Plugin

快速收集箱也是 Plugin。

### 24.1 注册能力

```text
Commands:
quick_capture.open
quick_capture.save
quick_capture.save_and_open

Views:
quick_capture.modal
quick_capture.mobile_input

Metadata:
inbox.unprocessed

Filters:
Inbox
```

### 24.2 桌面端

用户按全局快捷键：

```text
打开快速输入框
```

输入：

```markdown
- [ ] 整理 plugin registry 设计 #architecture
```

保存后进入 Inbox Page，同时 Task Plugin 创建任务页面。

### 24.3 移动端

打开快速输入，自动弹键盘。

工具栏：

```text
☐   #   @date   [[ ]]   /
```

这些按钮只插入 Markdown 语法。

---
