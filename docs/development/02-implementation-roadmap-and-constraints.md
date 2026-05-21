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

Phase 3 后续范围：

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

点击 A 进入 A 页面、A 页面写 `- [ ] B` 后点击 B 进入 B 页面，是 TASK-019 当前显式 click/open 行为。点击 checkbox 切换 source task line 状态并写 metadata/event 是 TASK-020 当前行为。保存后自动扫描/索引、All Tasks / Today filters、完整 Metadata UI、Task/Timer UI、rich editor behavior 和 native/package surfaces 仍是后续范围。

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
No save-time scan, background indexer, rich inline token UI, autocomplete, global metadata bar, or filter result rendering
No new Tauri IPC, permissions, filesystem, package, Cargo, Rust, or native surface
```

---

### Phase 4：Metadata UI

实现：

```text
page.header.metadata slot
metadata field renderer
metadata field editor
full tag picker
date picker
estimate editor
```

验收：

```text
todo · #tag · due · estimate · tracked · Start
```

全部能由插件贡献并点击编辑。TASK-021 已先交付 Tag Plugin 的窄 `page.header.metadata` slot contribution；Phase 4 / TASK-023 仍负责统一 metadata bar、renderer/editor runtime、完整 picker 和其他插件字段。

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

当前 TASK-018/TASK-020 代码流
  负责：
    TaskPlugin 注册 - [ ] markdown syntax descriptor
    TaskPlugin 注册 task.resolve-task-block
    TaskPlugin 注册 task.open-task-page
    TaskPlugin 注册 task.toggle-status
    Command Registry 执行 command
    Plugin Host 注入 command-time PluginContext
    TaskPlugin 通过 Core/plugin transaction 创建或复用任务页
    TaskPlugin 写 task metadata 并复制更新 source block attrs.boundPageId
    TaskPlugin 切换 source checkbox marker，更新 task.status，并追加 namespace/type task events
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

后续完整架构目标中，代码层会发生：

```text
MarkdownEditorPlugin 解析文档
TaskPlugin 识别 - [ ]
TaskPlugin 创建任务 Markdown Page
TagPlugin 通过显式 tag.refresh-tags 识别已保存 #tag
TimerPlugin 提供 Start
Metadata UI 显示插件字段
FilterEngine 聚合任务
ViewRegistry 渲染视图
```

这不是完整当前行为。TASK-018 当前只在调用 `runtime.commands.execute("task.resolve-task-block", { sourcePageId, sourceBlockId })` 时解析指定 unchecked source block，创建或复用任务页，写入 `task.enabled`、`task.status`、`task.sourcePageId`、`task.sourceBlockId`，并在验证 source relation 后通过 `attrs.boundPageId` 绑定 source block。TASK-019 当前在点击结构化 task title 时调用 `runtime.commands.execute("task.open-task-page", { sourcePageId, sourceBlockId })`，共享 source relation 行为，并只把返回的 `{ pageId }` 用于导航；TASK-020 后它也可以为尚未绑定的 checked source task line 创建、绑定并打开 `done` 任务页，且不写 completion/reopen event。TASK-020 当前在点击 checkbox 时调用 `runtime.commands.execute("task.toggle-status", { sourcePageId, sourceBlockId })`，返回 `{ pageId, status }`，写回 source marker、更新 `task.status`，并追加 `namespace: "task", type: "completed" | "reopened"` event。TASK-021 当前在调用 `runtime.commands.execute("tag.refresh-tags", { pageId })` 时扫描已保存 structured `markdown.line` source 并替换 `tag.tags`；`tag.add-tag` / `tag.remove-tag` 直接更新页面 scoped tag metadata；`tag.create-filter` 只保存 filter definition，不执行或渲染结果。`attrs.boundPageId` 是 source binding 数据，不是直接导航目标；malformed、伪造或不匹配值按未绑定/不可信处理。

当前显式点击导航完成后，用户在任务页继续写：

```markdown
- [ ] 子任务
```

TASK-019 可以用同样 click/open 流程创建或打开子任务页，因此任务可以显式无限嵌套。保存后自动扫描、Tag/Timer/UI/filter/view 刷新和 rich editor 行为仍属于后续任务。

这个架构的中心就是一句话：

> **Core 极小，Plugin 一等公民。所有产品能力都作为插件注册到 Core，而 Core 只维护 Markdown Page、Metadata、Event、Filter、View Registry、Command Registry 和 Plugin Host。**
