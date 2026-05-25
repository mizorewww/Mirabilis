# Markdown 编辑器与用户流程

整理用户在 Markdown 页面中创建任务、进入任务页、移动端输入、编辑元数据以及完整计时闭环的产品流程。

## 11. 用户核心操作：Markdown 页面中写任务

### 11.1 基础页面输入

用户打开一个 Markdown Page，输入：

```markdown
# 产品设计

文本123

- [ ] 设计快速收集箱

文本456

- [ ] 设计 Timer Plugin
```

界面渲染：

```text
# 产品设计

文本123

☐ 设计快速收集箱

文本456

☐ 设计 Timer Plugin
```

产品目标是 Task Plugin 识别两个 task block 并创建对应页面。
TASK-018 交付的是命令级创建切片：内置 `task` 插件注册 `- [ ]` 语法 descriptor，并在执行 `task.resolve-task-block` command 时创建或复用对应 Markdown Page。TASK-019 已交付显式点击打开切片：编辑器在 task syntax extension 存在且当前 Markdown 与结构化 body 快照一致时，把结构化 `markdown.line` task title 渲染为按钮；点击按钮执行 `task.open-task-page({ sourcePageId, sourceBlockId })`，并只打开 command 返回的 `{ pageId }`。TASK-020 已交付同一结构化 body 条件下的 checkbox status toggle。当前编辑器保存还不会自动扫描页面或自动调用 resolver/toggle command。

当 resolver 对这两个 source block 分别执行后，系统创建两个 Markdown Page：

```text
设计快速收集箱
设计 Timer Plugin
```

这两个页面都带有 metadata：

```text
task.enabled = true
task.status = todo
task.sourcePageId = 当前页面
task.sourceBlockId = 对应 block
```

---

### 11.2 点击任务文字进入对应页面

用户点击：

```text
设计 Timer Plugin
```

打开页面：

```markdown
# 设计 Timer Plugin

这里可以写任务说明、想法、资料。

- [ ] 定义 Time Segment
- [ ] 设计全局计时器
- [ ] 设计停止计时后的 Note
```

这些子任务也可以通过同一显式点击机制生成并打开对应页面。

当前 TASK-020 行为是：点击任务文字不会直接信任 `attrs.boundPageId`，而是把 source page/block 身份交给 `task.open-task-page`。Task Plugin 复用 source relation 行为，必要时创建或复用任务页，返回准确的 `{ pageId }`；App Shell/editor callback 只导航到这个返回值。点击 checkbox 会调用 `task.toggle-status({ sourcePageId, sourceBlockId })`，将 `- [ ]` 写为 `- [x]`，或将 `- [x]` / `- [X]` 写回 `- [ ]`，同步更新 `task.status` 并写 `namespace: "task", type: "completed" | "reopened"` event。`attrs.boundPageId` 是经过验证或恢复的 source binding 数据，不是受信任的导航目标；伪造、缺失或 malformed `boundPageId` 都会被视为未绑定/不可信。

保存后自动扫描新 task block、自动索引、timeline/note 计时闭环和富编辑器行为仍属于后续任务。TASK-022 已交付 All Tasks / Today 的 data-only filter execution 和 registered `page.list` 渲染 slice，但它还没有接入保存时自动刷新、全局 saved-filter navigation 或 app-shell filter route。TASK-024 已交付 Timer Plugin runtime commands、metadata Start control 和 global active bar，但不做 Time Segment persistence。

---

### 11.3 任务无限嵌套

无限嵌套来自以下规则：

```text
任何 Markdown Page 中出现 - [ ] xxx
Task Plugin 都会创建一个对应 Markdown Page
这个对应页面仍然是 Markdown Page
因此它内部还可以继续出现 - [ ] yyy
```

TASK-019 当前已支持显式点击/open 的无限嵌套：任一 Markdown Page 中的结构化 `markdown.line` task block 都可以通过 `task.open-task-page({ sourcePageId, sourceBlockId })` 创建或复用任务页；任务页本身仍是普通 Markdown Page，因此其中的 task block 可以继续用同一机制打开下一层页面。仍未实现的是保存时自动扫描/索引、视图刷新和过滤器聚合。

示例：

```markdown
# A

- [ ] B
```

点击 B：

```markdown
# B

- [ ] C
```

