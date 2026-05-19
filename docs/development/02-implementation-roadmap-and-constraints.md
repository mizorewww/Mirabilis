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

实现：

```text
Tiptap editor
Structured Markdown document
Block ID
Basic Markdown nodes
Mobile toolbar
Editor slot
```

验收：

```markdown
文本123

- [ ] 任务1

文本456

- [ ] 任务2
```

可以正常输入、保存、重新打开。

---

### Phase 3：Task Plugin

实现：

```text
- [ ] syntax
TaskBlock
TaskBlock → Markdown Page
Checkbox toggle
Click title → open page
Task metadata
All Tasks Filter
Today Filter
```

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

---

### Phase 4：Metadata UI

实现：

```text
page.header.metadata slot
metadata field renderer
metadata field editor
tag picker
date picker
estimate editor
```

验收：

```text
todo · #tag · due · estimate · tracked · Start
```

全部能由插件贡献并点击编辑。

---

### Phase 5：Timer Plugin

实现：

```text
timer.start
timer.stop
timer.switch
global active timer bar
time segment event
time segment note page
page timeline
recently worked filter
unnoted sessions filter
```

---

### Phase 6：Calendar Plugin

实现：

```text
calendar.week
calendar.day
time segment block
click segment → segment detail
manual time segment
```

---

### Phase 7：Habit + Heatmap Plugins

实现：

```text
#habit
habit metadata
habit checked event
habit filter
heatmap view
```

---

### Phase 8：Stats + Chart Plugins

实现：

```text
aggregation algorithms
chart views
estimate vs actual
time by tag
time by page
habit completion
task switching
```

---

### Phase 9：ML Plugin

实现：

```text
feature builder
remaining time prediction
best work time detection
task ranking
similar task clustering
prediction panel
```

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
如果要响应任务完成，监听 `task.completed` event。

### 20.3 所有用户动作走 Command Registry

UI 不直接调用业务函数。

```ts
runtime.commands.execute("task.toggle-status", { pageId });
runtime.commands.execute("timer.start", { pageId });
runtime.commands.execute("ai.generate-subtasks", { pageId });
```

### 20.4 所有跨插件协作走 Event / Metadata / Query

```text
Task Plugin 写 task.completed event
Timer Plugin 监听后停止计时
Stats Plugin 监听后更新统计
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
    提供插件上下文

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

React App Shell
  负责：
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

用户写：

```markdown
文本123

- [ ] 任务1

文本456

- [ ] 任务2
```

代码层发生：

```text
MarkdownEditorPlugin 解析文档
TaskPlugin 识别 - [ ]
TaskPlugin 创建任务 Markdown Page
TagPlugin 识别 #tag
TimerPlugin 提供 Start
Metadata UI 显示插件字段
FilterEngine 聚合任务
ViewRegistry 渲染视图
```

用户点击任务进入页面，继续写：

```markdown
- [ ] 子任务
```

系统重复同样流程，因此任务可以无限嵌套。

这个架构的中心就是一句话：

> **Core 极小，Plugin 一等公民。所有产品能力都作为插件注册到 Core，而 Core 只维护 Markdown Page、Metadata、Event、Filter、View Registry、Command Registry 和 Plugin Host。**
