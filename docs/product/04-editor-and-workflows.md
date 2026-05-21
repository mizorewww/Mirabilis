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

保存后自动扫描新 task block、自动索引、All Tasks / Today 过滤视图、Tag/Timer UI 和富编辑器行为仍属于后续任务。

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
新插件只要注册 metadata field + renderer + editor，就可以出现在完整 metadata bar 中。

TASK-021 当前只交付 Tag Plugin 的窄 slot contribution：`tag.page-header-metadata.tags` 注册到 `page.header.metadata`，order 为 `300`，显示 inert `#tag` 文本并提供 add/remove 控件。控件执行 `tag.add-tag({ pageId, tag })` 和 `tag.remove-tag({ pageId, tag })`，写入页面 scoped `tag.tags` metadata。它不是 TASK-023 的完整 Metadata UI Plugin、全局 metadata bar 或完整 tag picker。

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
后续任务负责自动扫描、All Tasks Filter 更新和 richer editor UI
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

TASK-021 当前这类更新由 Tag Plugin slot 控件或命令完成；统一 metadata bar、picker 体验和其他插件字段编辑仍属于 TASK-023+。

### 26.4 计时

用户点击 Start。

全局计时器：

```text
设计 Plugin 系统 · 00:00:01
Pause · Stop · Note · Switch
```

计时中点击 Note：

```text
要参考 Obsidian：manifest、lifecycle、commands、views、settings 都是插件贡献点。
```

点击 Stop。

生成 Time Segment：

```text
10:00–10:47
Page: 设计 Plugin 系统
Note: 要参考 Obsidian...
```

Calendar 显示这段时间。
Stats 统计这段时间。
AI 周报可以总结这段 Note。
ML Plugin 可以用这段时间更新预测。

---