点击 C：

```markdown
# C

- [ ] D
```

系统得到：

```text
Page A
  contains task block B
Page B
  contains task block C
Page C
  contains task block D
```

All Tasks Filter 显示：

```text
A 如果它本身是任务页
B
C
D
```

---

## 12. Markdown-first 编辑器

### 12.1 编辑器主体验

编辑器要让用户“像写 Markdown 一样”操作。

核心输入语法：

```markdown
# 标题

普通文本

- [ ] 任务

- [x] 已完成任务

#tag

[[页面链接]]
```

用户可以一直写，不需要切换到表单模式。

TASK-016 交付 Markdown Editor Plugin shell：内置 `markdown` 插件注册页面编辑器 view、插入文本 command 和移动工具栏 slot；编辑器主体仍是受控 `<textarea>`。TASK-017 在这个 shell 下加入内部 Markdown import/export：编辑器继续显示用户输入的 Markdown 文本，保存时转成带稳定 `blockId` 的结构化 `markdown.line` blocks，重新打开时再导出为可见 Markdown。TASK-018 已提供 Task Plugin 的 command-level resolver；TASK-019 已提供结构化 body 上的 task-title 点击打开行为；TASK-020 已提供结构化 body 上的 checkbox status toggle。TASK-021 已提供 Tag Plugin 的 inert `tag.hashtag` syntax descriptor 和显式 `tag.refresh-tags({ pageId })` command，用来扫描已保存的 `markdown.line` blocks 并写入 `tag.tags` metadata。编辑器保存本身仍不会自动扫描 tag/task/page-link/date 语义；Date / Page Link 等识别、task 的保存时自动扫描、过滤视图和富编辑器行为，仍由后续插件或编辑器任务接管。

### 12.2 UI 只辅助插入语法

UI 不负责“创建任务表单”。
UI 负责帮助用户快速插入语法。

长期目标工具栏：

```text
☐   #   @date   [[ ]]   /
```

对应：

```text
☐      插入 - [ ]
#      插入 # 并打开 tag autocomplete
@date  插入 date token
[[ ]]  插入页面链接
/      打开轻量 command menu
```

TASK-016 基线工具栏只包含已经实现的三个纯文本 snippet：

```text
☐      插入 - [ ] <space>
#      插入 #
[[ ]]  插入 [[ ]]
```

这些按钮通过 `markdown.insert-text` command bus 插入文本。TASK-017 已交付稳定 block ID 和当前 textarea 支持样例的内部 Markdown import/export。
`@date`、tag autocomplete、page autocomplete、slash menu、富文本/块级编辑器行为、完整 CommonMark AST 往返、原生文件系统 Markdown import/export、以及自动 tag/page-link 语义行为都延后到后续插件或编辑器任务。TASK-021 的 tag 行为是显式命令驱动：调用 `tag.refresh-tags({ pageId })` 才会从已保存结构化 Markdown 刷新 `tag.tags`。

用户点击 `☐`，编辑器插入 `- [ ] `（末尾有空格）：

```markdown
- [ ]
```

用户继续写：

```markdown
- [ ] 写统计图插件
```

TASK-018 起，Task Plugin 可以在 command 层接管后续识别：调用 `task.resolve-task-block` 并传入 `{ sourcePageId, sourceBlockId }` 后，resolver 会从当前 unchecked source block 派生标题并创建或复用任务页。TASK-019 起，用户点击结构化 task title 时会调用 `task.open-task-page({ sourcePageId, sourceBlockId })`，该 command 返回 `{ pageId }` 供页面打开。TASK-020 起，用户点击结构化 checkbox 时会调用 `task.toggle-status({ sourcePageId, sourceBlockId })`，该 command 返回 `{ pageId, status }` 供编辑器更新可见 Markdown。编辑器保存本身仍只保存 Markdown 文本，不会自动调用这些 task commands。

---

## 13. 移动端输入

移动端保持同样语义。

用户点击快速输入：

```text
自动弹出键盘
底部出现工具栏：☐ # [[ ]]
```

用户点击 `☐`：

```markdown
- [ ]
```

用户输入：

```markdown
- [ ] 晚上整理机器学习预测插件 #ml
```

保存后：

```text
进入 Inbox Page
TASK-018 command-level resolver 可创建任务页面
TASK-021 可通过显式 tag.refresh-tags({ pageId }) 刷新 #ml 到 tag.tags
后续 Filter execution/rendering 更新
```

移动端不需要复杂任务创建表单。
所有输入仍然围绕 Markdown Page。

---

## 14. Metadata 图形化展示

长期目标中，任务页面顶部显示 metadata bar。

示例：

```text
todo · #product #timer · due Friday · scheduled Today · estimate 45m · tracked 2h10m · Start
```

这个 metadata bar 由多个插件共同贡献：

```text
Task Plugin: todo / due / scheduled / estimate
Tag Plugin: #product #timer
Timer Plugin: tracked 2h10m / Start
Habit Plugin: habit state
ML Plugin: predicted remaining time
Stats Plugin: estimate error
```

长期目标中，用户点击字段即可编辑：

```text
点击 todo         打开状态选择
点击 #product     打开 tag picker
点击 due Friday   打开日期选择器
点击 estimate     编辑预估时间
点击 tracked      打开 Time Segment 列表
点击 Start        开始计时
```

长期字段可以通过插件扩展。
完整形态中，新插件注册 metadata field + renderer + editor 后可出现在 metadata bar 中；TASK-023 还没有实现这个 renderer/editor registry。

TASK-023 当前交付的是窄的统一 metadata bar slice：

```text
Built-in plugin: metadata-ui
Export: MetadataBar
Composes: page.header.metadata slot contributions in SlotRegistry order
Mounting: reusable component only; production app-shell/editor mounting remains deferred unless a caller mounts it
```

字段 UI 仍由插件通过 slot contribution 提供：

```text
Task Plugin: read-only current metadata fields
Tag Plugin: existing inert #tag display plus add/remove controls
Timer Plugin: enabled Start control that executes timer.start
```

`MetadataBar` 只信任 active Plugin Host ownership data：字段 descriptor 必须来自 owner manifest、`namespace` 必须匹配 owner plugin id、`sourcePluginId` 必须匹配、stored `valueType` 必须匹配 descriptor，并且 namespace/key/valueType 必须安全有效。没有 Plugin Host ownership data 时，bar fail closed，不渲染 trusted field UI。slot component 只收到 `pageId`、contributing `pluginId`、trusted fields、trusted values 和 narrow `commands.execute` facade；`MetadataBar` 自己必须通过 owner-aware command descriptor lookup 验证 command 属于 contributing plugin，缺少 descriptor lookup 时 fail closed，不会按 command id prefix fallback。slot component 不会收到 full runtime、stores、registries、NativeBridge、filesystem 或 DB handles。

当前 Task Plugin 只显示这些 current fields，且都是 read-only：

```text
task.enabled
task.status
task.sourcePageId
task.sourceBlockId
task.scheduled
task.due
```

`task.estimate`、状态选择器、date picker、estimate editor、完整 tag picker polish、Timer tracked-total metadata、自动保存时扫描/索引和 app-shell/editor mounting 仍属于后续任务。TASK-025 当前提供 Timer-owned `page.timeline` segment/note slot，但不会默认完成 app-shell/editor broad mounting。Metadata values 通过 React text rendering 显示，unsafe strings 不会被当作 HTML、link、image 或 script 执行。

---

## 26. 用户完整操作流

### 26.1 写一个普通页面

用户写：

```markdown
# 时间管理 App

这个系统的核心是 Markdown Page + Plugin。

- [ ] 设计 Core
- [ ] 设计 Plugin 系统
- [ ] 设计 Timer Plugin
```

系统：

```text
Markdown Page 保存正文
TASK-017 结构化保存为带稳定 blockId 的 markdown.line blocks
TASK-018 在执行 task.resolve-task-block 时为指定 task block 创建或复用 Markdown Page
TASK-019 在点击结构化 task title 时执行 task.open-task-page 并打开返回的 pageId
TASK-020 在点击结构化 checkbox 时执行 task.toggle-status 并应用返回的 status
任务页写入 task.enabled、task.status、task.sourcePageId、task.sourceBlockId
source block 通过 attrs.boundPageId 绑定到任务页
TASK-022 可通过显式 filter execution 渲染 All Tasks / Today
后续任务负责自动扫描、全局 filter route 和 richer editor UI
```

### 26.2 进入任务页

用户点击：

```text
设计 Plugin 系统
```

打开：

```markdown
# 设计 Plugin 系统

Plugin 是一等公民。所有能力都通过 Plugin 接入。

- [ ] 设计 Manifest
- [ ] 设计 Command Registry
- [ ] 设计 View Registry
- [ ] 设计 Algorithm Registry
```

### 26.3 编辑元数据

页面顶部：

```text
todo · #architecture · estimate empty · tracked 0m · Start
```

用户点击 `#architecture`，添加：

```text
#plugin
```

metadata 更新：

```text
tags = ["architecture", "plugin"]
```

TASK-023 后，这类 Tag 更新仍由 Tag Plugin-owned slot 控件或命令完成，但可以在 `MetadataBar` 统一组合的 `page.header.metadata` 区域中出现。完整 picker 体验、其他插件字段编辑器和 app-shell/editor 默认挂载仍属于后续任务。

### 26.4 计时

TASK-025 当前，用户可以通过 `timer.page-header-metadata.placeholder` 中的 Start control 开始计时。这个 control 在 `page.header.metadata` 中渲染，通过 descriptor-owned scoped Timer command executor 执行 `timer.start({ pageId })`。

Timer Plugin 当前注册 canonical commands：

```text
timer.start
timer.stop
timer.pause
timer.resume
timer.switch
timer.add-note
```

当前 active timer 是 Timer Plugin-owned、registration-scoped、in-memory runtime state，不属于 Core/native persistence，也没有 schema-backed storage。`timer.start` 校验 exact `{ pageId }` payload 和页面存在性；如果已有 active timer，它会先追加 `timer.stopped`、再追加 `namespace: "timer"`、`type: "time_segment_created"` event，然后追加新页面的 `timer.started`，返回 `{ activeTimer, stoppedTimer, createdSegment }`。

`timer.switch({ pageId })` 也会在已有 active timer 时按同样顺序 finalize previous timer；`timer.stop()` 会追加 `timer.stopped`，再追加 `time_segment_created`，并清除 active state。

全局计时器：

```text
设计 Plugin 系统 · 00:00:01
Pause · Stop
```

Paused timer 会显示 Resume。`timer.global-active-bar` 注册在 `global.floating`，显示 active page title、elapsed time 和 Pause / Resume / Stop controls。

TASK-025 当前提供 stopped segment 的 Note workflow，不支持 active-timer inline note。

用户在 page timeline 对 stopped segment 点击 Add Note / Edit Note：

```text
要参考 Obsidian：manifest、lifecycle、commands、views、settings 都是插件贡献点。
```

点击 Stop 后生成 Time Segment event：

```text
10:00–10:47
Page: 设计 Plugin 系统
Note: 要参考 Obsidian...
```

Time Segment event payload 使用 camelCase `segmentId`、`pageId`、`startAt`、`endAt`、`durationSeconds`、`source: "timer"`，并省略缺失的 optional fields。Pause / Resume 的暂停时长不计入 `durationSeconds`。

当调用方挂载 `page.timeline` 时，Timer Plugin 的 `timer.page-timeline.segments` slot 会显示当前页面 Timer-owned segments 和 Note 文本。Note 文本通过 React text rendering inert 显示；Add Note / Edit Note UI 通过 `timer.add-note({ segmentId, markdown })` 为 stopped segment 创建或更新 Markdown Page note，并追加 `namespace: "timer"`、`type: "time_segment_note_added"` event，不会 mutate 原始 segment event。

TASK-026 当前 Calendar day/week 可以渲染调用方传入的 normalized `calendar.time-segments` DTO，并通过 `calendar.open-time-segment({ segmentId, pageId })` 打开 inert detail；Calendar 不直接通过 plugin-facing event facade 读取 Timer-owned events。TASK-028 当前 Stats 可以通过 `stats.run-aggregation` 聚合调用方传入的 normalized Timer/Habit/Task/Tag DTO。Calendar app-shell route/feed、Timer-to-Stats feed normalization、ML integration、Timer metadata totals、Recently Worked / Unnoted Sessions saved filters、manual segment editing、calendar drag/drop 和 native persistence/schema/Tauri/package/Rust changes 仍是后续范围。

---
